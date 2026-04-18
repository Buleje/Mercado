import { type NextRequest } from "next/server";
import { z } from "zod";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * POST /api/gift-cards/validate — ADR-077
 *
 * Verifica si un codigo es valido y cuanto saldo tiene SIN consumirlo.
 * El checkout lo llama antes de ofrecer "aplicar gift card" al cliente.
 *
 * Rate limit: 5 intentos / IP / 60 s. Mas laxo que /redeem pero igualmente
 * agresivo — validar es read-only pero sigue siendo vector de brute-force.
 */

const ValidateSchema = z.object({
  code: z.string().min(8).max(32),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`giftcard:validate:${ip}`, 5, 60);
  if (!allowed) {
    return apiError(
      "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      429,
    );
  }

  try {
    const body = await req.json();
    const parsed = ValidateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Codigo invalido", 400, parsed.error.flatten());
    }

    const tenantId = getTenantIdFromRequest(req);
    const result = await GiftCardsDB.validateCode(tenantId, parsed.data.code);

    if (!result.ok) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Tarjeta no encontrada",
        INVALID_FORMAT: "Formato de codigo invalido",
        EXPIRED: "La tarjeta expiro",
        CANCELLED: "La tarjeta fue cancelada",
        NO_BALANCE: "Sin saldo disponible",
      };
      return apiError(messages[result.error] ?? "Codigo no valido", 400, {
        code: result.error,
      });
    }

    return apiSuccess({
      valid: true,
      giftCardId: result.giftCardId,
      amount: result.amount,
      balance: result.balance,
      currency: result.currency,
      status: result.status,
      recipientName: result.recipientName,
      expiresAt: result.expiresAt,
    });
  } catch (e) {
    logger.error("[gift-cards/validate] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno", 503);
  }
}
