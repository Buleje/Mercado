import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/gift-cards — ADR-077
 *
 * Listado admin de gift cards del tenant con filtros basicos.
 * Query params:
 *   status   activa | canjeada | expirada | all (default)
 *   search   texto libre (matchea recipientName, ultimos 4 del code)
 *   limit    1..500 (default 200)
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get("status") ?? "all";
    const allowedStatus = ["activa", "canjeada", "expirada", "all"] as const;
    const status = (allowedStatus as readonly string[]).includes(rawStatus)
      ? (rawStatus as (typeof allowedStatus)[number])
      : "all";

    const search = searchParams.get("search") ?? undefined;
    const limitParam = Number(searchParams.get("limit") ?? "200");
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 200, 1), 500);

    const cards = await GiftCardsDB.listForAdmin(auth.tenantId, {
      status,
      search,
      limit,
    });

    return apiSuccess({ cards, count: cards.length });
  } catch (e) {
    logger.error("[admin/gift-cards/list] error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return apiError("Error interno", 503);
  }
}
