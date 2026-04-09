import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/price-comparison?productId=123
 *
 * Returns competitor price comparison data for a product.
 * Data source: Settings DB (admin-configured via PriceBenchmarkTab).
 * Public endpoint — no auth required (read-only, non-sensitive data).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return NextResponse.json({ comparison: null });
  }

  try {
    // Try to read price comparison data from DB settings (stored in storeThemeJson)
    const { prisma } = await import("@/lib/prisma");
    const settings = await prisma.settings.findFirst({
      where: { tenantId: "main" },
      select: { storeThemeJson: true },
    });

    const themeData = settings?.storeThemeJson ? JSON.parse(settings.storeThemeJson) : null;
    const priceCompData = themeData?.priceComparisonData;

    if (!priceCompData) {
      return NextResponse.json({ comparison: null });
    }

    const data = typeof priceCompData === "string"
      ? JSON.parse(priceCompData)
      : priceCompData;

    // Find this product's comparison
    const products = data?.products ?? [];
    const product = products.find(
      (p: { productId: string }) => String(p.productId) === String(productId)
    );

    if (!product) {
      return NextResponse.json({ comparison: null });
    }

    // Calculate market average from competitor prices
    const competitors = data?.competitors ?? [];
    const competitorPrices = Object.entries(product.prices ?? {})
      .map(([compId, price]) => ({
        name: competitors.find((c: { id: string }) => c.id === compId)?.name ?? "Competidor",
        price: price as number | null,
      }))
      .filter((p): p is { name: string; price: number } => p.price != null && p.price > 0);

    if (competitorPrices.length === 0) {
      return NextResponse.json({ comparison: null });
    }

    const marketAvg = competitorPrices.reduce((s, p) => s + p.price, 0) / competitorPrices.length;
    const savings = marketAvg - product.myPrice;
    const savingsPercent = marketAvg > 0 ? (savings / marketAvg) * 100 : 0;

    return NextResponse.json({
      comparison: {
        myPrice: product.myPrice,
        marketAverage: Math.round(marketAvg * 100) / 100,
        savings: Math.round(savings * 100) / 100,
        savingsPercent: Math.round(savingsPercent * 10) / 10,
        cheaperThanMarket: savings > 0,
        competitorCount: competitorPrices.length,
      },
    });
  } catch {
    return NextResponse.json({ comparison: null });
  }
}
