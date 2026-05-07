import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * PATCH /api/notification-center/[id]/read
 *
 * Marca una notificación específica como leída.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "notification-center-X-read"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    // updateMany acepta compound where (id + tenantId) sin requerir la
    // preview feature extendedWhereUnique. Garantiza aislamiento de tenant.
    const result = await prisma.notification.updateMany({
      where: { id, tenantId: auth.tenantId },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
