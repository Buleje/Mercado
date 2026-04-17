import "server-only";
import { NextResponse } from "next/server";
import { createSessionToken, SESSION } from "@/lib/session";
import { logger } from "@/lib/logger";

/**
 * SECURITY: Bypass login endpoint.
 * Enabled in development, or in production only when explicitly allowed.
 */
export async function POST() {
  try {
    // HARD GUARD: bypass login is DEV-ONLY. In production we always 404,
    // ignoring ALLOW_ADMIN_BYPASS_LOGIN and the Settings flag. The env var
    // is additionally rejected at boot by validateEnv() in lib/env.ts.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logger.warn("[SECURITY] Bypass login used (dev only)", { env: process.env.NODE_ENV });
    const token = await createSessionToken("admin", "Invitado", "main", "Invitado");
    const response = NextResponse.json({ ok: true, role: "admin", name: "Invitado" });
    response.cookies.set(SESSION.COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: "strict" as const,
      maxAge: SESSION.MAX_AGE,
      path: "/",
    });
    return response;
  } catch (e) {
    logger.error("[auth/bypass] error", { error: String(e) });
    return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  }
}
