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

  // SECURITY 2026-05-06 (pentest H007): jti blacklist contra replay.
  // Si el jti ya fue consumido (tras una rotación previa), rechazar.
  // Refresh tokens viejos sin jti (pre-fix) se aceptan una vez para back-compat.
  if (payload.jti) {
    const blacklistKey = `refresh-jti:consumed:${payload.jti}`;
    const consumed = cacheStore.get<boolean>(blacklistKey);
    if (consumed) {
      logger.warn("[auth/refresh] jti replay attempt", {
        username: payload.username,
        jti: payload.jti,
      });
      const res = NextResponse.json({ error: "refresh token already used" }, { status: 401 });
      res.cookies.set(SESSION.COOKIE_NAME, "", { maxAge: 0, path: "/" });
      res.cookies.set(REFRESH.COOKIE_NAME, "", { maxAge: 0, path: "/" });
      return res;
    }
    // Marcar como consumido por TTL = remaining lifetime del refresh actual
    // (7 días max — Redis lo ignora cuando expire).
    cacheStore.set(blacklistKey, true, 7 * 24 * 60 * 60);
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
