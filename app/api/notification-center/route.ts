import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/notification-center
 *
 * Lista notificaciones in-app del admin (Notification Center).
 * Query params:
 *   - limit: number (default 50, max 100)
 *   - unread: "true" — solo no leídas
 *   - severity: "HIGH" | "MEDIUM" | "LOW"
 *
 * Response header:
 *   - X-Unread-Count: total de no leídas del tenant
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const url = req.nextUrl;

  const limitParam = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(1, limitParam), 100);
  const unread = url.searchParams.get("unread") === "true";
  const severity = url.searchParams.get("severity");

  try {
    const where: Record<string, unknown> = { tenantId };
    if (unread) where.readAt = null;
    if (severity && ["HIGH", "MEDIUM", "LOW"].includes(severity)) {
      where.severity = severity;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: { tenantId, readAt: null },
      }),
    ]);

    const res = NextResponse.json(notifications);
    res.headers.set("X-Unread-Count", String(unreadCount));
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
