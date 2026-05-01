import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/delivery/manual-assign
 * Body: { orderId, partnerId }
 *
 * Override de la cascada automática: el admin asigna un partner específico
 * a un pedido. Cancela offers pending, crea assignment, ocupa al partner.
 *
 * Caso de uso: pedido urgente, partner amigo del cliente, debug.
 */
const BodySchema = z.object({
  orderId: z.string().min(1),
  partnerId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: parsed.data.orderId, tenantId: auth.tenantId },
        select: { id: true, tenantId: true, customerName: true },
      });
      if (!order) return { error: "Order no existe en este tenant", code: 404 };

      const partner = await tx.deliveryPartner.findFirst({
        where: { id: parsed.data.partnerId, tenantId: auth.tenantId },
        select: { id: true, name: true, phone: true, currentOrderId: true, isActive: true, fee: true },
      });
      if (!partner) return { error: "Partner no existe en este tenant", code: 404 };
      if (!partner.isActive) return { error: "Partner no está activo", code: 409 };
      if (partner.currentOrderId && partner.currentOrderId !== order.id) {
        return { error: `Partner ya atiende ${partner.currentOrderId.slice(-8)}`, code: 409 };
      }

      // Verifica que no exista assignment previo para este order.
      const existing = await tx.deliveryAssignment.findUnique({
        where: { orderId: order.id },
        select: { id: true, partnerId: true },
      });
      if (existing) {
        return {
          error: `Order ya está asignado al partner ${existing.partnerId.slice(-8)}`,
          code: 409,
        };
      }

      // Cancela todas las offers pending para este order (cascada queda nula).
      await tx.deliveryOffer.updateMany({
        where: { orderId: order.id, status: "pending" },
        data: { status: "cancelled" },
      });

      // Crea assignment.
      const assignment = await tx.deliveryAssignment.create({
        data: {
          orderId: order.id,
          partnerId: partner.id,
          tenantId: order.tenantId,
          status: "assigned",
          fee: partner.fee, // sin offer, fee fijo del partner
          notes: `Asignación manual por ${auth.username}`,
        },
        select: { id: true, fee: true },
      });

      // Marca partner como ocupado.
      await tx.deliveryPartner.update({
        where: { id: partner.id },
        data: { currentOrderId: order.id },
      });

      return {
        ok: true,
        assignmentId: assignment.id,
        fee: Number(assignment.fee),
        partnerName: partner.name,
        partnerPhone: partner.phone,
      };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }

    // Notificar al partner — fire-and-forget.
    if (result.partnerPhone) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://www.buleje.pe";
      const url = `${baseUrl}/delivery-app/pedido/${result.assignmentId}`;
      const wa = [
        `🛵 *Pedido asignado por administración*`,
        ``,
        `${result.partnerName}, te asignaron un pedido manualmente.`,
        ``,
        `S/ ${result.fee.toFixed(0)} de envío`,
        ``,
        `Detalles: ${url}`,
      ].join("\n");
      sendWhatsAppQueued(result.partnerPhone, wa, {
        tenantId: auth.tenantId,
        context: `manual-assign-${result.assignmentId}`,
      }).catch((err) => logger.warn("[manual-assign] WhatsApp failed", { error: String(err) }));
    }

    logger.info("[admin/delivery/manual-assign]", {
      adminUser: auth.username,
      orderId: parsed.data.orderId,
      partnerId: parsed.data.partnerId,
      assignmentId: result.assignmentId,
    });

    return NextResponse.json({
      ok: true,
      assignmentId: result.assignmentId,
      fee: result.fee,
    });
  } catch (err) {
    logger.error("[admin/delivery/manual-assign] failed", { error: String(err) });
    return NextResponse.json({ error: "Error al asignar" }, { status: 500 });
  }
}
