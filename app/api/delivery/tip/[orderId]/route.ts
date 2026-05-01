import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/tip/[orderId]
 * Body: { amount: number, message?: string }
 *
 * Endpoint público — el cliente deja propina al partner que entregó su pedido.
 * Solo disponible si el assignment está en status="delivered".
 *
 * No requiere auth (cualquiera con el orderId puede dejar tip — feature
 * abierta tipo Rappi). Rate limit por IP. La propina suma a fee del
 * partner (visible en /delivery-app/ganancias).
 */
const BodySchema = z.object({
  amount: z.number().positive().max(500),
  message: z.string().max(280).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const rl = applyRateLimit(req, "STRICT", "delivery-tip");
  if (rl) return rl;

  const { orderId } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { orderId },
    select: {
      id: true, status: true, partnerId: true, tipAmount: true,
      partner: { select: { name: true, phone: true } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }
  if (assignment.status !== "delivered") {
    return NextResponse.json(
      { error: "Solo se puede dejar propina tras la entrega" },
      { status: 409 },
    );
  }
  if (Number(assignment.tipAmount) > 0) {
    return NextResponse.json(
      { error: "Ya dejaste propina en este pedido" },
      { status: 409 },
    );
  }

  await prisma.deliveryAssignment.update({
    where: { id: assignment.id },
    data: {
      tipAmount: parsed.data.amount,
      tipMessage: parsed.data.message ?? null,
    },
  });

  // Notificar al partner — fire-and-forget.
  if (assignment.partner.phone) {
    const wa = [
      `🎁 *¡Recibiste una propina!*`,
      ``,
      `S/ ${parsed.data.amount.toFixed(2)} extra por la entrega.`,
      parsed.data.message ? `\nMensaje: "${parsed.data.message}"` : "",
      ``,
      `¡Gran trabajo, ${assignment.partner.name}!`,
    ].join("\n");
    sendWhatsAppQueued(assignment.partner.phone, wa, {
      tenantId: "delivery",
      context: `tip-${assignment.id}`,
    }).catch((err) => logger.warn("[delivery/tip] wa failed", { error: String(err) }));
  }

  logger.info("[delivery/tip]", {
    orderId, partnerId: assignment.partnerId, amount: parsed.data.amount,
  });

  return NextResponse.json({ ok: true, amount: parsed.data.amount });
}
