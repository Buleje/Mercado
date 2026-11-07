/**
 * El catálogo de la tienda de cualquier negocio (`/t/<negocio>/tienda`,
 * ADR-511; el formato del de Musa). Buscar, filtrar por las categorías DEL
 * NEGOCIO, ordenar (precio, lo más nuevo, descuento) y la grilla de tarjetas
 * con «Agregar» → contador. El encabezado, el pie y la bolsa los pone el marco.
 *
 * `Catalogo` devuelve AL INSTANTE (el tope de 2 s del enchufe nunca salta por
 * la base): los datos se leen adentro, bajo <Suspense> con un esqueleto. Trae
 * su propia hoja de la paleta: si el marco faltara, no queda sin colores.
 *
 * `key` del cliente = los filtros que vinieron en la URL: si el buscador del
 * encabezado navega a `?q=pizza` estando acá, el catálogo se rearma con esa
 * búsqueda (el estado de antes no la pisa).
 */
import "server-only";
import { Suspense } from "react";
import type { ParametrosDeBusqueda, PropsPagina } from "../_contrato";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { CatalogoCliente } from "./CatalogoCliente";
import { cargarTienda } from "./datos";
import { leerFiltros } from "./filtros";
import { marcasDe, nombresDeCategorias } from "./producto-carrito";
import { cssTema, ID_PAGINA_TIENDA } from "./tema";
import { ANCHO, CSS_PIEZAS } from "./ui";

async function CatalogoDelNegocio({ tenantId, slug, busqueda }: { tenantId: string; slug: string; busqueda: ParametrosDeBusqueda }) {
  const d = await cargarTienda({ tenantId, slug });
  const marcas = marcasDe(d.productos);
  const inicial = leerFiltros(busqueda, d.categorias, marcas);
  const listado = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Catálogo de ${d.negocio.nombre}`,
    numberOfItems: d.productos.length,
    itemListElement: d.productos.slice(0, 100).map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.nombre, url: p.href })),
  };

  return (
    <main id="main-content">
      <style dangerouslySetInnerHTML={{ __html: cssTema(d.tema) + CSS_PIEZAS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(listado) }} />
      <CatalogoCliente
        key={JSON.stringify(inicial)}
        productos={d.productos}
        categorias={d.categorias}
        nombres={nombresDeCategorias(d)}
        marcas={marcas}
        inicial={inicial}
        slug={d.negocio.slug}
        nombre={d.negocio.nombre}
        lema={d.negocio.lema}
        whatsapp={d.negocio.whatsapp}
      />
    </main>
  );
}

/** Mientras llegan los datos: el título, las píldoras y una grilla de tarjetas. */
export function EsqueletoCatalogo() {
  const bloque = "animate-pulse bg-[var(--ti-suave)]";
  return (
    <div aria-busy="true" aria-label="Cargando el catálogo" role="status">
      <div className="border-b border-[var(--ti-linea-suave)]">
        <div className={`${ANCHO} flex flex-col gap-4 py-8 sm:py-12`}>
          <div className={`${bloque} h-4 w-40 rounded`} />
          <div className={`${bloque} h-12 w-64 max-w-full rounded`} />
          <div className={`${bloque} h-4 w-24 rounded`} />
        </div>
      </div>
      <div className={`${ANCHO} py-6 sm:py-8`}>
        <div className={`${bloque} h-12 w-full rounded-full md:w-[22rem]`} />
        <div className="mt-4 flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`${bloque} h-12 w-28 shrink-0 rounded-full`} />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:gap-x-6 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}>
              <div className={`${bloque} aspect-square rounded-[var(--ti-radio-tarjeta)]`} />
              <div className={`${bloque} mt-4 h-3 w-16 rounded`} />
              <div className={`${bloque} mt-2 h-4 w-4/5 rounded`} />
              <div className={`${bloque} mt-4 h-12 w-full rounded-[var(--ti-radio-control)]`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Catalogo({ ctx, searchParams }: PropsPagina) {
  return (
    <div data-pagina={ID_PAGINA_TIENDA} className="overflow-x-clip">
      <Suspense fallback={<EsqueletoCatalogo />}>
        <CatalogoDelNegocio tenantId={ctx.tenantId} slug={ctx.slug} busqueda={searchParams} />
      </Suspense>
    </div>
  );
}
