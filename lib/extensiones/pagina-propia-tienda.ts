import "server-only";
import { cache } from "react";
import { ENCHUFE_PAGINA, type ContextoPieza, type MarcoTienda, type PiezaPagina } from "@/extensiones/_contrato";
import { getOrSet } from "@/lib/cache";
import { findTenantByIdOrSlug } from "@/lib/tenant";
import { resolveStoreContext } from "@/lib/store-metadata";
import { elegirPaginaDeLaTienda, type OrigenPagina } from "./elegir-pagina";
import { conTope, reportarFalloPieza } from "./tope";

/**
 * ADR-460 · ¿este pedido de la tienda (`app/(store)/**`) es de un negocio con
 * página propia prendida? Lo usan el layout (marco: encabezado, pie, bolsa) y
 * el catálogo (`/tienda`). Una lectura por pedido (`cache` de React): el
 * layout y la página comparten el resultado.
 *
 * ADR-511: «página propia» acá es lo que elige `elegirPaginaDeLaTienda` — la
 * propia prendida del negocio o, si no tiene, la plantilla `pagina-tienda`
 * (salvo «Clásico»). `origen` dice cuál de las dos.
 *
 * `null` (= la tienda con el diseño general, el árbol de siempre) si:
 * · no es una tienda individual (el marketplace nunca lleva marco);
 * · el negocio no existe, o no tiene página propia y eligió «Clásico»;
 * · el código de la página no carga: tira o pasa el tope de 2 s (se avisa).
 *
 * OJO: en `(store)` el header `x-tenant-id` trae el SLUG (`/t/<slug>/…`) o lo
 * que mande el subdominio. `TenantPieza` se guarda por id: se resuelve el
 * negocio ANTES de buscar piezas (con el slug daba 0 piezas, en silencio).
 */
export interface PaginaPropiaTienda {
  piezaId: string;
  /** `propia` (la del negocio) o `plantilla` (la de todos, ADR-511). */
  origen: OrigenPagina;
  /** El negocio de verdad (id + slug), armado acá desde el host; nunca lo elige la pieza. */
  ctx: ContextoPieza;
  /** Ya pasaron el Zod `.strict()` del manifiesto (lo hace `resolverPiezas`). */
  opciones: Record<string, unknown>;
  pieza: PiezaPagina;
}

export const paginaPropiaDeLaTienda = cache(async (): Promise<PaginaPropiaTienda | null> => {
  const tienda = await resolveStoreContext();
  if (!tienda.isTenant) return null;
  /* slug → id, cacheado 5 min como `tenantExists` (lib/tenant-check.ts): esto
     corre en CADA página de CADA tienda individual, tenga o no página propia,
     y `findTenantByIdOrSlug` sólo deduplica dentro del request (revisión ADR-460). */
  const negocio = await getOrSet<{ id: string; slug: string } | null>(`tienda-id-slug:${tienda.tenantId}`, 300, async () => {
    const t = await findTenantByIdOrSlug(tienda.tenantId).catch(() => null);
    return t ? { id: t.id, slug: t.slug } : null;
  });
  if (!negocio) return null;

  const propia = await elegirPaginaDeLaTienda(negocio.id);
  if (!propia) return null;

  try {
    // `.then` y no una llamada directa: un `throw` síncrono también cae en el catch.
    const pieza = await conTope(Promise.resolve().then(propia.cargar), undefined, `el código de la página propia ${propia.piezaId}`);
    return {
      piezaId: propia.piezaId,
      origen: propia.origen,
      ctx: { tenantId: negocio.id, slug: negocio.slug, enchufe: ENCHUFE_PAGINA },
      opciones: propia.opciones,
      pieza,
    };
  } catch (err) {
    reportarFalloPieza(err, { piezaId: propia.piezaId, enchufe: ENCHUFE_PAGINA, tenantId: negocio.id, etapa: "cargar-tienda" });
    return null;
  }
});

/**
 * El marco armado, o `null` si la página propia no trae `marco` o si
 * `marco()` tira (se avisa y la tienda sigue con el encabezado y el pie generales).
 */
export function marcoDeLaTienda(propia: PaginaPropiaTienda | null): MarcoTienda | null {
  const armar = propia?.pieza.marco;
  if (!propia || !armar) return null;
  try {
    return armar({ ctx: propia.ctx, opciones: propia.opciones });
  } catch (err) {
    reportarFalloPieza(err, { piezaId: propia.piezaId, enchufe: ENCHUFE_PAGINA, tenantId: propia.ctx.tenantId, etapa: "marco" });
    return null;
  }
}
