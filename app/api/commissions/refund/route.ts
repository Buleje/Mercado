import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { CommissionsDB } from "@/lib/db/commissions.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * POST /api/commissions/refund
 *
 * Audit 2026-05-17 (construcción gap 1 — Disputas/Refunds).
 *
 * Reversa atómicamente las comisiones de una orden refunded. Marca como
 * `refunded` las activas (pending/settled) y crea entradas negativas de
 * compensación (type=refund_reversal) para mantener audit trail completo.
 *
 * Caso típico de uso:
 *   1. Cliente pide refund → OrdersDB.markAsRefunded(orderId)
 *   2. Trigger downstream → fetch("/api/commissions/refund", { orderId, reason })
 *   3. CommissionLedger queda balanceado (marketplace_fee +S/10 + refund_reversal -S/10)
 */

const RefundSchema = z.object({
  orderId: z.string().min(1).max(100),
  reason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "STRICT", "commissions-refund"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = RefundSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map(i => i.message) },
        { status: 400 },
      );
    }

    const result = await CommissionsDB.refundCommissionsByOrder(
      auth.tenantId,
      parsed.data.orderId,
      parsed.data.reason,
    );

    if (result.reversed.length === 0) {
      return NextResponse.json(
        { error: "No hay comisiones activas que reversar para esta orden", orderId: parsed.data.orderId },
        { status: 404 },
      );
    }

    logActivity(
      "Refund",
      "commissionLedger",
      `${result.reversed.length} comisiones reversadas (orden ${parsed.data.orderId}, total S/${result.totalReversed.toFixed(2)})${parsed.data.reason ? ` — razón: ${parsed.data.reason}` : ""}`,
      undefined,
      auth.username,
    ).catch(() => { /* fire-and-forget */ });

    return NextResponse.json({
      success: true,
      reversed: result.reversed,
      totalReversed: result.totalReversed,
      reversalIds: result.reversalIds,
    });
  } catch (err) {
    logger.error("[commissions/refund] error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error al procesar refund de comisiones" }, { status: 500 });
  }
}
