/**
 * lib/db/admin-store-analytics.db.ts
 *
 * DB class para analíticas de ProductAnalytics en el panel admin (bodeguero).
 * Audit project-wide 2026-05-19 — migración regla #1 CLAUDE.md.
 *
 * Responsabilidades:
 *  - KPI totales de views/clicks/addsToCart/conversions/revenue por período
 *  - Top productos por views y por revenue (groupBy + lookup de nombres)
 *  - Serie diaria de tendencias
 */
import "server-only";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export type StoreAnalyticsTotals = {
  views: number;
  clicks: number;
  addsToCart: number;
  conversions: number;
  revenue: number;
};

export type TopProduct = {
  productId: number;
  name: string;
  image: string | null;
  category: string | null;
  price: number;
  views: number;
  addsToCart: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
};

export type DailyTrendPoint = {
  date: string; // "YYYY-MM-DD"
  views: number;
  addsToCart: number;
  conversions: number;
  revenue: number;
};

export type StoreAnalyticsResult = {
  totals: StoreAnalyticsTotals;
  topByViews: TopProduct[];
  topByRevenue: TopProduct[];
  dailyTrend: DailyTrendPoint[];
};

// ---------------------------------------------------------------------------
// Helper interno
// ---------------------------------------------------------------------------

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber(): number }).toNumber();
  }
  return Number(v);
}

// ---------------------------------------------------------------------------
// Clase principal
// ---------------------------------------------------------------------------

export class AdminStoreAnalyticsDB {
  /**
   * Obtiene todas las analíticas de ProductAnalytics para el panel admin.
   *
   * @param tenantId  — aislamiento multi-tenant (siempre 1er argumento)
   * @param since     — fecha de inicio del período
   */
  static async getAnalytics(
    tenantId: string,
    since: Date,
  ): Promise<StoreAnalyticsResult> {
    // 1) KPI totales del período
    const totalsRaw = await prisma.productAnalytics.aggregate({
      where: { tenantId, date: { gte: since } },
      _sum: {
        views: true,
        clicks: true,
        addsToCart: true,
        conversions: true,
        revenue: true,
      },
    });

    const totals: StoreAnalyticsTotals = {
      views: totalsRaw._sum.views ?? 0,
      clicks: totalsRaw._sum.clicks ?? 0,
      addsToCart: totalsRaw._sum.addsToCart ?? 0,
      conversions: totalsRaw._sum.conversions ?? 0,
      revenue: toNum(totalsRaw._sum.revenue),
    };

    // 2) Top 10 por views
    const topViewsRaw = await prisma.productAnalytics.groupBy({
      by: ["productId"],
      where: { tenantId, date: { gte: since } },
      _sum: { views: true, addsToCart: true, conversions: true, revenue: true },
      orderBy: { _sum: { views: "desc" } },
      take: 10,
    });

    // 3) Top 10 por revenue
    const topRevenueRaw = await prisma.productAnalytics.groupBy({
      by: ["productId"],
      where: { tenantId, date: { gte: since } },
      _sum: { views: true, addsToCart: true, conversions: true, revenue: true },
      orderBy: { _sum: { revenue: "desc" } },
      take: 10,
    });

    // 4) Lookup de nombres de productos (batch único para los dos tops)
    const productIds = Array.from(
      new Set([
        ...topViewsRaw.map((r) => r.productId),
        ...topRevenueRaw.map((r) => r.productId),
      ]),
    );

    const products =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: productIds }, tenantId },
            select: { id: true, name: true, image: true, category: true, price: true },
          })
        : [];

    const productMap = new Map(products.map((p) => [p.id, p]));

    const mapRow = (r: (typeof topViewsRaw)[number]): TopProduct => {
      const meta = productMap.get(r.productId);
      const views = r._sum.views ?? 0;
      const conversions = r._sum.conversions ?? 0;
      return {
        productId: r.productId,
        name: meta?.name ?? `Producto ${r.productId}`,
        image: meta?.image ?? null,
        category: meta?.category ?? null,
        price: toNum(meta?.price),
        views,
        addsToCart: r._sum.addsToCart ?? 0,
        conversions,
        revenue: toNum(r._sum.revenue),
        conversionRate: views > 0 ? conversions / views : 0,
      };
    };

    const topByViews = topViewsRaw.map(mapRow);
    const topByRevenue = topRevenueRaw.map(mapRow);

    // 5) Serie diaria
    const dailyRaw = await prisma.productAnalytics.groupBy({
      by: ["date"],
      where: { tenantId, date: { gte: since } },
      _sum: { views: true, addsToCart: true, conversions: true, revenue: true },
      orderBy: { date: "asc" },
    });

    const dailyTrend: DailyTrendPoint[] = dailyRaw.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      views: r._sum.views ?? 0,
      addsToCart: r._sum.addsToCart ?? 0,
      conversions: r._sum.conversions ?? 0,
      revenue: toNum(r._sum.revenue),
    }));

    return { totals, topByViews, topByRevenue, dailyTrend };
  }
}
