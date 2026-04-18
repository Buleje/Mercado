import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * POST /api/gift-cards/redeem
 *
 * Canjear tarjeta por codigo — la asocia al usuario actual sin descontar saldo.
 */

const RedeemSchema = z.object({
  code: z.string().min(8).max(32),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`giftcard:redeem:${ip}`, 10, 300);
  if (!allowed) {
    return apiError(
      "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
      429,
    );
  }

  try {
    const body = await req.json();
    const parsed = RedeemSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Codigo invalido", 400, parsed.error.flatten());
    }

    const tenantId = getTenantIdFromRequest(req);
    const userId = req.headers.get("x-user-id") ?? "user_me";

    const result = await GiftCardsDB.redeem(tenantId, parsed.data.code, userId);

    if (!result.ok) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Tarjeta no encontrada",
        ALREADY_REDEEMED: "Esta tarjeta ya fue canjeada por otro usuario",
        EXPIRED: "La tarjeta expiro",
        NO_BALANCE: "La tarjeta no tiene saldo disponible",
      };
      return apiError(messages[result.error] ?? "Error al canjear", 400);
    }

    return apiSuccess({ giftCard: result.giftCard });
  } catch (e) {
    logger.error("[gift-cards/redeem] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno", 503);
  }
}
