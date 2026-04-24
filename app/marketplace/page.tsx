import type { Metadata } from "next";
import MarketplaceContent from "@/components/marketplace/MarketplaceContent";
import JsonLd from "@/components/JsonLd";
import ItemListJsonLd from "@/components/seo/ItemListJsonLd";
import { getInitialMarketplaceStores } from "@/lib/marketplace/initial-stores";

type SearchParams = Record<string, string | string[] | undefined>;

const BASE_URL = "https://www.buleje.pe";

// ────────────────────────────────────────────────────────────────────────
// Task #14: Dynamic canonical per zone query parameter
// If ?zona=X exists, set canonical to /marketplace?zona=X
// Otherwise, canonical = /marketplace (self-canonical)
// ────────────────────────────────────────────────────────────────────────

export async function generateMetadata(props: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const zona = (searchParams.zona as string) || null;

  // Build canonical URL with zona query param if present
  const canonicalUrl = zona
    ? `${BASE_URL}/marketplace?zona=${encodeURIComponent(zona)}`
    : `${BASE_URL}/marketplace`;

  // Adapt title and description based on zona
  const zonaDisplay = zona ? ` — ${zona.charAt(0).toUpperCase() + zona.slice(1)}` : "";
  const title = zona
    ? `Marketplace Buleje en ${zona.charAt(0).toUpperCase() + zona.slice(1)} — Bodegas y Tiendas`
    : "Marketplace Buleje — Bodegas y Tiendas de Todo el Peru";
  const description = zona
    ? `Encuentra bodegas, minimarkets y tiendas en ${zona}. Compra online con delivery rápido. Paga con Yape o efectivo.`
    : "Encuentra bodegas, minimarkets y tiendas de todo el Peru en un solo lugar. Compra online con delivery rápido. Paga con Yape o efectivo.";

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "Buleje",
      locale: "es_PE",
      type: "website",
    },
  };
}

// JSON-LD schemas — SEO structured data for Google rich results.
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Buleje",
  "url": BASE_URL,
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": `${BASE_URL}/marketplace?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Inicio",
      "item": BASE_URL,
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Marketplace",
      "item": `${BASE_URL}/marketplace`,
    },
  ],
};

const collectionSchema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Marketplace Buleje",
  "description":
    "Catalogo de bodegas, minimarkets y tiendas del Peru con delivery y pago online via Yape, tarjeta o efectivo.",
  "url": `${BASE_URL}/marketplace`,
  "inLanguage": "es-PE",
  "isPartOf": {
    "@type": "WebSite",
    "name": "Buleje",
    "url": BASE_URL,
  },
};

export default async function MarketplacePage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const zona = (searchParams.zona as string) || null;
  const hasFilters =
    !!zona || !!searchParams.categoria || !!searchParams.buscar;

  // Server-side prefetch de stores para eliminar skeleton flash del first paint.
  const initialStores = hasFilters
    ? undefined
    : await getInitialMarketplaceStores();

  return (
    <>
      <JsonLd data={websiteSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={collectionSchema} />

      {/* ItemList JSON-LD — rich results de Google (lista numerada en SERP).
          Solo si tenemos stores reales pre-fetcheadas (no en filtros). */}
      {initialStores && initialStores.length > 0 && (
        <ItemListJsonLd
          name={
            zona
              ? `Bodegas y tiendas en ${zona.charAt(0).toUpperCase() + zona.slice(1)}`
              : "Bodegas y tiendas del marketplace Buleje"
          }
          description={
            zona
              ? `${initialStores.length} bodegas con delivery en ${zona}, Perú.`
              : `${initialStores.length} tiendas peruanas con delivery rápido.`
          }
          url={`${BASE_URL}/marketplace${zona ? `?zona=${encodeURIComponent(zona)}` : ""}`}
          itemType="Store"
          items={initialStores.slice(0, 20).map((store, i) => ({
            position: i + 1,
            name: store.name,
            url: `${BASE_URL}/marketplace/${store.slug}`,
            image: store.logo ?? undefined,
            description: store.description ?? undefined,
            aggregateRating:
              store.reviewCount > 0
                ? {
                    ratingValue: store.rating,
                    reviewCount: store.reviewCount,
                  }
                : undefined,
          }))}
        />
      )}

      <MarketplaceContent />
    </>
  );
}
