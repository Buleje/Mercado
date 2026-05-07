import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * PATCH /api/notification-center/read-all
 *
 * Marca todas las notificaciones del tenant como leídas.
 */
export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "notification-center-read-all"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;

  try {
    const result = await prisma.notification.updateMany({
      where: { tenantId, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
