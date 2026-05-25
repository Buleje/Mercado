import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFeaturedNearby } from "@/lib/db/marketplace-featured.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/marketplace/featured-near-me?lat=X&lng=Y&radiusKm=50&limit=6
 *
 * Endpoint público (no requiere auth). El usuario pasa sus coords; el
 * server filtra stores publicadas dentro del radio y devuelve top 6
 * con productos destacados embebidos para el quick-preview drawer.
 *
 * Si el cliente no envía lat/lng (no logueado o sin geolocation), el
 * componente que consume este endpoint ya oculta la sección — pero
 * por defensa devolvemos `[]` en lugar de 400 para que el cliente
 * degrade silenciosamente.
 */

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(500).default(
    Number(process.env.NEXT_PUBLIC_FEATURED_RADIUS_KM ?? 50),
  ),
  limit: z.coerce.number().min(1).max(12).default(6),
});

export async function GET(req: NextRequest) {
  try {
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = QuerySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json({ stores: [] });
    }

    const stores = await getFeaturedNearby({
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      radiusKm: parsed.data.radiusKm,
      limit: parsed.data.limit,
      productsPerStore: 4,
    });

    return NextResponse.json({ stores }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
