import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { GiftCardsDB } from "@/lib/db/gift-cards.db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/gift-cards/issue-manual — ADR-077
 *
 * Admin emite una gift card manual (cortesia, compensacion, gift empresarial).
 * Devuelve el plainCode UNA SOLA VEZ para que el admin lo entregue al destino
 * por fuera de la plataforma (WhatsApp, email manual, impresa).
 *
 * Solo role admin. Auditado via logActivity dentro de la DB class.
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

const Schema = z.object({
  amount: z.number().int().min(10).max(10_000),
  recipientName: z.string().min(1).max(80),
  recipientPhone: z.string().min(3).max(30).optional().nullable(),
  recipientEmail: z.string().email().optional().nullable(),
  message: z.string().max(200).optional(),
  design: DESIGN_ENUM.optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  reason: z.string().min(2).max(120),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-gift-cards-issue-manual"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return apiError("Datos invalidos", 400, parsed.error.flatten());
    }

    const result = await GiftCardsDB.issueManual(
      auth.tenantId,
      {
        amount: parsed.data.amount,
        recipientName: parsed.data.recipientName,
        recipientPhone: parsed.data.recipientPhone ?? null,
        recipientEmail: parsed.data.recipientEmail ?? null,
        message: parsed.data.message ?? "",
        design: parsed.data.design ?? "general",
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        reason: parsed.data.reason,
      },
      auth.username,
    );

    return apiSuccess(
      {
        giftCard: result.giftCard,
        plainCode: result.plainCode,
      },
      201,
    );
  } catch (e) {
    logger.error("[admin/gift-cards/issue-manual] error", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return apiError("Error interno", 503);
  }
}
