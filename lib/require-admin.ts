import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION } from "@/lib/session";
import type { AdminRole } from "@/lib/session";

/**
 * Verify the admin session from an API request.
 * Returns the session payload if valid, or a 401 response.
 *
 * Usage:
 *   const auth = await requireAdmin(req);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is { role, username }
 */
export async function requireAdmin(
  req: NextRequest,
  allowedRoles?: AdminRole[],
): Promise<{ role: AdminRole; username: string } | NextResponse> {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await getSessionPayload(token);
  if (!payload) {
    return NextResponse.json({ error: "session expired" }, { status: 401 });
  }

  if (allowedRoles && !allowedRoles.includes(payload.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return payload;
}
