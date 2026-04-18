import type { Metadata } from "next";
import MarketplaceContent from "@/components/marketplace/MarketplaceContent";
import JsonLd from "@/components/JsonLd";
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
    ? `Encuentra bodegas, minimarkets y tiendas en ${zona}. Compra online con delivery rapido. Paga con Yape o efectivo.`
    : "Encuentra bodegas, minimarkets y tiendas de todo el Peru en un solo lugar. Compra online con delivery rapido. Paga con Yape o efectivo.";

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
  const hasFilters =
    !!searchParams.zona || !!searchParams.categoria || !!searchParams.buscar;

  // Server-side prefetch de stores para eliminar skeleton flash del first paint.
  // Solo lo pasamos cuando NO hay filtros — para requests con filtros, el cliente
  // hace fetch correcto con los params (behavior previo).
  const initialStores = hasFilters
    ? undefined
    : await getInitialMarketplaceStores();

  return (
    <>
      <JsonLd data={websiteSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={collectionSchema} />
      <MarketplaceContent initialStores={initialStores} />
    </>
  );
}
