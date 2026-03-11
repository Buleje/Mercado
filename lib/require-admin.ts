import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION } from "@/lib/session";
import type { AdminRole } from "@/lib/session";

/**
 * Verify the admin session from an API request.
 * Returns the session payload if valid, or a 401/403 response.
 *
 * Features:
 * - Token validation
 * - Role-based access control
 * - Basic security logging
 * - IP tracking for audit
 *
 * Usage:
 *   const auth = await requireAdmin(req, ["admin", "cajero"]);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is { role, username }
 */
export async function requireAdmin(
  req: NextRequest,
  allowedRoles?: AdminRole[],
): Promise<{ role: AdminRole; username: string } | NextResponse> {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? 
             req.headers.get("x-real-ip") ?? 
             "unknown";
  const path = req.nextUrl.pathname;
  const method = req.method;

  // No token provided
  if (!token) {
    console.warn(`[AUTH] Unauthorized access attempt: ${method} ${path} from ${ip}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Token validation
  const payload = await getSessionPayload(token);
  if (!payload) {
    console.warn(`[AUTH] Invalid/expired token: ${method} ${path} from ${ip}`);
    return NextResponse.json({ error: "session expired" }, { status: 401 });
  }

  // Role validation
  if (allowedRoles && !allowedRoles.includes(payload.role)) {
    console.warn(
      `[AUTH] Forbidden: ${payload.username} (${payload.role}) attempted ${method} ${path} (requires: ${allowedRoles.join(", ")})`
    );
    return NextResponse.json(
      { 
        error: "forbidden",
        message: `This action requires one of the following roles: ${allowedRoles.join(", ")}` 
      }, 
      { status: 403 }
    );
  }

  // Success - log in development for debugging
  if (process.env.NODE_ENV === "development") {
    console.log(`[AUTH] Authorized: ${payload.username} (${payload.role}) → ${method} ${path}`);
  }

  return payload;
}
