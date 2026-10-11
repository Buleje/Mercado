/**
 * El catálogo propio de Musa (`/t/<negocio>/tienda`, ADR-460; contrato visual
 * §e «Catálogo»): título en versalitas con su línea script, píldoras de
 * categoría, ordenar y filtrar, la grilla de tarjetas con el envase ilustrado
 * y el contador al agregar, y los beneficios. El encabezado, el pie y la bolsa
 * los pone el marco (layout de la tienda).
 *
 * SÓLO lo del salón (las categorías de `CATEGORIAS` + servicios, igual que la
 * portada): el resto del catálogo del negocio no sale acá ni se borra.
 *
 * `Catalogo` devuelve AL INSTANTE (el tope de 2 s nunca salta por la base):
 * los datos se leen adentro, bajo <Suspense> con un esqueleto de la marca.
 * Trae su propia hoja de la paleta (`CSS_TEMA`): si el marco faltara, el
 * catálogo no queda sin colores.
 */
import "server-only";
import { Suspense } from "react";
import type { ParametrosDeBusqueda, PropsPagina } from "../_contrato";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { CATEGORIAS } from "./anuncios";
import { CatalogoCliente } from "./CatalogoCliente";
import { cargarMarco, cargarVitrina } from "./datos";
import { leerFiltros } from "./filtros";
import type { Opciones } from "./manifest";
import { Beneficios } from "./Pie";
import { CSS_TEMA, ID_PAGINA } from "./tema";
import { ANCHO } from "./ui";

async function CatalogoSalon({ tenantId, slug, busqueda }: { tenantId: string; slug: string; busqueda: ParametrosDeBusqueda }) {
  const [m, v] = await Promise.all([cargarMarco(tenantId), cargarVitrina(tenantId, slug)]);
  const categorias = CATEGORIAS.filter((c) => v.productos.some((p) => p.categoria === c.nombre)).map((c) => ({ nombre: c.nombre, texto: c.texto }));
  const marcas = [...new Set(v.productos.map((p) => p.marca).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "es"));
  const inicial = leerFiltros(
    busqueda,
    categorias.map((c) => c.nombre),
    marcas,
  );
  const listado = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Catálogo de ${m.nombre}`,
    numberOfItems: v.productos.length,
    itemListElement: v.productos.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.nombre, url: p.href })),
  };

  return (
    <main id="main-content">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(listado) }} />
      <CatalogoCliente
        productos={v.productos}
        servicios={v.servicios}
        categorias={categorias}
        marcas={marcas}
        inicial={inicial}
        slug={slug}
        nombre={m.nombre}
        whatsapp={m.whatsapp}
      />
      <Beneficios pagos={m.pagos} nombre={m.nombre} />
    </main>
  );
}

/** Mientras llegan los datos: el título, las píldoras y una grilla de tarjetas (con su arco). */
function EsqueletoCatalogo() {
  const bloque = "animate-pulse bg-[var(--mu-nude-claro)]";
  return (
    <div aria-busy="true" aria-label="Cargando el catálogo" role="status">
      <div className="border-b border-[var(--rule-soft)] bg-[var(--mu-hueso)]">
        <div className={`${ANCHO} flex flex-col gap-4 py-8 sm:py-12`}>
          <div className={`${bloque} h-4 w-40 rounded`} />
          <div className={`${bloque} h-14 w-72 rounded`} />
          <div className={`${bloque} h-10 w-44 rounded`} />
        </div>
      </div>
      <div className={`${ANCHO} py-6 sm:py-8`}>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`${bloque} h-12 w-32 shrink-0 rounded-full`} />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-6 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-[var(--mu-radio-tarjeta)] border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
              <div className={`${bloque} aspect-square`} />
              <div className="flex flex-col gap-2 p-4">
                <div className={`${bloque} h-3 w-16 rounded`} />
                <div className={`${bloque} h-4 w-4/5 rounded`} />
                <div className={`${bloque} mt-2 h-10 w-full rounded-full`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Catalogo({ ctx, searchParams }: PropsPagina<Opciones>) {
  return (
    <div data-pagina={ID_PAGINA} className="overflow-x-clip">
      <style dangerouslySetInnerHTML={{ __html: CSS_TEMA }} />
      <Suspense fallback={<EsqueletoCatalogo />}>
        <CatalogoSalon tenantId={ctx.tenantId} slug={ctx.slug} busqueda={searchParams} />
      </Suspense>
    </div>
  );
}
