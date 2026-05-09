/**
 * GET /api/marketplace/compare?ids=1,2,3,4
 *
 * Resuelve hasta 4 productos para comparación side-by-side.
 * Endpoint público — no requiere auth (marketplace browsing).
 * @cross-tenant intentional — marketplace público cross-store.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MarketplaceCompareDB } from "@/lib/db/marketplace-compare.db";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  ids: z.string().min(1).max(200),
});

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse({
    ids: req.nextUrl.searchParams.get("ids") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "ids requerido" }, { status: 400 });
  }

  const ids = parsed.data.ids
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 4); // Hard-cap 4 para evitar abuso

  if (ids.length === 0) {
    return NextResponse.json({ data: [] });
  }

  try {
    // tenantId del tenant "main" — scope global del marketplace.
    const tenantId = await MarketplaceCompareDB.getMainTenantId();
    const data = await MarketplaceCompareDB.getProductsForCompare(tenantId, ids);

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=60",
          "X-Total-Count": String(data.length),
        },
      },
    );
  } catch (err) {
    logger.error("[marketplace/compare] failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
