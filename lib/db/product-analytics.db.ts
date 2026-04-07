import "server-only";
import { prisma } from "@/lib/prisma";
import type { ProductAnalytics as PProductAnalytics } from "@/lib/generated/prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbProductAnalytics = {
  id: string;
  productId: number;
  tenantId: string;
  date: string;
  views: number;
  clicks: number;
  addsToCart: number;
  conversions: number;
  revenue: number;
  createdAt: string;
  updatedAt: string;
};

export type DbAnalyticsSummary = {
  totalViews: number;
  totalClicks: number;
  totalAddsToCart: number;
  totalConversions: number;
  totalRevenue: number;
};

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapAnalytics(r: PProductAnalytics): DbProductAnalytics {
  return {
    id: r.id,
    productId: r.productId,
    tenantId: r.tenantId,
    date: r.date.toISOString(),
    views: r.views,
    clicks: r.clicks,
    addsToCart: r.addsToCart,
    conversions: r.conversions,
    revenue: r.revenue,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ── DB Class ──────────────────────────────────────────────────────────────────

export const ProductAnalyticsDB = {
  async track(
    tenantId: string,
    productId: number,
    metric: "view" | "click" | "addToCart" | "conversion",
    revenue?: number
  ): Promise<void> {
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const incrementMap: Record<typeof metric, object> = {
      view: { views: { increment: 1 } },
      click: { clicks: { increment: 1 } },
      addToCart: { addsToCart: { increment: 1 } },
      conversion: {
        conversions: { increment: 1 },
        ...(revenue != null ? { revenue: { increment: revenue } } : {}),
      },
    };

    await prisma.productAnalytics.upsert({
      where: { productId_date_tenantId: { productId, date, tenantId } },
      create: {
        productId,
        tenantId,
        date,
        views: metric === "view" ? 1 : 0,
        clicks: metric === "click" ? 1 : 0,
        addsToCart: metric === "addToCart" ? 1 : 0,
        conversions: metric === "conversion" ? 1 : 0,
        revenue: metric === "conversion" && revenue != null ? revenue : 0,
      },
      update: incrementMap[metric],
    });
  },

  async getByProduct(
    tenantId: string,
    productId: number,
    days: number
  ): Promise<DbProductAnalytics[]> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);

    const rows = await prisma.productAnalytics.findMany({
      where: { tenantId, productId, date: { gte: since } },
      orderBy: { date: "asc" },
    });
    return rows.map(mapAnalytics);
  },

  async getTopProducts(
    tenantId: string,
    metric: "views" | "clicks" | "addsToCart" | "conversions" | "revenue",
    limit: number
  ): Promise<{ productId: number; total: number }[]> {
    const groups = await prisma.productAnalytics.groupBy({
      by: ["productId"],
      where: { tenantId },
      _sum: { [metric]: true },
      orderBy: { _sum: { [metric]: "desc" } },
      take: limit,
    });

    return groups.map((g) => ({
      productId: g.productId,
      total: (g._sum as Record<string, number | null>)[metric] ?? 0,
    }));
  },

  async getTenantSummary(tenantId: string, days: number): Promise<DbAnalyticsSummary> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);

    const agg = await prisma.productAnalytics.aggregate({
      where: { tenantId, date: { gte: since } },
      _sum: {
        views: true,
        clicks: true,
        addsToCart: true,
        conversions: true,
        revenue: true,
      },
    });

    return {
      totalViews: agg._sum.views ?? 0,
      totalClicks: agg._sum.clicks ?? 0,
      totalAddsToCart: agg._sum.addsToCart ?? 0,
      totalConversions: agg._sum.conversions ?? 0,
      totalRevenue: agg._sum.revenue ?? 0,
    };
  },
};
