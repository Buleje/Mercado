import "server-only";
import { NextResponse } from "next/server";
import { SettingsDB } from "@/lib/jsondb";
import { createSessionToken, createRefreshToken, createPendingTotpToken, SESSION, REFRESH, PENDING_TOTP_COOKIE } from "@/lib/session";
import type { AdminRole } from "@/lib/session";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { resolveTenantSlug } from "@/lib/resolve-tenant";
import fs from "fs/promises";
import path from "path";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";
import { AdminTotpDB } from "@/lib/db/admin-totp.db";

type LegacyAdminUser = { id: string; username: string; password: string; role: AdminRole; name: string };

// F2/F5 — dummy hash para igualación de timing side-channel.
//
// IMPORTANTE: este string NO es un hash bcrypt válido — es un dummy con
// formato bcrypt-compatible (prefijo $2a$10$) que se usa SOLO como input
// para bcrypt.compare() cuando el usuario no existe en DB. El propósito
// es igualar el tiempo de cómputo entre "usuario inexistente" (rápido)
// y "usuario válido + password incorrecto" (lento, bcrypt). Así un
// atacante NO puede enumerar usuarios midiendo response time.
//
// NO es secreto y NO debe usarse para almacenar nada — comparar contra
// él SIEMPRE devuelve false (ningún input genera ese hash). Si en el
// futuro alguien lo usa por error en otro contexto pensando que es un
// hash real, este comentario advierte.
const DUMMY_HASH = "$2a$10$dummyhashforsidechannelresistance0000000000000000";
// F1 — lockout per-username
const LOGIN_LOCKOUT_MAX = 5;
const LOGIN_LOCKOUT_TTL = 900; // 15 minutos en segundos

const LEGACY_FILE = path.join(process.cwd(), "local-data", "admin-users.json");

async function getLegacyUsers(): Promise<LegacyAdminUser[]> {
  try {
    return JSON.parse(await fs.readFile(LEGACY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

/** Check password against a stored value – only accepts valid bcrypt hashes (fail-closed). */
async function checkPassword(input: string, stored: string, username?: string): Promise<boolean> {
  if (
    stored.startsWith("$2a$") ||
    stored.startsWith("$2b$") ||
    stored.startsWith("$2y$")
  ) {
    return compare(input, stored);
  }
  logger.error("Invalid password hash format — rejecting authentication", { username });
  return false;
}

function makeAccessCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION.MAX_AGE,
    path: "/",
  };
}

function makeRefreshCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: REFRESH.MAX_AGE,
    path: "/",
  };
}

export async function POST(req: Request) {
  // Rate limit: 3 failed login attempts per hour (AUTH preset)
  const rateLimitResponse = applyRateLimit(req, "AUTH", "auth:login");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  /** Tenant resolved by edge middleware from the subdomain header. */
  const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
  let resolvedSlug = (await resolveTenantSlug(rawTenantId)) ?? "main";

  try {
  // Round 27 (security hardening): req.json() puede throw si body no es JSON
  // válido — devolver 400 explícito en lugar de fallar al catch externo (500).
  // Test descubrió que payloads malformados producían 500 (DoS signal).
  const body = await req.json().catch(() => null) as { username?: string; password?: string } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  // Step 1: Resolve slug → tenant ID (CUID).
  // Audit 2026-05-17 05-P1-4: si el slug NO resuelve a tenant DB → 400.
  // Antes, sin resolver, el findMany seguía buscando sin scope y dos tenants
  // con `qaadmin` + misma password permitían entrar al primer match.
  // Fail-closed: si el slug no existe, rechazar sin tocar el directorio de usuarios.
  let tenantId = resolvedSlug;
  let tenantResolvedToDb = false;
  try {
    // El hint (x-tenant-id) puede venir como slug ("mi-pollo") O como CUID
    // (cmoe...) si el middleware resolvió el subdominio a un ID. Probamos por
    // slug y, si no resuelve, por id. Fail-closed igual abajo.
    let tenant = await prisma.tenant.findUnique({
      where: { slug: resolvedSlug },
      select: { id: true, slug: true },
    });
    if (!tenant && rawTenantId && rawTenantId !== resolvedSlug) {
      tenant = await prisma.tenant.findUnique({
        where: { id: rawTenantId },
        select: { id: true, slug: true },
      });
    }
    if (tenant) {
      tenantId = tenant.id;
      // Normalizamos resolvedSlug al slug real → así `tenantResolved` (id !== slug)
      // queda TRUE y el findMany scopea correctamente al tenant (evita matchear
      // un username duplicado de otro tenant cuando el hint vino como CUID).
      resolvedSlug = tenant.slug;
      tenantResolvedToDb = true;
    }
  } catch { /* DB unavailable — keep slug as-is, validate below */ }

  if (!tenantResolvedToDb) {
    logger.warn("[auth/login] Refusing login — slug does not resolve to tenant DB", {
      resolvedSlug,
      ip: req.headers.get("x-forwarded-for") ?? "unknown",
    });
    return NextResponse.json(
      { error: "tenant_invalid", message: "El tenant indicado no existe o no está disponible." },
      { status: 400 },
    );
  }

  // F1 — SECURITY 2026-05-07: lockout per-username (brute-force con IP rotation).
  // El counter se almacena en cacheStore con TTL 900s (15 min).
  const lockKey = `loginAttempts:${username}:${tenantId}`;
  const currentAttempts = cacheStore.get<number>(lockKey) ?? 0;
  if (currentAttempts >= LOGIN_LOCKOUT_MAX) {
    logger.warn("[auth/login] Username locked out", { username, tenantId, attempts: currentAttempts });
    return NextResponse.json(
      { error: "Demasiados intentos fallidos. Intenta en 15 minutos." },
      { status: 429, headers: { "Retry-After": String(LOGIN_LOCKOUT_TTL) } },
    );
  }

  // SECURITY 2026-05-06 (pentest H005): scope tenant siempre que sea posible.
  // Si tenemos tenantId resuelto del header/slug, BUSCAR SOLO en ese tenant.
  // Antes: findMany global → primer match ganaba aunque viniera de otro
  // tenant (race entre N hashes que matcheaban con la misma contraseña).
  type DbUser = { username: string; passwordHash: string; role: string; name: string; tenantId: string; onboardingCompletedAt: Date | null };
  let dbUsers: DbUser[] = [];
  const tenantResolved = tenantId !== resolvedSlug; // CUID vs slug literal
  try {
    dbUsers = await prisma.adminUser.findMany({
      where: {
        active: true,
        ...(username ? { username } : {}),
        ...(tenantResolved ? { tenantId } : {}),
      },
      select: { username: true, passwordHash: true, role: true, name: true, tenantId: true, onboardingCompletedAt: true },
      take: tenantResolved ? 5 : 50, // si scopeado, basta poco; sin scope, cap genérico
    });
  } catch { /* DB unavailable */ }

  // BUG FIX 2026-05-05: si el cliente envió hint slug (x-tenant-id) y existe
  // un usuario para ESE tenant, lo priorizamos. Antes el primer match ganaba
  // y si qaadmin existía en "main" Y en "mi-pollo", el login desde
  // /t/mi-pollo/admin/login devolvía JWT con tenantId="main" → admin no veía
  // sus propios pedidos.
  if (dbUsers.length > 1 && tenantId !== resolvedSlug) {
    // tenantId aquí es el CUID del slug hint
    dbUsers = [
      ...dbUsers.filter((u) => u.tenantId === tenantId),
      ...dbUsers.filter((u) => u.tenantId !== tenantId),
    ];
  } else if (dbUsers.length > 1) {
    // tenantId === resolvedSlug (no se encontró tenant en DB) — match por slug
    dbUsers = [
      ...dbUsers.filter((u) => u.tenantId === resolvedSlug),
      ...dbUsers.filter((u) => u.tenantId !== resolvedSlug),
    ];
  }

  // F2 — SECURITY 2026-05-07: timing-constant con Promise.all + padding de dummies.
  // Siempre comparamos contra TARGET_USERS hashes en paralelo para que el
  // tiempo de respuesta no filtre si el username existe en la DB.
  // F5 — Si dbUsers está vacío (username inexistente), igualmente se hace
  // compare contra DUMMY_HASH para igualar timing al caso "usuario real, pass incorrecto".
  const TARGET_USERS = 50;
  type PaddedUser = DbUser & { __dummy?: true };
  const padded: PaddedUser[] = [...dbUsers];
  while (padded.length < TARGET_USERS) {
    padded.push({
      username: "dummy",
      passwordHash: DUMMY_HASH,
      role: "admin",
      name: "dummy",
      tenantId: "dummy",
      onboardingCompletedAt: null,
      __dummy: true,
    });
  }
  const compareResults = await Promise.all(
    padded.map((u) => checkPassword(password, u.passwordHash, u.username).catch(() => false)),
  );
  const matchIdx = compareResults.findIndex((r, i) => r && !padded[i].__dummy);
  const matchedUser: PaddedUser | null = matchIdx >= 0 ? padded[matchIdx] : null;

  if (matchedUser) {
    const u = matchedUser;
    // Resetear lockout en éxito
    cacheStore.del(lockKey);

    const matchedTenantId = u.tenantId;

    // F2 — SECURITY 2026-05-07: verificar si el usuario tiene 2FA activo.
    // Si totpEnabledAt está seteado, NO emitir tokens de sesión completos —
    // en su lugar emitir cookie temporal `pending-totp` (5 min, rol restringido)
    // y retornar { requires2FA: true } para que el frontend redirija a /login/2fa.
    const totpRecord = await AdminTotpDB.getByUsername(matchedTenantId, u.username).catch((err) => { logger.warn("[security] op failed", { err: String(err) }); return null; });
    if (totpRecord?.totpEnabledAt) {
      const pendingToken = await createPendingTotpToken(
        u.username,
        matchedTenantId,
        u.name,
        u.role as AdminRole,
      );
      const res = NextResponse.json({ requires2FA: true });
      res.cookies.set(PENDING_TOTP_COOKIE, pendingToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 300, // 5 minutos
        path: "/",
      });
      logger.info("[auth/login] 2FA required — pending-totp cookie emitida", {
        username: u.username,
        tenantId: matchedTenantId,
      });
      return res;
    }

    const [token, refreshToken] = await Promise.all([
      createSessionToken(u.role as AdminRole, u.username, matchedTenantId, u.name),
      createRefreshToken(u.role as AdminRole, u.username, matchedTenantId, u.name),
    ]);
    const onboardingPending = !u.onboardingCompletedAt;
    // Buscar el slug del tenant matcheado (para active-tenant-slug cookie y redirect)
    let tenantSlug = resolvedSlug;
    try {
      const t = await prisma.tenant.findFirst({
        where: { OR: [{ id: matchedTenantId }, { slug: matchedTenantId }] },
        select: { slug: true },
      });
      if (t) tenantSlug = t.slug;
    } catch { /* use resolvedSlug */ }

    const response = NextResponse.json({ ok: true, role: u.role, name: u.name, onboardingPending, tenantId: matchedTenantId, tenantSlug });
    response.cookies.set(SESSION.COOKIE_NAME, token, makeAccessCookie());
    response.cookies.set(REFRESH.COOKIE_NAME, refreshToken, makeRefreshCookie());
    response.cookies.set("active-tenant", matchedTenantId, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", httpOnly: false });
    response.cookies.set("active-tenant-slug", tenantSlug, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", httpOnly: false });

    // COMPLIANCE 2026-05-06 (audit Ley 29733 #4): trazar login exitoso.
    // Art. 18: "quién accedió". Antes solo loggábamos fallos.
    // Fire-and-forget — no bloquear la respuesta.
    try {
      const { logActivity } = await import("@/lib/activity-logger");
      // Brandon 2026-05-16 (audit P2 log poisoning): trim al 1er IP de la
      // lista xff (Vercel agrega varios proxies en chain) + slice(0,45)
      // para evitar que un atacante inyecte comas o strings largos que
      // contaminen los logs de auditoría Ley 29733.
      const ipRaw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? req.headers.get("x-real-ip")
        ?? null;
      const ip = ipRaw ? ipRaw.slice(0, 45) : null;
      logActivity(
        "login_success",
        "admin",
        `Login exitoso (${u.role}) desde tenant ${tenantSlug}`,
        u.username,
        u.username,
      ).catch((err: unknown) => {
        logger.error("[auth/login] logActivity failed", { err: err instanceof Error ? err.message : String(err) });
      });
      void ip;
    } catch { /* logger not available in edge */ }

    return response;
  }

  // Falló el compare: incrementar lockout counter (solo si username es real, no dummy relleno)
  if (dbUsers.length > 0) {
    cacheStore.set(lockKey, currentAttempts + 1, LOGIN_LOCKOUT_TTL);
  }

  // ── Fallback: legacy admin-users.json + Settings.adminPassword ───────────────
  // SECURITY 2026-05-07 (pentest F3): estos fallbacks solo están activos si
  // LEGACY_LOGIN=1 en el entorno. En producción LEGACY_LOGIN debe estar AUSENTE
  // o vacío — los fallbacks quedan desactivados por defecto (fail-closed).
  if (process.env.LEGACY_LOGIN === "1") {
    logger.warn("[auth/login] LEGACY_LOGIN active — security degraded mode", { tenantId, username });

    // Fallback 1: admin-users.json (ventana de migración)
    if (dbUsers.length === 0) {
      const legacyUsers = await getLegacyUsers();
      const candidates = username ? legacyUsers.filter((u) => u.username === username) : legacyUsers;
      for (const u of candidates) {
        if (await checkPassword(password, u.password, u.username)) {
          const [token, refreshToken] = await Promise.all([
            createSessionToken(u.role, u.username, tenantId, u.name),
            createRefreshToken(u.role, u.username, tenantId, u.name),
          ]);
          const response = NextResponse.json({ ok: true, role: u.role, name: u.name });
          response.cookies.set(SESSION.COOKIE_NAME, token, makeAccessCookie());
          response.cookies.set(REFRESH.COOKIE_NAME, refreshToken, makeRefreshCookie());
          response.cookies.set("active-tenant", tenantId, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", httpOnly: false });
          return response;
        }
      }
    }

    // Fallback 2: Settings.adminPassword
    try {
      const settings = await SettingsDB.get(tenantId);
      const adminPassword = settings.adminPassword;
      if (adminPassword && await checkPassword(password, adminPassword, "admin")) {
        const [token, refreshToken] = await Promise.all([
          createSessionToken("admin", "admin", tenantId, "Administrador"),
          createRefreshToken("admin", "admin", tenantId, "Administrador"),
        ]);
        const response = NextResponse.json({ ok: true, role: "admin", name: "Administrador" });
        response.cookies.set(SESSION.COOKIE_NAME, token, makeAccessCookie());
        response.cookies.set(REFRESH.COOKIE_NAME, refreshToken, makeRefreshCookie());
        response.cookies.set("active-tenant", tenantId, { path: "/", maxAge: 7 * 24 * 60 * 60, sameSite: "lax", httpOnly: false });
        return response;
      }
    } catch {
      // Settings DB unavailable — skip this fallback
    }
  }

  logger.warn("[auth/login] Failed authentication attempt", { username, tenantId });
  return NextResponse.json({ error: "incorrect credentials" }, { status: 401 });
  } catch (e) {
    logger.error("[auth/login] Unhandled error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

