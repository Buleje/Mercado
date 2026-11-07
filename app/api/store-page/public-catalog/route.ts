import { NextRequest, NextResponse } from "next/server";
import { CatalogoPublicoDB } from "@/lib/db/catalogo-publico.db";
import { resolverNegocioPublico } from "@/lib/tienda-publica/negocio-publico";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

/**
 * GET /api/store-page/public-catalog
 *
 * Endpoint PÚBLICO (sin auth) con los productos que muestra la tienda
 * individual `/t/[slug]/tienda`: activos y sin ocultar en «Página de la tienda».
 *
 * - El negocio sale de `x-tenant-id` (el proxy lo arma con el host o la página
 *   `/t/<slug>` de origen) y pasa por `resolverNegocioPublico`: antes la
 *   cabecera cruda (slug del subdominio, `custom--<dominio>`) iba directo al
 *   WHERE y esas tiendas recibían una lista vacía.
 * - Solo campos públicos: sin costo y sin la cantidad en stock (`disponible`).
 */
export async function GET(req: NextRequest) {
  const tenantCrudo = req.headers.get("x-tenant-id");
  if (!tenantCrudo) {
    return NextResponse.json({ error: "tenant required" }, { status: 400 });
  }

  try {
    const r = await resolverNegocioPublico({ tienda: null, tenantCrudo, origen: req.nextUrl.origin });
    if (!r.ok) return NextResponse.json({ error: "No encontramos esa tienda." }, { status: 404 });

    const list = await withDbRetry(() => CatalogoPublicoDB.productos(r.negocio.tenantId));
    return NextResponse.json(
      list.map((p) => ({
        productId: p.id,
        name: p.nombre,
        image: p.imagen,
        category: p.categoria,
        unit: p.unidad,
        price: p.precio,
        disponible: p.disponible,
      })),
    );
  } catch (e) {
    logger.error("[store-page/public-catalog] GET error", {
      err: e instanceof Error ? e.message : String(e),
      tenantCrudo,
    });
    return NextResponse.json([], { status: 200 });
  }
}
