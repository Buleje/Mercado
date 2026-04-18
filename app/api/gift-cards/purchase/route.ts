import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * POST /api/gift-cards/purchase
 *
 * Crea una tarjeta de regalo. MOCK — no toca payment gateway real.
 * Zona peligrosa (checkout) documentada en README.md del feature.
 */

const DESIGN_ENUM = z.enum([
  "cumpleanos",
  "navidad",
  "felicitaciones",
  "aniversario",
  "gracias",
  "anio-nuevo",
  "bienvenida",
  "general",
]);

const PurchaseSchema = z.object({
  amount: z.number().int().min(10).max(1000),
  design: DESIGN_ENUM,
  message: z.string().max(200).default(""),
  recipientName: z.string().min(1).max(80),
  recipientContact: z.string().min(3).max(120),
  contactMethod: z.enum(["email", "whatsapp"]),
  senderName: z.string().min(1).max(80),
});

export async function POST(req: NextRequest) {
  // Rate limit: 5 compras por IP cada 5 minutos
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`giftcard:purchase:${ip}`, 5, 300);
  if (!allowed) {
    return apiError(
      "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      429,
    );
  }

  try {
    const body = await req.json();
    const parsed = PurchaseSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Datos invalidos", 400, parsed.error.flatten());
    }

    const tenantId = getTenantIdFromRequest(req);
    // TODO(agent-E): cuando haya auth real, leer userId del session. Mock:
    const senderUserId =
      req.headers.get("x-user-id") ?? "user_me";

    const card = await GiftCardsDB.purchase({
      tenantId,
      senderUserId,
      senderName: parsed.data.senderName,
      amount: parsed.data.amount,
      design: parsed.data.design,
      message: parsed.data.message,
      recipientName: parsed.data.recipientName,
      recipientContact: parsed.data.recipientContact,
      contactMethod: parsed.data.contactMethod,
    });

    return apiSuccess({ giftCard: card }, 201);
  } catch (e) {
    logger.error("[gift-cards/purchase] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno al procesar la compra", 503);
  }
}
