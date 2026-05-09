export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ProductAnalyticsDB } from "@/lib/db/product-analytics.db";
import { getOrSet } from "@/lib/cache";
import { z } from "zod";

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id: idStr } = await params;
  const productId = parseInt(idStr, 10);
  if (isNaN(productId)) {
    return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
  }

  const queryParsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!queryParsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos", issues: queryParsed.error.issues }, { status: 400 });
  }

  const { days } = queryParsed.data;
  const cacheKey = `analytics:product:${productId}:${days}`;

  const result = await getOrSet(cacheKey, 300, async () => {
    const daily = await ProductAnalyticsDB.getByProduct(auth.tenantId, productId, days);

    const totals = daily.reduce(
      (acc, row) => ({
        views: acc.views + row.views,
        clicks: acc.clicks + row.clicks,
        addsToCart: acc.addsToCart + row.addsToCart,
        conversions: acc.conversions + row.conversions,
        revenue: acc.revenue + row.revenue,
      }),
      { views: 0, clicks: 0, addsToCart: 0, conversions: 0, revenue: 0 }
    );

    const conversionRate = totals.views > 0
      ? totals.conversions / totals.views
      : 0;

    return { daily, totals, conversionRate };
  });

  return NextResponse.json(result);
}
