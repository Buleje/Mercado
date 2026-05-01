import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { logger } from "@/lib/logger";

/**
 * GET /api/delivery/me/assignments/[id]
 * Devuelve el assignment del partner autenticado con datos del order.
 * 404 si no es del partner (anti cross-partner peek).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true, customerName: true, customerPhone: true,
          customerLocation: true, customerReference: true,
          total: true, notes: true, status: true, createdAt: true,
          items: { select: { name: true, quantity: true, unit: true } },
        },
      },
    },
  });

  if (!assignment || assignment.partnerId !== session.partnerId) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    assignment: {
      ...assignment,
      fee: Number(assignment.fee),
      order: { ...assignment.order, total: Number(assignment.order.total) },
    },
  });
}

/**
 * PATCH /api/delivery/me/assignments/[id]
 * Body: { status: "picked_up" | "in_transit" | "delivered" | "cancelled" }
 *
 * Transiciones permitidas:
 *   assigned → picked_up | cancelled
 *   picked_up → in_transit | delivered | cancelled
 *   in_transit → delivered | cancelled
 *   delivered/cancelled → terminal (no más transiciones)
 *
 * Al pasar a delivered/cancelled libera el currentOrderId del partner.
 */
const PatchSchema = z.object({
  status: z.enum(["picked_up", "in_transit", "delivered", "cancelled"]),
});

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  assigned: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "delivered", "cancelled"],
  in_transit: ["delivered", "cancelled"],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.findUnique({
        where: { id },
        select: { id: true, partnerId: true, orderId: true, status: true, tenantId: true },
      });
      if (!assignment) return { error: "Assignment no encontrado", code: 404 };
      if (assignment.partnerId !== session.partnerId) {
        return { error: "Assignment no es tuyo", code: 403 };
      }

      const allowed = ALLOWED_TRANSITIONS[assignment.status] ?? [];
      if (!allowed.includes(parsed.data.status)) {
        return {
          error: `No podés pasar de ${assignment.status} a ${parsed.data.status}`,
          code: 409,
        };
      }

      const data: Record<string, unknown> = { status: parsed.data.status };
      if (parsed.data.status === "picked_up") data.pickedUpAt = new Date();
      if (parsed.data.status === "delivered") data.deliveredAt = new Date();

      await tx.deliveryAssignment.update({
        where: { id },
        data,
      });

      // Libera el partner si terminó.
      if (parsed.data.status === "delivered" || parsed.data.status === "cancelled") {
        await tx.deliveryPartner.update({
          where: { id: session.partnerId },
          data: { currentOrderId: null },
        });
      }

      return { ok: true, orderId: assignment.orderId, newStatus: parsed.data.status };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }
    logger.info("[delivery/me/assignment-status]", {
      partnerId: session.partnerId,
      assignmentId: id,
      newStatus: result.newStatus,
    });
    return NextResponse.json({ ok: true, status: result.newStatus });
  } catch (err) {
    logger.error("[delivery/me/assignment-status] failed", { error: String(err) });
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
