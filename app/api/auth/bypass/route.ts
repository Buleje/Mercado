export const dynamic = 'force-dynamic'
import "server-only";
import { NextResponse } from "next/server";
import { createSessionToken, SESSION } from "@/lib/session";

/**
 * SECURITY: Bypass login endpoint.
 * Only available in development. Returns 404 in production (as if it doesn't exist).
 */
export async function POST() {
  // CRITICAL: Block in production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    console.warn("[SECURITY] Bypass login used in development mode");
    const token = await createSessionToken("admin", "Invitado");
    const response = NextResponse.json({ ok: true, role: "admin", name: "Invitado" });
    response.cookies.set(SESSION.COOKIE_NAME, token, {
      httpOnly: true,
      secure: false, // Development only
      sameSite: "strict" as const,
      maxAge: SESSION.MAX_AGE,
      path: "/",
    });
    return response;
  } catch (e) {
    console.error("[auth/bypass] error:", e);
    return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  }
}
