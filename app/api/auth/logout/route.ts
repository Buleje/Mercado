import { NextRequest, NextResponse } from "next/server";
import { SESSION, REFRESH } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "auth-logout"); if (_rl) return _rl;
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
