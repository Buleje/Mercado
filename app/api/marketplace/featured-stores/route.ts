import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFeaturedStoresWithProducts } from "@/lib/db/marketplace-featured.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/featured-stores?limit=10&productsPerStore=3
 *
 * Tiendas destacadas (sin geo) con productos embebidos para la sección
 * "Cerca tuyo" del home. Público, cacheable. Una sola query (sin N+1).
 */
const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
  productsPerStore: z.coerce.number().int().min(0).max(6).default(3),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json({ stores: [] });
    }
    const stores = await getFeaturedStoresWithProducts(parsed.data);
    return NextResponse.json(
      { stores },
      {
        headers: {
          "Cache-Control":
            "public, max-age=120, s-maxage=120, stale-while-revalidate=600",
        },
      },
    );

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
