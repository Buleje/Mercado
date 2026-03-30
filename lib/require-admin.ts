import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION } from "@/lib/session";
import type { AdminRole, SessionPayload } from "@/lib/session";
import { logger } from "@/lib/logger";

/**
 * Verify the admin session from an API request.
 * Returns the session payload (role, username, tenantId) if valid,
 * or a 401/403 NextResponse.
 *
 * Usage:
 *   const auth = await requireAdmin(req, ["admin", "cajero"]);
 *   if (auth instanceof NextResponse) return auth;
 *   const db = prismaForTenant(auth.tenantId);
 */
export async function requireAdmin(
  req: NextRequest,
  allowedRoles?: AdminRole[],
): Promise<SessionPayload | NextResponse> {
  const token = req.cookies.get(SESSION.COOKIE_NAME)?.value;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? 
             req.headers.get("x-real-ip") ?? 
             "unknown";
  const path = req.nextUrl.pathname;
  const method = req.method;

  if (!token) {
    logger.warn("[AUTH] Unauthorized", { method, path, ip });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await getSessionPayload(token);
  if (!payload) {
    logger.warn("[AUTH] Invalid/expired token", { method, path, ip });
    return NextResponse.json({ error: "session expired" }, { status: 401 });
  }

  if (allowedRoles && !allowedRoles.includes(payload.role)) {
    logger.warn("[AUTH] Forbidden", { username: payload.username, role: payload.role, method, path });
    return NextResponse.json(
      { error: "forbidden", message: `Requires: ${allowedRoles.join(", ")}` },
      { status: 403 }
    );
  }

  logger.debug("[AUTH] OK", { username: payload.username, role: payload.role, tenantId: payload.tenantId, method, path });

  return payload;
}
