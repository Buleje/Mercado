import { type NextRequest } from "next/server";
import { z } from "zod";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * POST /api/gift-cards/redeem — ADR-077
 *
 * Canje transaccional (total o parcial). Usa SELECT FOR UPDATE dentro de
 * prisma.$transaction para prevenir double-spend.
 *
 * Rate limit AGRESIVO: 3 intentos / IP / 60 s. Brute-force del code es
 * teoricamente posible (16 chars alfanumericos = ~1e24 combinaciones, pero
 * un atacante iterativo acumula). Si el rate limit se acciona, responder
 * 429 generico sin pista semantica.
 */

const RedeemSchema = z.object({
  code: z.string().min(8).max(32),
  amount: z.number().positive().max(10_000),
  orderId: z.string().max(100).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`giftcard:redeem:${ip}`, 3, 60);
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
      return apiError("Datos invalidos", 400, parsed.error.flatten());
    }

    const tenantId = getTenantIdFromRequest(req);
    const userId = req.headers.get("x-user-id") ?? null;

    const result = await GiftCardsDB.redeem(
      tenantId,
      parsed.data.code,
      userId,
      parsed.data.amount,
      parsed.data.orderId ?? null,
    );

    if (!result.ok) {
      // Mensajes genericos para no filtrar si el code existe o no
      const messages: Record<string, string> = {
        NOT_FOUND: "Tarjeta no encontrada o invalida",
        INVALID_FORMAT: "Formato de codigo invalido",
        EXPIRED: "La tarjeta expiro",
        CANCELLED: "La tarjeta fue cancelada",
        INSUFFICIENT_BALANCE: "La tarjeta no tiene saldo suficiente",
        INVALID_AMOUNT: "Monto invalido",
      };
      return apiError(messages[result.error] ?? "No se pudo canjear", 400, {
        code: result.error,
      });
    }

    return apiSuccess({
      giftCard: result.giftCard,
      redeemedAmount: result.redeemedAmount,
      balanceAfter: result.balanceAfter,
    });
  } catch (e) {
    logger.error("[gift-cards/redeem] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno", 503);
  }
}
