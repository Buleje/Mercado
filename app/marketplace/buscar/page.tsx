import type { Metadata } from "next";
import { MarketplaceSearchDB } from "@/lib/db/marketplace-search.db";
import BuscarClient from "@/components/marketplace/buscar/BuscarClient";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    cat?: string | string[];
    store?: string | string[];
    sort?: string;
    min?: string;
    max?: string;
    page?: string;
  }>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const title = q
    ? `Resultados para "${q}" — Buleje`
    : "Buscar productos — Buleje";

  const description = q
    ? `Encuentra "${q}" en bodegas y tiendas cerca tuyo en Pucallpa. Delivery rápido, Yape y efectivo.`
    : "Busca productos en todas las bodegas y tiendas del marketplace Buleje. Pucallpa, Perú.";

  return {
    title,
    description,
    robots: q
      ? { index: false, follow: true } // No indexar paginas de busqueda
      : { index: false, follow: true },
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
 */
export default async function BuscarPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const q = params.q?.trim() ?? "";
  const sort = (params.sort ?? "relevance") as
    | "relevance"
    | "price_asc"
    | "price_desc"
    | "rating"
    | "newest";
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const limit = 24;
  const offset = (page - 1) * limit;

  // Normalizar params multi-value (Next los puede pasar como string o string[])
  const categories = params.cat
    ? Array.isArray(params.cat)
      ? params.cat
      : [params.cat]
    : [];

  const stores = params.store
    ? Array.isArray(params.store)
      ? params.store
      : [params.store]
    : [];

  const priceMin = params.min ? parseFloat(params.min) : undefined;
  const priceMax = params.max ? parseFloat(params.max) : undefined;

  const initialData = await MarketplaceSearchDB.search({
    q: q || undefined,
    categories: categories.length ? categories : undefined,
    stores: stores.length ? stores : undefined,
    priceMin: isNaN(priceMin ?? NaN) ? undefined : priceMin,
    priceMax: isNaN(priceMax ?? NaN) ? undefined : priceMax,
    sort,
    limit,
    offset,
  });

  return (
    <BuscarClient
      initialQuery={q}
      initialSort={sort}
      initialPage={page}
      initialData={initialData}
      initialCategories={categories}
      initialStores={stores}
      initialPriceMin={priceMin}
      initialPriceMax={priceMax}
    />
  );
}
