export const dynamic = 'force-dynamic'
import "server-only";
import { NextResponse } from "next/server";
import { SettingsDB } from "@/lib/jsondb";
import { createSessionToken, SESSION } from "@/lib/session";

export async function POST() {
  try {
    const settings = await SettingsDB.get();

    if (!settings.adminBypassLogin) {
      return NextResponse.json({ error: "bypass not enabled" }, { status: 403 });
    }

    const token = await createSessionToken("admin", "invitado");
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
    console.error("[auth/bypass] error:", e);
    return NextResponse.json({ error: "service unavailable" }, { status: 503 });
  }
}
