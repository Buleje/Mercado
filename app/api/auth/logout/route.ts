import { NextRequest, NextResponse } from "next/server";
import { SESSION, REFRESH, getSessionPayload } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { cacheStore } from "@/lib/cache";

// TTL del access token en segundos (15 min) — la blacklist expira junto con el token.
const ACCESS_TTL_SEC = 15 * 60;

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "auth-logout"); if (_rl) return _rl;

  // SECURITY 2026-05-07 (pentest F1): revocar el access token por jti para
  // invalidar inmediatamente tokens en vuelo aunque tengan firma válida.
  const accessToken = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (accessToken) {
    const payload = await getSessionPayload(accessToken);
    if (payload?.jti) {
      cacheStore.set(`revoked-access:${payload.jti}`, true, ACCESS_TTL_SEC);
    }
  }

  const response = NextResponse.json({ ok: true });
  // Clear both access and refresh tokens
  response.cookies.set(SESSION.COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  response.cookies.set(REFRESH.COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
