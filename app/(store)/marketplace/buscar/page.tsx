import type { Metadata } from "next";
import { MarketplaceSearchDB } from "@/lib/db/marketplace-search.db";
import BuscarClient from "@/components/marketplace/buscar/BuscarClient";
import { leerParamsBuscar } from "@/lib/marketplace/buscar-params";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { q } = leerParamsBuscar(await searchParams);

  const title = q ? `Resultados para "${q}" — Buleje` : "Buscar productos — Buleje";

  const description = q
    ? `Encuentra "${q}" en bodegas y tiendas cerca tuyo en Ciudad Constitución. Delivery rápido, Yape y efectivo.`
    : "Busca productos en todas las bodegas y tiendas del marketplace Buleje. Ciudad Constitución, Pasco, Perú.";

  return {
    title,
    description,
    // Audit 2026-05-17 02-P1-04: antes ambos noindex. Sin query (browse mode)
    // /marketplace/buscar es entry-point genérico que SÍ debe indexarse para
    // capturar tráfico orgánico de "buscar productos pucallpa". Con query
    // siguen noindex (evita indexar combinaciones infinitas).
    robots: q
      ? { index: false, follow: true } // No indexar resultados específicos
      : { index: true, follow: true }, // Sí indexar entry-point genérico
  };
}

/**
 * /marketplace/buscar — Pagina de busqueda global del marketplace.
 *
 * Server Component: lee searchParams, ejecuta la query Prisma via
 * MarketplaceSearchDB y pasa initialResults al orchestrator client.
 *
 * searchParams:
 *   q      — termino de busqueda
 *   cat    — categorias (pueden ser multiples: ?cat=arroz&cat=fideos)
 *   store  — tiendas (multiples: ?store=id1&store=id2)
 *   sort   — relevance | price_asc | price_desc | rating | newest
 *   min    — precio mínimo (S/)
 *   max    — precio máximo (S/)
 *   page   — pagina (1-indexed)
 *   stock  — 1 = con stock · 0 = agotados
 *   rating — estrellas mínimas de la tienda (1..4)
 *   zone   — zona de la tienda
 *
 * Lectura y escritura del link: lib/marketplace/buscar-params.ts (una sola
 * fuente con BuscarClient; un valor roto se ignora, nunca revienta).
 */
export default async function BuscarPage({ searchParams }: PageProps) {
  const params = leerParamsBuscar(await searchParams);
  const limit = 24;

  const initialData = await MarketplaceSearchDB.search({
    q: params.q || undefined,
    categories: params.categories.length ? params.categories : undefined,
    stores: params.stores.length ? params.stores : undefined,
    priceMin: params.priceMin ?? undefined,
    priceMax: params.priceMax ?? undefined,
    availability: params.availability,
    minRating: params.minRating || undefined,
    zone: params.zone,
    sort: params.sort,
    limit,
    offset: (params.page - 1) * limit,
  });
  const q = params.q;

  return (
    <>
      {/*
        SEO 2026-05-28 audit: H1 dinámico server-side. Sin query muestra entry
        page heading (indexable). Con query: H1 contextualizado pero página
        sigue noindex via metadata.robots (configurado más arriba).
      */}
      <h1 className="sr-only">
        {q
          ? `Resultados de búsqueda para "${q}" en bodegas de Ciudad Constitución`
          : "Busca productos en bodegas y tiendas de Ciudad Constitución — Buleje"}
      </h1>
      <BuscarClient params={params} initialData={initialData} />
    </>
  );
}
