import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { INGRESO_ORDER_STATUSES } from "@/lib/finance/finance-kpis";
import { utcMonthRange } from "@/lib/finance/monthly-range";
import { logger } from "@/lib/logger";

/**
 * GET /api/finanzas/monthly-summary?months=6
 *
 * Ingresos mensuales agregados server-side: Σ Sale.total + Σ Order.total (con
 * INGRESO_ORDER_STATUSES), por mes. Reemplaza el fetch de /api/orders?limit=5000
 * que traía las filas crudas al cliente para que FinanzasModule las bucketeara.
 *
 * @prisma-direct ok — agregados con scope explícito por `auth.tenantId`.
 * Bucketing UTC (utcMonthRange) → coincide EXACTO con el cliente (createdAt
 * .slice(0,7)). Verificado en __tests__/lib/monthly-range.test.ts.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const monthsParam = Number(new URL(req.url).searchParams.get("months"));
  const months = Math.min(24, Math.max(1, Number.isFinite(monthsParam) && monthsParam > 0 ? monthsParam : 6));

  try {
    const payload = await getOrSet(
      `finanzas:monthly-summary:${auth.tenantId}:${months}`,
      120,
      async () => {
        const ref = new Date();
        const result: { month: string; ingresos: number }[] = [];
        for (let i = months - 1; i >= 0; i--) {
          const { monthKey, start, end } = utcMonthRange(ref, i);
          const [saleAgg, orderAgg] = await Promise.all([
            prisma.sale.aggregate({
              _sum: { total: true },
              where: { tenantId: auth.tenantId, createdAt: { gte: start, lt: end } },
            }),
            prisma.order.aggregate({
              _sum: { total: true },
              where: {
                tenantId: auth.tenantId,
                createdAt: { gte: start, lt: end },
                status: { in: [...INGRESO_ORDER_STATUSES] },
              },
            }),
          ]);
          result.push({
            month: monthKey,
            ingresos: toNumOrZero(saleAgg._sum.total) + toNumOrZero(orderAgg._sum.total),
          });
        }
        return result;
      },
    );
    return NextResponse.json(payload);
  } catch (err) {
    logger.error("[finanzas/monthly-summary] failed", { error: String(err) });
    return NextResponse.json({ error: "No se pudo cargar el resumen mensual" }, { status: 500 });
  }
}
