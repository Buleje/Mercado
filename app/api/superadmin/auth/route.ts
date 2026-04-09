import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createPlatformToken, getPlatformSession, maybeRotateToken, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { is2FAEnabled, create2FAChallenge, verify2FACode } from "@/lib/superadmin-2fa";

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

// POST /api/superadmin/auth  – login { username, password } or verify 2FA { challengeId, code }
// DELETE /api/superadmin/auth – logout
export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "AUTH", "superadmin:login");
  if (limited) return limited;

  let body: { username?: string; password?: string; challengeId?: string; code?: string };
  try { body = await req.json(); } catch { body = {}; }

  // ── Step 2: Verify 2FA code ──────────────────────────────────────────────
  if (body.challengeId && body.code) {
    const result = verify2FACode(body.challengeId, body.code);
    if (!result.valid || !result.username) {
      logActivity("2fa_failed", "superadmin", `2FA fallido: challengeId=${body.challengeId}`, undefined, "superadmin").catch(() => {});
      return NextResponse.json({ error: "Código inválido o expirado" }, { status: 401 });
    }
    const token = await createPlatformToken(result.username);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, token, cookieOpts(PLATFORM_SESSION.MAX_AGE));
    logActivity("login_success", "superadmin", `Login exitoso con 2FA: ${result.username}`, undefined, "superadmin").catch(() => {});
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
    logActivity("login_failed", "superadmin", `Intento fallido: ${username || "(vacío)"}`, undefined, "superadmin").catch(() => {});
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  // If 2FA is enabled, generate challenge instead of granting session
  if (is2FAEnabled()) {
    const { challengeId } = create2FAChallenge(username);
    logActivity("2fa_challenge", "superadmin", `Código 2FA enviado a ${username}`, undefined, "superadmin").catch(() => {});
    return NextResponse.json({ requires2FA: true, challengeId });
  }

  // No 2FA — grant session directly
  const token = await createPlatformToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, token, cookieOpts(PLATFORM_SESSION.MAX_AGE));
  logActivity("login_success", "superadmin", `Login exitoso: ${username}`, undefined, "superadmin").catch(() => {});
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLATFORM_SESSION.COOKIE_NAME, "", cookieOpts(0));
  logActivity("logout", "superadmin", "SuperAdmin cerró sesión", undefined, "superadmin").catch(() => {});
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
