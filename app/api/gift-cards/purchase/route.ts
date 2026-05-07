import { type NextRequest } from "next/server";
import { z } from "zod";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * POST /api/gift-cards/purchase — ADR-077
 *
 * Crea una gift card real en DB. Devuelve el plainCode UNA sola vez para que
 * el comprador (sender) pueda copiarlo / compartirlo. Despues solo queda el
 * hash en DB — no hay recuperacion.
 *
 * Rate limit: 5 compras / IP / 5 minutos (prevenir abuse / stress).
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
  senderEmail: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "gift-cards-purchase"); if (_rl) return _rl;
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
    const senderUserId = req.headers.get("x-user-id") ?? null;

    const { recipientContact, contactMethod } = parsed.data;
    const isEmail = contactMethod === "email";

    const result = await GiftCardsDB.purchase(
      tenantId,
      {
        amount: parsed.data.amount,
        design: parsed.data.design,
        message: parsed.data.message,
        recipientName: parsed.data.recipientName,
        recipientEmail: isEmail ? recipientContact : null,
        recipientPhone: !isEmail ? recipientContact : null,
        senderName: parsed.data.senderName,
        senderEmail: parsed.data.senderEmail ?? null,
      },
      senderUserId,
    );

    // CRITICO: el plainCode va en la respuesta UNA sola vez. El client debe
    // mostrarlo y dejarlo copiar; no hay endpoint para recuperarlo.
    return apiSuccess(
      {
        giftCard: result.giftCard,
        plainCode: result.plainCode,
      },
      201,
    );
  } catch (e) {
    logger.error("[gift-cards/purchase] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno al procesar la compra", 503);
  }
}
