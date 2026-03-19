import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createPlatformToken, getPlatformSession, maybeRotateToken, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

// POST /api/superadmin/auth  – login { username, password }
// DELETE /api/superadmin/auth – logout
export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "AUTH", "superadmin:login");
  if (limited) return limited;

  let body: { username?: string; password?: string };
  try { body = await req.json(); } catch { body = {}; }

  const { username, password } = body;

  const expectedUser = process.env.SUPERADMIN_USERNAME ?? "platform";
  const expectedPass = process.env.SUPERADMIN_PASSWORD ?? "";

  if (
    !username || !password ||
    username !== expectedUser ||
    password !== expectedPass ||
    !expectedPass
  ) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const token = await createPlatformToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, token, cookieOpts(PLATFORM_SESSION.MAX_AGE));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, "", cookieOpts(0));
  return res;
}

// GET /api/superadmin/auth – session probe (200 ok / 401)
// Also rotates the token when past halfway of its lifetime
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const res = NextResponse.json({ ok: true, username: session.username });

  // Rotate token if past halfway point (silent refresh)
  const freshToken = await maybeRotateToken(token);
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
