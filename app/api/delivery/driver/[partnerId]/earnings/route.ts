import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/auth/driver-session";

/**
 * GET /api/delivery/driver/[partnerId]/earnings
 *
 * Returns earnings, delivery count and assignment history for a specific driver.
 * Query: ?period=hoy|semana|mes (default: semana)
 *
 * Auth: Bearer <driverToken> or ?driverToken=<token>
 * Token issued via signDriverToken(tenantId, partnerId) — scoped per driver + tenant.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  const { partnerId } = await params;
  if (!partnerId) {
    return NextResponse.json({ error: "partnerId requerido" }, { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");

  const guard = await requireDriver(req, partnerId, prisma);
  if (guard instanceof NextResponse) return guard;
  const { tenantId } = guard;

  try {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: partnerId, tenantId },
      select: { id: true, name: true, rating: true, zone: true, vehicleType: true },
    });

    if (!partner) {
      return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });
    }

    // Period filter
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "semana";

    const now = new Date();
    let from: Date;
    if (period === "hoy") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "mes") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      // semana: last 7 days
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const assignments = await prisma.deliveryAssignment.findMany({
      where: {
        partnerId,
        tenantId,
        createdAt: { gte: from },
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        fee: true,
        deliveredAt: true,
        createdAt: true,
        order: { select: { customerName: true, total: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const delivered = assignments.filter((a) => a.status === "delivered");
    const pending = assignments.filter((a) => a.status !== "delivered");

    const earned = delivered.reduce((sum, a) => sum + Number(a.fee), 0);
    const pendingAmount = pending.reduce((sum, a) => sum + Number(a.fee), 0);
    const avgFee = delivered.length > 0 ? earned / delivered.length : 0;

    return NextResponse.json({
      partner,
      assignments: assignments.map((a) => ({
        ...a,
        fee: Number(a.fee),
        order: a.order ? { ...a.order, total: Number(a.order.total) } : null,
      })),
      totals: {
        earned: Math.round(earned * 100) / 100,
        pending: Math.round(pendingAmount * 100) / 100,
        deliveries: delivered.length,
        avgFee: Math.round(avgFee * 100) / 100,
      },
    });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
