import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/store-analytics
 *
 * Agregaciones desde `ProductAnalytics` para el panel admin del bodeguero.
 * Devuelve:
 *   - kpis: totales del período (views, addsToCart, conversions, revenue, conv rate, cart abandon rate)
 *   - topByViews: top 10 productos por vistas
 *   - topByRevenue: top 10 productos por revenue
 *   - dailyTrend: serie diaria de views/conversions/revenue
 *
 * Query params:
 *   - days: 7 | 30 | 90 (default 30)
 */

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { days } = parsed.data;
  const tenantId = auth.tenantId;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    // 1) Aggregate KPIs del período (totals)
    const totalsRaw = await prisma.productAnalytics.aggregate({
      where: { tenantId, date: { gte: since } },
      _sum: { views: true, clicks: true, addsToCart: true, conversions: true, revenue: true },
    });
    const totals = {
      views:       totalsRaw._sum.views ?? 0,
      clicks:      totalsRaw._sum.clicks ?? 0,
      addsToCart:  totalsRaw._sum.addsToCart ?? 0,
      conversions: totalsRaw._sum.conversions ?? 0,
      revenue:     Number(totalsRaw._sum.revenue ?? 0),
    };

    const conversionRate = totals.views > 0 ? totals.conversions / totals.views : 0;
    const cartAbandonRate = totals.addsToCart > 0
      ? Math.max(0, (totals.addsToCart - totals.conversions) / totals.addsToCart)
      : 0;

    // 2) Top 10 por views (productAnalytics agrupado por productId)
    const topViewsRaw = await prisma.productAnalytics.groupBy({
      by: ["productId"],
      where: { tenantId, date: { gte: since } },
      _sum: { views: true, addsToCart: true, conversions: true, revenue: true },
      orderBy: { _sum: { views: "desc" } },
      take: 10,
    });

    const topRevenueRaw = await prisma.productAnalytics.groupBy({
      by: ["productId"],
      where: { tenantId, date: { gte: since } },
      _sum: { views: true, addsToCart: true, conversions: true, revenue: true },
      orderBy: { _sum: { revenue: "desc" } },
      take: 10,
    });

    // Bring product names for display
    const productIds = Array.from(new Set([
      ...topViewsRaw.map((r) => r.productId),
      ...topRevenueRaw.map((r) => r.productId),
    ]));

    const products = productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds }, tenantId },
          select: { id: true, name: true, image: true, category: true, price: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const topByViews = topViewsRaw.map((r) => ({
      productId: r.productId,
      name:      productMap.get(r.productId)?.name ?? `Producto ${r.productId}`,
      image:     productMap.get(r.productId)?.image ?? null,
      category:  productMap.get(r.productId)?.category ?? null,
      price:     Number(productMap.get(r.productId)?.price ?? 0),
      views:        r._sum.views ?? 0,
      addsToCart:   r._sum.addsToCart ?? 0,
      conversions:  r._sum.conversions ?? 0,
      revenue:      Number(r._sum.revenue ?? 0),
      conversionRate: (r._sum.views ?? 0) > 0
        ? (r._sum.conversions ?? 0) / (r._sum.views ?? 1)
        : 0,
    }));

    const topByRevenue = topRevenueRaw.map((r) => ({
      productId: r.productId,
      name:      productMap.get(r.productId)?.name ?? `Producto ${r.productId}`,
      image:     productMap.get(r.productId)?.image ?? null,
      category:  productMap.get(r.productId)?.category ?? null,
      price:     Number(productMap.get(r.productId)?.price ?? 0),
      views:        r._sum.views ?? 0,
      addsToCart:   r._sum.addsToCart ?? 0,
      conversions:  r._sum.conversions ?? 0,
      revenue:      Number(r._sum.revenue ?? 0),
      conversionRate: (r._sum.views ?? 0) > 0
        ? (r._sum.conversions ?? 0) / (r._sum.views ?? 1)
        : 0,
    }));

    // 3) Daily trend
    const dailyRaw = await prisma.productAnalytics.groupBy({
      by: ["date"],
      where: { tenantId, date: { gte: since } },
      _sum: { views: true, addsToCart: true, conversions: true, revenue: true },
      orderBy: { date: "asc" },
    });
    const dailyTrend = dailyRaw.map((r) => ({
      date:        r.date.toISOString().slice(0, 10),
      views:       r._sum.views ?? 0,
      addsToCart:  r._sum.addsToCart ?? 0,
      conversions: r._sum.conversions ?? 0,
      revenue:     Number(r._sum.revenue ?? 0),
    }));

    return NextResponse.json({
      ok: true,
      period: { days, since: since.toISOString() },
      kpis: {
        ...totals,
        conversionRate,
        cartAbandonRate,
      },
      topByViews,
      topByRevenue,
      dailyTrend,
    });
  } catch (err) {
    logger.error("[store-analytics] error", { error: String(err), tenantId });
    return NextResponse.json(
      { error: "No se pudieron obtener las analíticas", detail: String(err).slice(0, 200) },
      { status: 500 },
    );
  }
}
