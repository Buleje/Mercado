import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createPlatformToken, getPlatformSession, maybeRotateToken, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { is2FAEnabled, create2FAChallenge, verify2FACode } from "@/lib/superadmin-2fa";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

// ── Login lockout (5 failed attempts → 15 min lockout) ──────────────────────
// Brandon 2026-05-16 (audit P2/P1): migrado de `Map<>` in-memory a cacheStore.
// Antes el lockout vivía en memoria del worker — Vercel serverless tiene N
// workers sin estado compartido, un atacante con 5+ instancias bypasseaba
// el lockout. Ahora cacheStore (Redis si REDIS_URL, fallback MemoryStore)
// compartido entre workers. El edge rate-limit Upstash sigue siendo la 1ra
// línea de defensa; este es defensa-en-profundidad.
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_KEY_TTL_SEC = Math.ceil((LOCKOUT_DURATION_MS + 60_000) / 1000); // +1min margin

interface LockoutEntry {
  count: number;
  lastAttempt: number;
  lockedUntil: number | null;
}

function lockoutCacheKey(ip: string): string {
  return `superadmin:lockout:${ip}`;
}

function getLockoutKey(req: NextRequest): string {
  // SECURITY 2026-05-16 (audit P2): trim + slice para evitar log poisoning
  // por inyección de comas en x-forwarded-for.
  const raw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  return raw.slice(0, 45);
}

function checkLockout(ip: string): { locked: boolean; remainingMinutes: number } {
  const entry = cacheStore.get<LockoutEntry>(lockoutCacheKey(ip));
  if (!entry) return { locked: false, remainingMinutes: 0 };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return { locked: true, remainingMinutes: remaining };
  }
  // Reset if lockout expired
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    cacheStore.del(lockoutCacheKey(ip));
  }
  return { locked: false, remainingMinutes: 0 };
}

function recordFailedAttempt(ip: string): { locked: boolean; attemptsLeft: number } {
  const key = lockoutCacheKey(ip);
  const entry = cacheStore.get<LockoutEntry>(key) ?? { count: 0, lastAttempt: 0, lockedUntil: null };
  entry.count += 1;
  entry.lastAttempt = Date.now();

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    cacheStore.set(key, entry, LOCKOUT_KEY_TTL_SEC);
    return { locked: true, attemptsLeft: 0 };
  }

  cacheStore.set(key, entry, LOCKOUT_KEY_TTL_SEC);
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - entry.count };
}

function clearFailedAttempts(ip: string): void {
  cacheStore.del(lockoutCacheKey(ip));
}

// ── WhatsApp login alert (fire-and-forget) ──────────────────────────────────
/**
 * Audit P2 #2 (2026-05-19): sanitizar IP antes de inyectarla en el mensaje WA.
 * Sin esto, un atacante con cabecera `x-forwarded-for: <emoji+link>` podría
 * hacer log-poisoning sobre el WhatsApp del dueño (mensaje con emojis
 * arbitrarios o caracteres de control). Lockout ya truncaba a 45 chars en
 * el rate-limit pero `notify` no lo hacía.
 *
 * Sanitización: solo IPv4/IPv6 válidos. Si la entrada no matchea, devolvemos
 * "(sin IP)" — el alert sigue siendo útil sin la IP exacta.
 */
function sanitizeIp(ip: string | null | undefined): string {
  if (!ip) return "(sin IP)";
  const trimmed = ip.trim();
  // IPv4 estricto: 4 grupos de 0-3 dígitos
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    const parts = trimmed.split(".").map(Number);
    if (parts.every((n) => n >= 0 && n <= 255)) return trimmed;
  }
  // IPv6 (incluye ::, ::1, ::ffff:127.0.0.1, etc.) — solo hex + ":" + "."
  if (/^[0-9a-fA-F:.]{2,45}$/.test(trimmed)) return trimmed;
  return "(IP inválida)";
}

function notifyLoginWhatsApp(user: string, ip: string): void {
  const phone = process.env.SUPERADMIN_PHONE;
  if (!phone) return;
  const safeIp = sanitizeIp(ip);
  // Sanitiza también el username (debería estar limpio por la validación de
  // login pero defense-in-depth) — solo alfanuméricos y guiones, max 32 chars.
  const safeUser = user.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "(?)";
  const now = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });
  const msg = `🔐 *Alerta de seguridad — Buleje*\n\nSe inició sesión como SuperAdmin.\n👤 Usuario: ${safeUser}\n🌐 IP: ${safeIp}\n🕐 Fecha: ${now}\n\nSi no fuiste tú, cambia tu contraseña de inmediato.`;
  sendWhatsAppQueued(phone, msg, { tenantId: "__platform__", context: "superadmin-login-alert" }).catch((err) => logger.error("[superadmin/auth] login alert failed", { error: String(err) }));
}

// Mensaje de error genérico para login/2FA. NO diferencia "usuario inexistente"
// vs "password incorrecto" vs "código 2FA inválido". Esto bloquea ataques de
// enumeración de usuarios y reduce la información que un atacante obtiene en
// cada intento.
const GENERIC_AUTH_ERROR = "Credenciales inválidas";

// Padding constante en login fallido para mitigar timing attacks que
// distinguen entre "usuario inexistente" (rápido) y "usuario válido +
// password incorrecto" (lento, bcrypt). Forzamos siempre ≥350 ms.
async function constantTimeFloor(start: number, minMs = 350): Promise<void> {
  const elapsed = Date.now() - start;
  if (elapsed < minMs) {
    await new Promise((r) => setTimeout(r, minMs - elapsed));
  }
}

// POST /api/superadmin/auth  – login { username, password } or verify 2FA { challengeId, code }
// DELETE /api/superadmin/auth – logout
export async function POST(req: NextRequest) {
  const startTs = Date.now();
  const limited = applyRateLimit(req, "AUTH", "superadmin:login");
  if (limited) return limited;

  // ── Lockout check ─────────────────────────────────────────────────────────
  // BSM_QA_NO_LOCKOUT=1 → bypass del lockout (solo dev/QA, NUNCA en prod).
  const qaBypass = process.env.BSM_QA_NO_LOCKOUT === "1" && process.env.NODE_ENV !== "production";
  const ip = getLockoutKey(req);
  const userAgent = req.headers.get("user-agent");
  const lockout = qaBypass ? { locked: false, remainingMinutes: 0 } : checkLockout(ip);
  if (lockout.locked) {
    logActivity("login_locked", "superadmin", `IP bloqueada por ${lockout.remainingMinutes} min: ${ip}`, undefined, "superadmin").catch((err) => logger.error("[superadmin/auth] activity log failed", { error: String(err) }));
    return NextResponse.json(
      { error: `Demasiados intentos fallidos. Intente en ${lockout.remainingMinutes} minutos.` },
      { status: 429 }
    );
  }

  let body: { username?: string; password?: string; challengeId?: string; code?: string; honeypot?: string };
  try { body = await req.json(); } catch { body = {}; }

  // ── Honeypot: el form humano deja `honeypot` vacío. Si llega con valor,
  // es un bot — devolvemos error genérico tras delay para no revelar el
  // mecanismo de detección.
  if (typeof body.honeypot === "string" && body.honeypot.trim() !== "") {
    logActivity("login_honeypot", "superadmin", `Bot detectado vía honeypot desde IP ${ip}`, undefined, "superadmin").catch((err) => logger.error("[superadmin/auth] activity log failed", { error: String(err) }));
    recordFailedAttempt(ip);
    await constantTimeFloor(startTs);
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  // ── Step 2: Verify 2FA code ──────────────────────────────────────────────
  if (body.challengeId && body.code) {
    const result = await verify2FACode(body.challengeId, body.code);
    if (!result.valid || !result.username) {
      const lockResult = recordFailedAttempt(ip);
      logActivity("2fa_failed", "superadmin", `2FA fallido: challengeId=${body.challengeId} desde IP ${ip}. Intentos restantes: ${lockResult.attemptsLeft}`, undefined, "superadmin").catch((err) => logger.error("[superadmin/auth] activity log failed", { error: String(err) }));
      await constantTimeFloor(startTs);
      if (lockResult.locked) {
        return NextResponse.json({ error: "Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos." }, { status: 429 });
      }
      return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    clearFailedAttempts(ip);
    const token = await createPlatformToken(result.username, userAgent);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, token, cookieOpts(PLATFORM_SESSION.MAX_AGE));
    logActivity("login_success", "superadmin", `Login exitoso con 2FA: ${result.username} desde IP ${ip} ua="${(userAgent ?? "").slice(0, 80)}"`, undefined, "superadmin").catch((err) => logger.error("[superadmin/auth] activity log failed", { error: String(err) }));
    notifyLoginWhatsApp(result.username, ip);
    return res;
  }

  // ── Step 1: Verify username + password ───────────────────────────────────
  const { username, password } = body;

  const expectedUser = process.env.SUPERADMIN_USERNAME ?? "platform";
  const expectedPass = process.env.SUPERADMIN_PASSWORD ?? "";

  // SECURITY 2026-05-06 (pentest H004): timing-safe compare. Antes
  // password !== expectedPass era timing leak — diff en string compare
  // permitía byte-by-byte attack en N requests.
  const userMatch = username === expectedUser;
  let passMatch = false;
  if (expectedPass && password) {
    const a = Buffer.from(password);
    const b = Buffer.from(expectedPass);
    if (a.length === b.length) {
      const { timingSafeEqual } = await import("crypto");
      passMatch = timingSafeEqual(a, b);
    }
  }

  if (!username || !password || !userMatch || !passMatch || !expectedPass) {
    const lockResult = recordFailedAttempt(ip);
    logActivity("login_failed", "superadmin", `Intento fallido: ${username || "(vacío)"} desde IP ${ip}. Intentos restantes: ${lockResult.attemptsLeft}`, undefined, "superadmin").catch((err) => logger.error("[superadmin/auth] activity log failed", { error: String(err) }));
    await constantTimeFloor(startTs);
    if (lockResult.locked) {
      return NextResponse.json({ error: "Demasiados intentos fallidos. Cuenta bloqueada por 15 minutos." }, { status: 429 });
    }
    return NextResponse.json({ error: GENERIC_AUTH_ERROR }, { status: 401 });
  }

  // Credentials valid — clear lockout counter
  clearFailedAttempts(ip);

  // If 2FA is enabled, generate challenge instead of granting session
  if (is2FAEnabled()) {
    const { challengeId } = create2FAChallenge(username);
    logActivity("2fa_challenge", "superadmin", `Código 2FA enviado a ${username}`, undefined, "superadmin").catch((err) => logger.error("[superadmin/auth] activity log failed", { error: String(err) }));
    return NextResponse.json({ requires2FA: true, challengeId });
  }

  // No 2FA — grant session directly
  const token = await createPlatformToken(username, userAgent);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, token, cookieOpts(PLATFORM_SESSION.MAX_AGE));
  logActivity("login_success", "superadmin", `Login exitoso: ${username} desde IP ${ip} ua="${(userAgent ?? "").slice(0, 80)}"`, undefined, "superadmin").catch((err) => logger.error("[superadmin/auth] activity log failed", { error: String(err) }));
  notifyLoginWhatsApp(username, ip);
  return res;
}

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-auth-logout"); if (_rl) return _rl;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, "", cookieOpts(0));
  logActivity("logout", "superadmin", "SuperAdmin cerró sesión", undefined, "superadmin").catch((err) => logger.error("[superadmin/auth] activity log failed", { error: String(err) }));
  return res;
}

// GET /api/superadmin/auth – session probe (200 ok / 401)
// Also rotates the token when past halfway of its lifetime
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  const ua = req.headers.get("user-agent");
  const session = await getPlatformSession(token, { ua });
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const res = NextResponse.json({ ok: true, username: session.username });

  // Rotate token if past halfway point (silent refresh)
  const freshToken = await maybeRotateToken(token, { ua });
  if (freshToken) {
    // SECURITY 2026-05-26 (P1-1): usar cookieOpts (sameSite:strict) igual que el
    // login. La rotación quedaba en lax — inconsistente y más débil ante CSRF
    // en la superficie de máximo privilegio (superadmin).
    res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, freshToken, cookieOpts(PLATFORM_SESSION.MAX_AGE));
  }

  return res;
}
