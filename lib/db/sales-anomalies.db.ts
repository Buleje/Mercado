/**
 * lib/db/sales-anomalies.db.ts
 *
 * DB class para SalesAnomaly (Marketplace Bloque C — Feature C3).
 * Detecta anomalías de ventas comparando ventas del día actual contra el mismo
 * día de la semana anterior. Si la variación supera el 20%, registra una
 * anomalía con dirección (drop/spike) y severidad calculada.
 *
 * Schema notas:
 * - Order NO tiene storeId. Para filtrar por store usamos relación indirecta:
 *   Order.items.some.product.storeProducts.some.storeId.
 * - Detecta 4 métricas: revenue, orders, units, aov.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix, getOrSet } from "@/lib/cache";
import type { SalesAnomaly as PSalesAnomaly } from "@/lib/generated/prisma/client";
import { toNumOrZero } from "@/lib/decimal-utils";
import { limaDayRange } from "@/lib/utils";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type AnomalyDirection = "drop" | "spike";
export type AnomalyMetric = "revenue" | "orders" | "units" | "aov";

export type DbSalesAnomaly = {
  id: string;
  tenantId: string;
  storeId: string;
  date: string;
  comparisonDate: string;
  metric: AnomalyMetric;
  expected: number;
  actual: number;
  deltaPct: number;
  severity: AnomalySeverity;
  direction: AnomalyDirection;
  acknowledgedAt: string | null;
  notifiedAt: string | null;
  createdAt: string;
};

function mapSalesAnomaly(row: PSalesAnomaly): DbSalesAnomaly {
  return {
    id: row.id,
    tenantId: row.tenantId,
    storeId: row.storeId,
    date: row.date.toISOString(),
    comparisonDate: row.comparisonDate.toISOString(),
    metric: row.metric as AnomalyMetric,
    expected: row.expected,
    actual: row.actual,
    deltaPct: row.deltaPct,
    severity: row.severity as AnomalySeverity,
    direction: row.direction as AnomalyDirection,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function calculateSeverity(deltaPctAbs: number): AnomalySeverity {
  if (deltaPctAbs > 60) return "critical";
  if (deltaPctAbs > 40) return "high";
  if (deltaPctAbs > 25) return "medium";
  return "low";
}

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * El día de Lima que se analiza y su espejo de hace 7 días, como `[start, end)`.
 * El día en curso se corta en `ahora` y el espejo en la MISMA franja: el cron
 * corre a las 18:00 de Lima y comparar 18 h contra 24 h daba una «caída» del
 * 25 % todos los días. Un día pasado se compara entero contra entero.
 */
export function rangosDeAnomalia(
  date: Date | undefined,
  ahora: Date = new Date(),
): { target: { start: Date; end: Date }; comparison: { start: Date; end: Date } } {
  const dia = limaDayRange(date ?? ahora);
  const end = new Date(Math.min(dia.end.getTime(), Math.max(ahora.getTime(), dia.start.getTime())));
  const largo = end.getTime() - dia.start.getTime();
  const comparisonStart = new Date(dia.start.getTime() - SIETE_DIAS_MS);
  return {
    target: { start: dia.start, end },
    comparison: { start: comparisonStart, end: new Date(comparisonStart.getTime() + largo) },
  };
}

/** Aggregate stats de orders + items que pertenezcan al store via productos. */
async function aggregateStoreStats(
  tenantId: string,
  storeId: string,
  range: { start: Date; end: Date },
): Promise<{ revenue: number; orderCount: number; units: number }> {
  // Filtro indirecto: orders del tenant que tengan al menos un item cuyo producto
  // esté publicado en esta store via StoreProduct.
  const storeFilter = {
    tenantId,
    deletedAt: null,
    createdAt: { gte: range.start, lt: range.end },
    items: {
      some: {
        product: {
          storeProducts: { some: { storeId } },
        },
      },
    },
  } as const;

  const [orderAgg, items] = await Promise.all([
    prisma.order.aggregate({
      where: storeFilter,
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: storeFilter },
      _sum: { quantity: true },
    }),
  ]);

  return {
    // TD-018: _sum.total es Decimal | null
    revenue: toNumOrZero(orderAgg._sum.total),
    orderCount: orderAgg._count._all,
    units: items._sum.quantity ?? 0,
  };
}

export const SalesAnomaliesDB = {
  /**
   * Detecta anomalías para una fecha (default: hoy). Compara contra el mismo
   * día de la semana anterior. Crea registros para cada métrica con |delta| >= 20%.
   * Devuelve la cantidad de anomalías creadas.
   */
  async detect(tenantId: string, storeId: string, date?: Date): Promise<number> {
    // Día de LIMA (el servidor corre en UTC: `setHours(0)` era las 19:00 del día anterior).
    const { target: targetRange, comparison: comparisonRange } = rangosDeAnomalia(date);
    const targetDate = targetRange.start;
    const comparisonDate = comparisonRange.start;

    const [target, comparison] = await Promise.all([
      aggregateStoreStats(tenantId, storeId, targetRange),
      aggregateStoreStats(tenantId, storeId, comparisonRange),
    ]);

    const targetAOV = target.orderCount > 0 ? target.revenue / target.orderCount : 0;
    const comparisonAOV =
      comparison.orderCount > 0 ? comparison.revenue / comparison.orderCount : 0;

    const anomalies: Array<{
      tenantId: string;
      storeId: string;
      date: Date;
      comparisonDate: Date;
      metric: AnomalyMetric;
      expected: number;
      actual: number;
      deltaPct: number;
      severity: AnomalySeverity;
      direction: AnomalyDirection;
    }> = [];

    const checks: Array<{ metric: AnomalyMetric; expected: number; actual: number }> = [
      { metric: "revenue", expected: comparison.revenue, actual: target.revenue },
      { metric: "orders", expected: comparison.orderCount, actual: target.orderCount },
      { metric: "units", expected: comparison.units, actual: target.units },
      { metric: "aov", expected: comparisonAOV, actual: targetAOV },
    ];

    for (const check of checks) {
      if (check.expected <= 0) continue;
      const deltaPct = ((check.actual - check.expected) / check.expected) * 100;
      if (Math.abs(deltaPct) < 20) continue;
      anomalies.push({
        tenantId,
        storeId,
        date: targetDate,
        comparisonDate,
        metric: check.metric,
        expected: check.expected,
        actual: check.actual,
        deltaPct,
        severity: calculateSeverity(Math.abs(deltaPct)),
        direction: deltaPct < 0 ? "drop" : "spike",
      });
    }

    if (anomalies.length > 0) {
      await prisma.salesAnomaly.createMany({ data: anomalies });
    }
    invalidateByPrefix(`sales-anomalies:${tenantId}:${storeId}`);
    return anomalies.length;
  },

  async getRecent(
    tenantId: string,
    storeId: string,
    opts?: {
      severity?: AnomalySeverity[];
      direction?: AnomalyDirection;
      acknowledged?: boolean;
      since?: Date;
      limit?: number;
    },
  ): Promise<DbSalesAnomaly[]> {
    const sevKey = opts?.severity?.slice().sort().join(",") ?? "all";
    const ackKey =
      typeof opts?.acknowledged === "boolean" ? String(opts.acknowledged) : "any";
    const sinceKey = opts?.since?.toISOString() ?? "all";
    const cacheKey = `sales-anomalies:${tenantId}:${storeId}:${sevKey}:${opts?.direction ?? "any"}:${ackKey}:${sinceKey}:${opts?.limit ?? 50}`;

    return getOrSet(cacheKey, 1800, async () => {
      const rows = await prisma.salesAnomaly.findMany({
        where: {
          tenantId,
          storeId,
          ...(opts?.severity && { severity: { in: opts.severity } }),
          ...(opts?.direction && { direction: opts.direction }),
          ...(typeof opts?.acknowledged === "boolean" && {
            acknowledgedAt: opts.acknowledged ? { not: null } : null,
          }),
          ...(opts?.since && { createdAt: { gte: opts.since } }),
        },
        orderBy: { createdAt: "desc" },
        take: opts?.limit ?? 50,
      });
      return rows.map(mapSalesAnomaly);
    });
  },

  async acknowledge(tenantId: string, anomalyId: string): Promise<DbSalesAnomaly> {
    // Lectura tenant-scoped (defense-in-depth): findFirst con tenantId evita
    // siquiera leer una anomalía de otro tenant antes del update.
    const existing = await prisma.salesAnomaly.findFirst({ where: { id: anomalyId, tenantId } });
    if (!existing) {
      throw new Error(`Anomaly ${anomalyId} not found for tenant ${tenantId}`);
    }
    const row = await prisma.salesAnomaly.update({
      where: { id: anomalyId },
      data: { acknowledgedAt: new Date() },
    });
    invalidateByPrefix(`sales-anomalies:${tenantId}:`);
    return mapSalesAnomaly(row);
  },

  async markNotified(tenantId: string, anomalyIds: string[]): Promise<number> {
    if (anomalyIds.length === 0) return 0;
    const result = await prisma.salesAnomaly.updateMany({
      where: { id: { in: anomalyIds }, tenantId },
      data: { notifiedAt: new Date() },
    });
    invalidateByPrefix(`sales-anomalies:${tenantId}:`);
    return result.count;
  },
};
