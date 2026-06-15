import "server-only";
import { NextRequest, NextResponse } from "next/server";
import {
  getRefreshPayload,
  createSessionToken,
  createRefreshToken,
  SESSION,
  REFRESH,
} from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";
import { AdminUsersDB } from "@/lib/db/admin-users.db";
import { isSessionRevoked } from "@/lib/auth/session-revocation";

/**
 * POST /api/auth/refresh
 *
 * Rotate tokens: consume the current refresh token and issue a fresh
 * access + refresh pair.  The old refresh token becomes invalid because
 * it's replaced — this is "refresh token rotation" per OWASP guidelines.
 */
export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "auth:refresh");
  if (rateLimitResponse) return rateLimitResponse;

  const refreshToken = req.cookies.get(REFRESH.COOKIE_NAME)?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "no refresh token" }, { status: 401 });
  }

  const payload = await getRefreshPayload(refreshToken);
  if (!payload) {
    logger.warn("[auth/refresh] Invalid or expired refresh token", {
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    });
    // Clear stale cookies on invalid refresh
    const res = NextResponse.json({ error: "refresh token expired" }, { status: 401 });
    res.cookies.set(SESSION.COOKIE_NAME, "", { maxAge: 0, path: "/" });
    res.cookies.set(REFRESH.COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return res;
  }

  // ADR-133 follow-up: "cerrar todas las sesiones". Si el refresh token fue
  // emitido antes del corte de revocación masiva, NO rotar (sino re-emitiría un
  // access nuevo y la sesión sobreviviría). Limpiar cookies → sesión muerta.
  if (isSessionRevoked(payload.jti, payload.tenantId, payload.username)) {
    logger.warn("[auth/refresh] Refresh rejected — sessions revoked (logout-all)", {
      username: payload.username,
      tenantId: payload.tenantId,
    });
    const res = NextResponse.json({ error: "session revoked" }, { status: 401 });
    res.cookies.set(SESSION.COOKIE_NAME, "", { maxAge: 0, path: "/" });
    res.cookies.set(REFRESH.COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return res;
  }

  // SECURITY 2026-05-06 (pentest H007) + FIX 2026-06: jti rotation con ventana
  // de gracia. El blacklist evita REPLAY de un refresh token robado/viejo, pero
  // el cliente legítimamente dispara refresh CONCURRENTES al cargar (varios
  // hooks + React StrictMode double-mount). Sin gracia, el 2º request (mismo
  // jti, enviado antes de que llegue la cookie rotada) caía como "replay" → 401
  // + logout, rebotando al usuario a /login tras cada deploy/restart.
  // Fix: dentro de GRACE_MS desde el 1er consumo es un refresh concurrente
  // benigno → re-rota (re-emite par válido). Pasada la gracia = replay real → 401.
  // Tokens viejos sin jti (pre-fix) se aceptan una vez para back-compat.
  if (payload.jti) {
    const blacklistKey = `refresh-jti:consumed:${payload.jti}`;
    const GRACE_MS = 30_000;
    const consumedAt = cacheStore.get<number>(blacklistKey);
    if (typeof consumedAt === "number") {
      if (Date.now() - consumedAt > GRACE_MS) {
        logger.warn("[auth/refresh] jti replay attempt (beyond grace)", {
          username: payload.username,
          jti: payload.jti,
        });
        const res = NextResponse.json({ error: "refresh token already used" }, { status: 401 });
        res.cookies.set(SESSION.COOKIE_NAME, "", { maxAge: 0, path: "/" });
        res.cookies.set(REFRESH.COOKIE_NAME, "", { maxAge: 0, path: "/" });
        return res;
      }
      // Dentro de la ventana de gracia → refresh concurrente legítimo. NO
      // limpiar cookies ni bloquear; se re-rota abajo (par nuevo y válido).
      logger.debug("[auth/refresh] concurrent refresh within grace window", {
        username: payload.username,
        jti: payload.jti,
      });
    } else {
      // Primer consumo — marcar con timestamp (TTL 7 días, igual al refresh).
      cacheStore.set(blacklistKey, Date.now(), 7 * 24 * 60 * 60);
    }
  }

  // F4 — SECURITY 2026-05-07: verificar usuario activo antes de rotar.
  // Previene que cuentas desactivadas sigan renovando tokens indefinidamente.
  // Usa AdminUsersDB (wrapper con tenantId + cache + audit) — no prisma directo.
  try {
    const activeUser = await AdminUsersDB.getByUsername(payload.tenantId, payload.username);
    if (!activeUser || !activeUser.active) {
      logger.warn("[auth/refresh] Refresh rejected — user inactive or deleted", {
        username: payload.username,
        tenantId: payload.tenantId,
      });
      const res = NextResponse.json({ error: "Usuario no activo" }, { status: 401 });
      res.cookies.set(SESSION.COOKIE_NAME, "", { maxAge: 0, path: "/" });
      res.cookies.set(REFRESH.COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return res;
    }
  } catch (dbErr) {
    // Si la DB no está disponible, no bloquear — aceptar el token existente.
    // El riesgo es aceptable: el jti blacklist ya protege contra replay.
    logger.warn("[auth/refresh] DB check failed — proceeding with token rotation", {
      error: dbErr instanceof Error ? dbErr.message : String(dbErr),
    });
  }

  // Issue new token pair (rotation — old refresh is now replaced)
  const [newAccess, newRefresh] = await Promise.all([
    createSessionToken(payload.role, payload.username, payload.tenantId, payload.name ?? ""),
    createRefreshToken(payload.role, payload.username, payload.tenantId, payload.name ?? ""),
  ]);

  const response = NextResponse.json({
    ok: true,
    role: payload.role,
    username: payload.username,
    tenantId: payload.tenantId,
  });

  response.cookies.set(SESSION.COOKIE_NAME, newAccess, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: SESSION.MAX_AGE,
    path: "/",
  });

  response.cookies.set(REFRESH.COOKIE_NAME, newRefresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH.MAX_AGE,
    path: "/",
  });

  logger.info("[auth/refresh] Tokens rotated", {
    username: payload.username,
    tenantId: payload.tenantId,
  });

  return response;
}
