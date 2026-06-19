import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { verifyRatingToken } from "@/lib/delivery/rating-token";

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
  // SECURITY (F3 2026-05-07): token HMAC generado al crear la DeliveryAssignment.
  // Backwards-compat: opcional por ahora — si no viene, se permite con warning.
  token: z.string().max(200).optional(),
});

/**
 * Limpia el mensaje libre del cliente antes de guardarlo y, sobre todo, antes
 * de interpolarlo en el texto de WhatsApp del repartidor. Evita que saltos de
 * línea o marcadores de formato (`*_~``) rompan la estructura del mensaje o
 * inyecten negritas/itálicas falsas. Devuelve "" si no queda contenido útil.
 */
function sanitizeTipMessage(raw: string): string {
  return raw
    .replace(/[\r\n]+/g, " ") // sin saltos de línea (romperían el layout del WA)
    .replace(/[*_~`]/g, "") // sin marcadores de formato WhatsApp/markdown
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 200);
}

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

  // SECURITY (F3 2026-05-07): validar token HMAC para prevenir propinas
  // arbitrarias desde IDs enumerables.
  // Token puede venir en body o en query param ?token=...
  const token = parsed.data.token ?? new URL(req.url).searchParams.get("token") ?? null;
  if (token) {
    const result = verifyRatingToken(token, orderId);
    if (!result.valid) {
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 403 });
    }
  } else if (process.env.DELIVERY_TIP_REQUIRE_TOKEN === "true") {
    // Audit 2026-05-17 03-P1-2: flag-driven enforcement. Cuando se setee
    // DELIVERY_TIP_REQUIRE_TOKEN=true en prod, request sin token → 403.
    // Hasta entonces (rollout gradual de links WhatsApp con token HMAC)
    // se mantiene backwards-compat con warning. Activar la flag tras
    // confirmar que todos los clientes activos reciben link con token.
    logger.warn("[delivery/tip] rejected — token required", {
      orderId,
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown",
    });
    return NextResponse.json(
      { error: "Token requerido", message: "Usa el link enviado por WhatsApp." },
      { status: 403 },
    );
  } else {
    // Backwards-compat: permitir sin token pero log para medir uso legacy.
    logger.warn("[delivery/tip] legacy unauthenticated request", {
      orderId,
      ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown",
      userAgent: req.headers.get("user-agent")?.slice(0, 100) ?? "unknown",
    });
  }

   
  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { orderId },
    select: {
      id: true, status: true, partnerId: true, tipAmount: true, tenantId: true,
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

  // Mensaje libre saneado: se usa el mismo valor en la DB y en el WhatsApp.
  const tipMessage = parsed.data.message
    ? sanitizeTipMessage(parsed.data.message)
    : "";


  await prisma.deliveryAssignment.update({
    where: { id: assignment.id },
    data: {
      tipAmount: parsed.data.amount,
      tipMessage: tipMessage || null,
    },
  });

  // Notificar al partner — fire-and-forget.
  if (assignment.partner.phone) {
    const wa = [
      `🎁 *¡Recibiste una propina!*`,
      ``,
      `S/ ${parsed.data.amount.toFixed(2)} extra por la entrega.`,
      tipMessage ? `\nMensaje: "${tipMessage}"` : "",
      ``,
      `¡Gran trabajo, ${assignment.partner.name}!`,
    ].join("\n");
    // SECURITY 2026-05-05 (audit POS H005): tenantId real (antes literal "delivery").
    sendWhatsAppQueued(assignment.partner.phone, wa, {
      tenantId: assignment.tenantId,
      context: `tip-${assignment.id}`,
    }).catch((err) => logger.warn("[delivery/tip] wa failed", { error: String(err) }));
  }

  logger.info("[delivery/tip]", {
    orderId, partnerId: assignment.partnerId, amount: parsed.data.amount,
  });

  return NextResponse.json({ ok: true, amount: parsed.data.amount });
}
