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
  // eslint-disable-next-line no-restricted-properties -- TODO: extraer a DeliveryAssignmentsDB
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
    // eslint-disable-next-line no-restricted-properties -- TODO: extraer a DeliveryAssignmentsDB
    const result = await prisma.$transaction(async (tx) => {
      const assignment = await tx.deliveryAssignment.findUnique({
        where: { id },
        select: { id: true, partnerId: true, orderId: true, status: true, tenantId: true, notes: true },
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

      // Gate "delivered" — exige photo proof guardado en notes.proofPhotoUrl.
      // Brandon mayo 2026: anti-fraude, repartidor debe entregar la foto
      // ANTES de marcar como entregado (mismo flujo que Rappi/PedidosYa).
      if (parsed.data.status === "delivered") {
        let hasProof = false;
        if (assignment.notes) {
          try {
            const parsedNotes = JSON.parse(assignment.notes);
            hasProof = typeof parsedNotes?.proofPhotoUrl === "string" && parsedNotes.proofPhotoUrl.length > 0;
          } catch {
            // Notes no era JSON — sin proof.
          }
        }
        if (!hasProof) {
          return {
            error: "Tomá la foto de entrega antes de marcar como entregado.",
            code: 400,
          };
        }
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

    // Notificar al cliente — fire-and-forget. Crea entry en DeliveryTracking
    // y envia WhatsApp con CTA al tracking publico.
    notifyCustomerOfStatusChange(result.orderId, result.newStatus).catch((err) =>
      logger.warn("[delivery/me/assignment-status] notify failed", {
        error: String(err),
        orderId: result.orderId,
      }),
    );

    return NextResponse.json({ ok: true, status: result.newStatus });
  } catch (err) {
    logger.error("[delivery/me/assignment-status] failed", { error: String(err) });
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

// ── Customer notification helper ─────────────────────────────────────────
const STATUS_MESSAGE: Record<string, { title: string; body: string }> = {
  picked_up: {
    title: "📦 Tu pedido fue recogido",
    body: "El repartidor pasó a buscar tu pedido y va camino a la tienda.",
  },
  in_transit: {
    title: "🛵 Tu pedido está en camino",
    body: "El repartidor salió hacia tu dirección. Llega en pocos minutos.",
  },
  delivered: {
    title: "✅ Tu pedido fue entregado",
    body: "¡Listo! Esperamos que lo disfrutes.",
  },
  cancelled: {
    title: "⚠️ Tu pedido fue cancelado",
    body: "El repartidor canceló el pedido. Buscamos otra solución.",
  },
};

async function notifyCustomerOfStatusChange(
  orderId: string,
  status: string,
): Promise<void> {
  const msg = STATUS_MESSAGE[status];
  if (!msg) return;

  // eslint-disable-next-line no-restricted-properties -- TODO: extraer a OrdersDB
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, customerName: true, customerPhone: true, tenantId: true },
  });
  if (!order) return;

  // Idempotency: skip si ya hay tracking entry reciente para este orderId+status.
  // eslint-disable-next-line no-restricted-properties -- TODO: extraer a DeliveryTrackingDB
  const recent = await prisma.deliveryTracking.findFirst({
    where: {
      orderId, status,
      createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
    },
    select: { id: true },
  });

  if (!recent) {
    // eslint-disable-next-line no-restricted-properties -- TODO: extraer a DeliveryTrackingDB
    await prisma.deliveryTracking.create({
      data: {
        id: `dt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tenantId: order.tenantId,
        orderId,
        status,
        description: msg.body,
        actorType: "driver",
      },
    });
  }

  if (order.customerPhone) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.buleje.pe";
    const trackUrl = `${baseUrl}/tracking/${orderId}`;
    const wa = [
      msg.title,
      "",
      `Hola ${order.customerName ?? ""}, ${msg.body}`,
      "",
      `Mirá el seguimiento en tiempo real:`,
      trackUrl,
    ].join("\n");
    const { sendWhatsAppQueued } = await import("@/lib/whatsapp");
    await sendWhatsAppQueued(order.customerPhone, wa, {
      tenantId: order.tenantId,
      context: `delivery-status-${status}-${orderId}`,
    }).catch((err) =>
      logger.warn("[delivery/status-notify] whatsapp failed", { error: String(err), orderId }),
    );
  }
}
