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
import { anotarSucesor, anularSucesores, decidirReuso } from "@/lib/auth/refresh-sucesor";

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

  // SECURITY 2026-05-06 (pentest H007) + FIX 2026-06 + 2026-10-09: rotación con
  // detección de reuso. Gracia de 30 s para pedidos simultáneos (varios hooks,
  // StrictMode). Fuera de la gracia, si NINGÚN token emitido a partir de éste se
  // usó todavía, la respuesta anterior se perdió (reinicio del servidor, 4G que
  // se corta, recarga a mitad): se rota otra vez y se anulan esos sucesores sin
  // usar. Si alguno ya se usó, hay dos copias → replay real → 401 (ver
  // lib/auth/refresh-sucesor.ts). Tokens viejos sin jti se aceptan una vez.
  let anularTrasRotar: string[] = [];
  if (payload.jti) {
    const decision = decidirReuso(cacheStore, payload.jti, Date.now());
    if (decision.tipo === "robo") {
      logger.warn("[auth/refresh] jti replay attempt (beyond grace, successor already used)", {
        username: payload.username,
        jti: payload.jti,
      });
      const res = NextResponse.json({ error: "refresh token already used" }, { status: 401 });
      res.cookies.set(SESSION.COOKIE_NAME, "", { maxAge: 0, path: "/" });
      res.cookies.set(REFRESH.COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return res;
    }
    if (decision.tipo === "respuesta-perdida") {
      logger.warn("[auth/refresh] lost rotation response — re-rotating, unused successors voided", {
        username: payload.username,
        jti: payload.jti,
        anulados: decision.anular.length,
      });
      anularTrasRotar = decision.anular;
    } else if (decision.tipo === "concurrente") {
      logger.debug("[auth/refresh] concurrent refresh within grace window", {
        username: payload.username,
        jti: payload.jti,
      });
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

  // Anotar el sucesor (para distinguir respuesta perdida de robo) y anular los
  // que se emitieron y nunca llegaron al navegador.
  if (payload.jti) {
    const nuevo = await getRefreshPayload(newRefresh);
    if (nuevo?.jti) anotarSucesor(cacheStore, payload.jti, nuevo.jti);
    if (anularTrasRotar.length) anularSucesores(cacheStore, anularTrasRotar);
  }

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
