import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { CommissionsDB } from "@/lib/db/commissions.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/commissions/payouts-pending?status=settled
 *
 * Audit 2026-05-17 (construcción gap 3 — Settle real fase 1).
 *
 * Devuelve la lista de transferencias por hacer agrupadas por vendor
 * (storeId o partnerId), con desglose por tipo de fee y monto total.
 *
 * El cron `settle-commissions` marca status=settled pero NO mueve dinero.
 * Este endpoint expone qué hay listo para transferir manualmente (o
 * programáticamente cuando integremos Stripe Connect / MP Marketplace).
 *
 * Default status=settled (comisiones liquidadas listas para payout).
 * Si status=pending, devuelve lo que aún no ha sido settled (preview).
 */

const QuerySchema = z.object({
  status: z.enum(["pending", "settled"]).default("settled"),
});

export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "GENEROUS", "commissions-payouts");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({ status: searchParams.get("status") ?? undefined });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "status inválido (debe ser 'pending' o 'settled')" },
        { status: 400 },
      );
    }

    const vendors = await CommissionsDB.payoutSummaryByVendor(auth.tenantId, parsed.data.status);
    const grandTotal = vendors.reduce((s, v) => s + v.total, 0);

    return NextResponse.json({
      status: parsed.data.status,
      vendorsCount: vendors.length,
      grandTotal: Math.round(grandTotal * 100) / 100,
      vendors,
      // Stub: cuando integremos Stripe Connect, este array tendrá los
      // transferIds reales. Por ahora indica que falta integración.
      payoutsProcessed: [],
      integrationStatus: "stub_no_transfers_executed",
    });
  } catch (err) {
    logger.error("[commissions/payouts-pending] error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error al cargar payouts pendientes" }, { status: 500 });
  }
}
