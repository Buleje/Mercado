import "server-only";
import { NextResponse } from "next/server";
import { SettingsDB } from "@/lib/jsondb";
import { createSessionToken, SESSION } from "@/lib/session";
import { logger } from "@/lib/logger";

/**
 * SECURITY: Bypass login endpoint.
 * Enabled in development, or in production only when explicitly allowed.
 */
export async function POST() {
  try {
    const envEnabled = process.env.ALLOW_ADMIN_BYPASS_LOGIN === "true";
    let settingsEnabled = false;

    if (!envEnabled) {
      try {
        const settings = await SettingsDB.get("main");
        settingsEnabled = settings.adminBypassLogin === true;
      } catch {
        settingsEnabled = false;
      }
    }

    const bypassEnabled = process.env.NODE_ENV !== "production" || envEnabled || settingsEnabled;

    if (!bypassEnabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logger.warn("[SECURITY] Bypass login used", { env: process.env.NODE_ENV });
    const token = await createSessionToken("admin", "Invitado", "main", "Invitado");
    const response = NextResponse.json({ ok: true, role: "admin", name: "Invitado" });
    response.cookies.set(SESSION.COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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
