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
    const pendingRaw = await prisma.commissionLedger.findMany({
      where: { status: "pending", createdAt: { lt: cutoff } },
      select: { id: true, tenantId: true, storeId: true, partnerId: true, type: true, amount: true, orderId: true },
    });

    if (pendingRaw.length === 0) {
      logger.info("[cron/settle-commissions] No pending commissions to settle");
      return NextResponse.json({ settled: 0, totalAmount: 0, byTenant: [] });
    }

    // Defensa: NO liquidar comisiones de órdenes que aún NO tienen el pago
    // confirmado. Liquidar = volverlas elegibles para payout al vendor.
    //   - "cancelado": venta anulada (comisión fantasma) — audit 2026-05-29.
    //   - "pendiente": pago SIN verificar (Yape/Plin/efectivo por aprobar)
    //     — fix 2026-06-29: una orden creada y nunca pagada dejaba su comisión
    //     liquidable → el superadmin podía pagarle al vendor por una venta que
    //     nunca se cobró. Solo se liquidan comisiones SIN orden (fees de
    //     plataforma) o de órdenes con pago confirmado (confirmado/preparando/
    //     en_camino/entregado).
    const orderIds = [...new Set(pendingRaw.map((c) => c.orderId).filter((x): x is string => !!x))];
    const unconfirmed = orderIds.length
      ? await prisma.order.findMany({ where: { id: { in: orderIds }, status: { in: ["pendiente", "cancelado"] } }, select: { id: true } })
      : [];
    const unconfirmedSet = new Set(unconfirmed.map((o) => o.id));
    const pending = pendingRaw.filter((c) => !c.orderId || !unconfirmedSet.has(c.orderId));
    const skippedUnconfirmed = pendingRaw.length - pending.length;

    if (pending.length === 0) {
      logger.info("[cron/settle-commissions] Solo había comisiones de órdenes sin pago confirmado — nada que liquidar", { skippedUnconfirmed });
      return NextResponse.json({ settled: 0, totalAmount: 0, byTenant: [], skippedUnconfirmed });
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
      skippedUnconfirmed,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.error("[cron/settle-commissions] Failed", { error: err, traceId });
    return NextResponse.json(payload, { status });
  }
});
