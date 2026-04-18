import { type NextRequest } from "next/server";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * GET /api/gift-cards/[id] — ADR-077
 *
 * Detalle de una gift card (owner only). "Owner" = sender o recipient
 * logueado. No requiere pasar el plainCode — se busca por id + x-user-id
 * header.
 *
 * Nunca expone codeHash ni el plainCode — solo el masked "****-****-****-XXXX".
 */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || id.length > 50) {
    return apiError("id invalido", 400);
  }

  try {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.headers.get("x-user-id");

    const card = await GiftCardsDB.getById(tenantId, id);
    if (!card) return apiError("Gift card no encontrada", 404);

    // Autorizacion: solo sender o recipient pueden ver el detalle
    const isOwner =
      userId && (card.senderUserId === userId || card.redeemedByUserId === userId);
    if (!isOwner) return apiError("No autorizado", 403);

    return apiSuccess({ giftCard: card });
  } catch (e) {
    logger.error("[gift-cards/[id]] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno", 503);
  }
}
