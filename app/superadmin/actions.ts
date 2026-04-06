"use server";

import { cookies } from "next/headers";
import { PLATFORM_SESSION } from "@/lib/superadmin-session";

/**
 * Server Action to rotate the superadmin session cookie.
 * Called from the client shell when the layout detects rotation is needed.
 */
export async function rotatePlatformCookie(freshToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_SESSION.COOKIE_NAME, freshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PLATFORM_SESSION.MAX_AGE,
  });
}
