import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/gift-cards/[id]/cancel — ADR-077
 *
 * Admin cancela una gift card existente y reembolsa el saldo (balance → 0,
 * status → cancelled). La cancelacion es irreversible: la tarjeta original
 * NO se puede reactivar, hay que emitir una nueva via /issue-manual.
 *
 * Solo role admin. Auditado.
 */

const Schema = z.object({
  reason: z.string().min(3).max(200),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-gift-cards-X-cancel"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await ctx.params;
    if (!id) return apiError("id requerido", 400);

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return apiError("Datos invalidos", 400, parsed.error.flatten());
    }

    const result = await GiftCardsDB.cancelAndRefund(
      auth.tenantId,
      id,
      auth.username,
      parsed.data.reason,
    );

    if (!result.ok) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Gift card no encontrada",
        ALREADY_CANCELLED: "La gift card ya fue cancelada",
        INTERNAL: "Error interno",
      };
      return apiError(messages[result.error ?? "INTERNAL"] ?? "Error", 400, {
        code: result.error,
      });
    }

    return apiSuccess({ cancelled: true, id });
  } catch (e) {
    logger.error("[admin/gift-cards/cancel] error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return apiError("Error interno", 503);
  }
}
