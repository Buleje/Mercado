import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { requireDriver } from "@/lib/auth/driver-session";
import { logActivity } from "@/lib/activity-logger";

// GET /api/delivery/driver/[partnerId] — driver sees their assigned deliveries
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  const { partnerId } = await params;

  const guard = await requireDriver(req, partnerId, prisma);
  if (guard instanceof NextResponse) return guard;
  const { tenantId } = guard;

  try {
    const partner = await prisma.deliveryPartner.findUnique({
      where: { id: partnerId, tenantId },
      select: { id: true, name: true, phone: true, isActive: true },
    });

    if (!partner || !partner.isActive) {
      return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });
    }

    const assignments = await prisma.deliveryAssignment.findMany({
      where: { partnerId, tenantId },
      include: {
        order: {
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            customerLocation: true,
            total: true,
            status: true,
            items: { select: { name: true, quantity: true } },
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    // Count stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayDelivered = assignments.filter(
      (a) => a.status === "delivered" && a.deliveredAt && a.deliveredAt >= todayStart
    ).length;
    const pending = assignments.filter(
      (a) => a.status === "assigned" || a.status === "picked_up" || a.status === "in_transit"
    ).length;
    // TD-018: a.fee es Decimal
    const todayEarnings = assignments
      .filter((a) => a.status === "delivered" && a.deliveredAt && a.deliveredAt >= todayStart)
      .reduce((sum, a) => sum + toNumOrZero(a.fee), 0);

    return NextResponse.json({
      partner: { id: partner.id, name: partner.name },
      stats: { todayDelivered, pending, todayEarnings },
      assignments: assignments.map((a) => ({
        id: a.id,
        orderId: a.orderId,
        status: a.status,
        fee: toNumOrZero(a.fee),
        createdAt: a.createdAt,
        pickedUpAt: a.pickedUpAt,
        deliveredAt: a.deliveredAt,
        customerName: a.order.customerName,
        customerPhone: a.order.customerPhone,
        customerLocation: a.order.customerLocation,
        orderTotal: a.order.total,
        orderStatus: a.order.status,
        items: a.order.items,
      })),
    });
  } catch (err) {
    logger.error("[delivery/driver] GET error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

// PATCH /api/delivery/driver/[partnerId] — driver updates assignment status
const PatchSchema = z.object({
  assignmentId: z.string().min(1),
  status: z.enum(["picked_up", "in_transit", "delivered"]),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  assigned: ["picked_up"],
  picked_up: ["in_transit"],
  in_transit: ["delivered"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ partnerId: string }> }
) {
  const { partnerId } = await params;

  const guard = await requireDriver(req, partnerId, prisma);
  if (guard instanceof NextResponse) return guard;
  const { tenantId } = guard;

  try {
    let raw: unknown;
    try { raw = await req.json(); } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const assignment = await prisma.deliveryAssignment.findUnique({
      where: { id: parsed.data.assignmentId, tenantId },
    });
    if (!assignment || assignment.partnerId !== partnerId) {
      return NextResponse.json({ error: "Asignación no encontrada" }, { status: 404 });
    }

    const allowed = VALID_TRANSITIONS[assignment.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return NextResponse.json(
        { error: `No se puede pasar de "${assignment.status}" a "${parsed.data.status}"` },
        { status: 422 }
      );
    }

    const updated = await prisma.deliveryAssignment.update({
      where: { id: parsed.data.assignmentId },
      data: {
        status: parsed.data.status,
        ...(parsed.data.status === "picked_up" && { pickedUpAt: new Date() }),
        ...(parsed.data.status === "delivered" && { deliveredAt: new Date() }),
      },
    });

    // Audit trail — fire-and-forget
    logActivity(
      "delivery.assignment.status_changed",
      "DeliveryAssignment",
      `${assignment.status} → ${parsed.data.status} (partner: ${partnerId})`,
      parsed.data.assignmentId,
      partnerId,
      undefined,
      tenantId,
    ).catch((err) => logger.error("[delivery/driver] logActivity failed", { error: String(err), partnerId }));

    return NextResponse.json({ data: updated, message: `Estado actualizado a "${parsed.data.status}"` });
  } catch (err) {
    logger.error("[delivery/driver] PATCH error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
