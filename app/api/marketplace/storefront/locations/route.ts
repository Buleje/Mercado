/**
 * GET /api/marketplace/storefront/locations?stores=slug1,slug2,...
 *
 * Endpoint público que devuelve la ubicación (lat/lng) y datos mínimos
 * de cada tienda del carrito, para pintar el marker de origen en el mapa
 * del modal de "pedido confirmado".
 *
 * Solo expone campos seguros: slug, name, lat, lng, zone, logo. Si la
 * tienda no tiene coords cargadas, devuelve `lat: null` y el cliente
 * cae al fallback de geocoding por nombre+ciudad.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { applyRateLimit } from "@/lib/rate-limit";

const QuerySchema = z.object({
  stores: z
    .string()
    .min(1)
    .max(500)
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => /^[a-z0-9-]{2,64}$/.test(x))
        .slice(0, 10),
    ),
});

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "store-location");
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({ stores: searchParams.get("stores") ?? "" });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Falta el parámetro `stores=slug1,slug2`" },
      { status: 400 },
    );
  }

  const slugs = parsed.data.stores;
  if (slugs.length === 0) return NextResponse.json({ stores: [] });

  const stores = await MarketplacePublicDB.getStoreLocationsBySlugs(slugs);

  return NextResponse.json(
    { stores },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } },
  );
}
