import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { withCronHealth } from "@/lib/cron/with-cron-health";

/**
 * GET /api/cron/settle-commissions
 *
 * Llamado por Vercel Cron (diario recomendado).
 * Liquida las comisiones en estado "pending" con más de 7 días de antigüedad.
 *
 * Audit 2026-05-17 P1-7: ahora genera summary per-tenant + per-vendor para
 * trazabilidad. Antes era un updateMany ciego sin desglose.
 *
 * IMPORTANTE: este cron NO mueve dinero — solo marca status=settled. La
 * transferencia real al vendor pasa por `/api/superadmin/payouts/pending`
 * (ver construcción gap 3).
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export const GET = withCronHealth("settle-commissions", async (_req: NextRequest) => {
  const traceId = newTraceId();

  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Buscar pending > 7 días — cross-tenant porque es cron de plataforma
    const pending = await prisma.commissionLedger.findMany({
      where: { status: "pending", createdAt: { lt: cutoff } },
      select: { id: true, tenantId: true, storeId: true, partnerId: true, type: true, amount: true },
    });

    if (pending.length === 0) {
      logger.info("[cron/settle-commissions] No pending commissions to settle");
      return NextResponse.json({ settled: 0, totalAmount: 0, byTenant: [] });
    }

    const ids = pending.map((c) => c.id);
    const totalAmount = Math.round(
      pending.reduce((sum, c) => sum + toNumOrZero(c.amount), 0) * 100,
    ) / 100;

    // Mark settled (no mueve dinero — sólo flag)
    await prisma.commissionLedger.updateMany({
      where: { id: { in: ids } },
      data: { status: "settled", settledAt: new Date() },
    });

    // Summary per-tenant (audit P1-7) — trazabilidad para superadmin
    const byTenant = new Map<string, { tenantId: string; count: number; total: number; types: Record<string, number> }>();
    for (const c of pending) {
      const entry = byTenant.get(c.tenantId) ?? { tenantId: c.tenantId, count: 0, total: 0, types: {} };
      entry.count++;
      const amount = toNumOrZero(c.amount);
      entry.total = Math.round((entry.total + amount) * 100) / 100;
      entry.types[c.type] = Math.round(((entry.types[c.type] ?? 0) + amount) * 100) / 100;
      byTenant.set(c.tenantId, entry);
    }
    const tenantsArray = Array.from(byTenant.values()).sort((a, b) => b.total - a.total);

    logger.info("[cron/settle-commissions] Commissions settled", {
      count: pending.length,
      totalAmount,
      tenants: tenantsArray.length,
    });

    return NextResponse.json({
      settled: pending.length,
      totalAmount,
      byTenant: tenantsArray,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.error("[cron/settle-commissions] Failed", { error: err, traceId });
    return NextResponse.json(payload, { status });
  }
});
