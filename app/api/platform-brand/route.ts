import "server-only";
import { NextResponse } from "next/server";
import { getPlatformBrand, resolveActiveBrand } from "@/lib/platform-brand";

/**
 * GET /api/platform-brand — endpoint público, sin auth.
 *
 * Devuelve la marca EFECTIVA (con event mode resuelto si está activo + dentro
 * de ventana). Cualquier página/componente puede consumirlo para renderizar
 * logos, colores, contacto, etc.
 *
 * Cache CDN 5min + SWR 1h. Cambios desde superadmin tardarán hasta 5min en
 * propagar (aceptable para marca; no es transaccional).
 */
export async function GET() {
  const brand = await getPlatformBrand();
  const active = resolveActiveBrand(brand);
  return NextResponse.json(active, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
