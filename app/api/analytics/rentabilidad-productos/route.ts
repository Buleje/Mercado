import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  AnalyticsRentabilidadDB,
  type RentabilidadProductLineRaw,
} from "@/lib/db/analytics-rentabilidad.db";
import { logger } from "@/lib/logger";

export type ProductProfitLine = {
  productId: number;
  product: string;
  category: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossMargin: number;
  marginPct: number;
  /** true cuando alguna línea no traía costo y se usó el costo actual del producto. */
  costEstimated: boolean;
};

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

/**
 * GET /api/analytics/rentabilidad-productos?days=30
 *
 * Margen bruto POR PRODUCTO (el de `/api/analytics/rentabilidad` es por día).
 * Combina POS + órdenes online, igual que `/api/analytics/abc`, para que el
 * total case con lo que el dueño ve en sus reportes de ventas.
 *
 * El costo sale de `costPrice` congelado en la línea; si falta, cae al costo
 * actual del producto y la línea se marca con `costEstimated` para que la UI
 * pueda advertir que ese margen es aproximado.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenantId = auth.tenantId;

    const daysRaw = Number(req.nextUrl.searchParams.get("days") ?? DEFAULT_DAYS);
    const days =
      Number.isFinite(daysRaw) && daysRaw > 0
        ? Math.min(Math.floor(daysRaw), MAX_DAYS)
        : DEFAULT_DAYS;

    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

    const [saleLines, orderLines] = await Promise.all([
      AnalyticsRentabilidadDB.getSaleLinesByProduct(tenantId, since),
      AnalyticsRentabilidadDB.getOrderLinesByProduct(tenantId, since),
    ]);

    type Agg = {
      product: string;
      category: string;
      unitsSold: number;
      revenue: number;
      cogs: number;
      costEstimated: boolean;
    };
    const map = new Map<number, Agg>();

    const add = (line: RentabilidadProductLineRaw) => {
      const unitCost = line.costPrice ?? line.productCostPrice ?? 0;
      const entry = map.get(line.productId) ?? {
        product: line.name,
        category: line.category ?? "Sin categoría",
        unitsSold: 0,
        revenue: 0,
        cogs: 0,
        costEstimated: false,
      };
      entry.unitsSold += line.quantity;
      entry.revenue += line.price * line.quantity;
      entry.cogs += unitCost * line.quantity;
      if (line.costPrice === null) entry.costEstimated = true;
      map.set(line.productId, entry);
    };

    for (const line of saleLines) add(line);
    for (const line of orderLines) add(line);

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const lines: ProductProfitLine[] = Array.from(map.entries())
      .map(([productId, a]) => {
        const revenue = round2(a.revenue);
        const cogs = round2(a.cogs);
        const grossMargin = round2(revenue - cogs);
        return {
          productId,
          product: a.product,
          category: a.category,
          unitsSold: a.unitsSold,
          revenue,
          cogs,
          grossMargin,
          marginPct: revenue > 0 ? Math.round((grossMargin / revenue) * 1000) / 10 : 0,
          costEstimated: a.costEstimated,
        };
      })
      .sort((x, y) => y.grossMargin - x.grossMargin);

    const totalRevenue = round2(lines.reduce((s, l) => s + l.revenue, 0));
    const totalCogs = round2(lines.reduce((s, l) => s + l.cogs, 0));
    const totalMargin = round2(totalRevenue - totalCogs);

    return NextResponse.json({
      lines,
      periodDays: days,
      since: since.toISOString().slice(0, 10),
      resumen: {
        totalRevenue,
        totalCogs,
        totalMargin,
        marginPct:
          totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 1000) / 10 : 0,
        totalUnits: lines.reduce((s, l) => s + l.unitsSold, 0),
      },
    });
  } catch (e) {
    logger.error("[analytics/rentabilidad-productos] GET error", {
      error: (e as Error).message,
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
