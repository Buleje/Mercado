import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/admin/gift-cards/[id]/extend — ADR-077 follow-up
 *
 * Admin extiende la fecha de vencimiento de una gift card pendiente.
 * Recibe `expiresAt` como fecha (YYYY-MM-DD o ISO). Debe ser futura.
 *
 * Solo role admin. Auditado.
 */

const Schema = z.object({
  expiresAt: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-gift-cards-X-extend"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
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

    const newExpiry = new Date(parsed.data.expiresAt);
    if (Number.isNaN(newExpiry.getTime())) {
      return apiError("Fecha invalida", 400);
    }
    if (newExpiry.getTime() <= Date.now()) {
      return apiError("La nueva fecha debe ser futura", 400);
    }

    const result = await GiftCardsDB.extendExpiry(
      auth.tenantId,
      id,
      auth.username,
      newExpiry,
    );

    if (!result.ok) {
      const messages: Record<string, string> = {
        NOT_FOUND: "Gift card no encontrada",
        CANCELLED: "La gift card fue cancelada",
        ALREADY_REDEEMED: "La gift card ya fue usada",
        INTERNAL: "Error interno",
      };
      return apiError(messages[result.error ?? "INTERNAL"] ?? "Error", 400, {
        code: result.error,
      });
    }

    return apiSuccess({ extended: true, id, expiresAt: newExpiry.toISOString() });
  } catch (e) {
    logger.error("[admin/gift-cards/extend] error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return apiError("Error interno", 503);
  }
}
