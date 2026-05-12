import { type NextRequest, NextResponse } from "next/server";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { requireCustomer } from "@/lib/auth/require-customer";
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
    // CRITICAL FIX 2026-05-11 (audit P0-6): antes la "ownership" se decidia
    // leyendo `req.headers.get("x-user-id")` — cualquier cliente podia inyectar
    // ese header y leer gift cards ajenas. Ahora usamos customer session
    // firmada (cookie HttpOnly) como SOLA fuente de identidad.
    const customer = await requireCustomer(req);
    if (customer instanceof NextResponse) return customer;
    const tenantId = customer.tenantId;
    const userId = customer.customerId;

    const card = await GiftCardsDB.getById(tenantId, id);
    if (!card) return apiError("Gift card no encontrada", 404);

    // Autorizacion: solo sender o recipient pueden ver el detalle
    const isOwner =
      card.senderUserId === userId || card.redeemedByUserId === userId;
    if (!isOwner) return apiError("No autorizado", 403);

    return apiSuccess({ giftCard: card });
  } catch (e) {
    logger.error("[gift-cards/[id]] error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return apiError("Error interno", 503);
  }
}
