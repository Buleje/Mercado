import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createPlatformToken, getPlatformSession, maybeRotateToken, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { is2FAEnabled, create2FAChallenge, verify2FACode } from "@/lib/superadmin-2fa";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

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
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const failedAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil: number | null }>();

function getLockoutKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

function checkLockout(ip: string): { locked: boolean; remainingMinutes: number } {
  const entry = failedAttempts.get(ip);
  if (!entry) return { locked: false, remainingMinutes: 0 };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return { locked: true, remainingMinutes: remaining };
  }
  // Reset if lockout expired
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    failedAttempts.delete(ip);
  }
  return { locked: false, remainingMinutes: 0 };
}

function recordFailedAttempt(ip: string): { locked: boolean; attemptsLeft: number } {
  const entry = failedAttempts.get(ip) ?? { count: 0, lastAttempt: 0, lockedUntil: null };
  entry.count += 1;
  entry.lastAttempt = Date.now();

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    failedAttempts.set(ip, entry);
    return { locked: true, attemptsLeft: 0 };
  }

  failedAttempts.set(ip, entry);
  return { locked: false, attemptsLeft: MAX_ATTEMPTS - entry.count };
}

function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

// ── WhatsApp login alert (fire-and-forget) ──────────────────────────────────
function notifyLoginWhatsApp(user: string, ip: string): void {
  const phone = process.env.SUPERADMIN_PHONE;
  if (!phone) return;
  const now = new Date().toLocaleString("es-PE", { timeZone: "America/Lima" });
  const msg = `🔐 *Alerta de seguridad — Buleje*\n\nSe inició sesión como SuperAdmin.\n👤 Usuario: ${user}\n🌐 IP: ${ip}\n🕐 Fecha: ${now}\n\nSi no fuiste tú, cambia tu contraseña de inmediato.`;
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

  if (
    !username || !password ||
    username !== expectedUser ||
    password !== expectedPass ||
    !expectedPass
  ) {
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

export async function DELETE() {
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
    res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, freshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PLATFORM_SESSION.MAX_AGE,
    });
  }

  return res;
}
