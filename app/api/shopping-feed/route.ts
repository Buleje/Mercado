import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { newTraceId, toErrorPayload } from "@/lib/api-error";
import { CatalogoPublicoDB } from "@/lib/db/catalogo-publico.db";
import { resolverNegocioPublico } from "@/lib/tienda-publica/negocio-publico";
import { armarFeedXml } from "@/lib/tienda-publica/feed-productos";
import { resolveTenantFromHost } from "@/lib/middleware/tenant";

/**
 * GET /api/shopping-feed[?tienda=<slug>] — feed de productos de UN negocio
 * para Google Merchant Center / catálogo de Meta (RSS 2.0 + `g:`).
 *
 * El negocio sale del host (subdominio, dominio propio, la principal → el
 * negocio por defecto) o de `?tienda=<slug>`; ver `resolverNegocioPublico`.
 * Antes publicaba los productos activos de TODOS los negocios con la marca
 * «Buleje» fija y enlaces `/tienda/<id>` que daban «Producto no encontrado».
 *
 * Público (lo lee el robot de Google, sin sesión): solo lo que la tienda ya
 * muestra, sin costo ni cantidad en stock. Negocio inexistente, dado de baja o
 * con la página despublicada → 404; `?tienda=` mal formado → 400.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const r = await resolverNegocioPublico({
      tienda: req.nextUrl.searchParams.get("tienda"),
      // Solo el host (no la sesión ni la página de origen que suma el proxy):
      // la respuesta es cacheable por URL y la misma para todos.
      tenantCrudo: resolveTenantFromHost(req),
      origen: req.nextUrl.origin,
    });
    if (!r.ok) {
      const message = r.status === 400 ? "El parámetro «tienda» no es válido." : "No encontramos esa tienda.";
      return NextResponse.json({ message, traceId }, { status: r.status, headers: { "x-trace-id": traceId } });
    }

    const { negocio } = r;
    const productos = await CatalogoPublicoDB.productos(negocio.tenantId);
    const { xml, items } = armarFeedXml({ nombre: negocio.nombre, base: negocio.base }, productos, new Date());
    logger.info("[shopping-feed] feed armado", { traceId, tenantId: negocio.tenantId, items });

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "x-trace-id": traceId,
      },
    });
  } catch (err) {
    logger.error("[shopping-feed] error armando el feed", {
      traceId,
      err: err instanceof Error ? err.message : String(err),
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
