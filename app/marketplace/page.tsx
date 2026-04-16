import type { Metadata } from "next";
import MarketplaceContent from "@/components/marketplace/MarketplaceContent";
import JsonLd from "@/components/JsonLd";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Marketplace Buleje — Bodegas y Tiendas de Todo el Peru",
  description:
    "Encuentra bodegas, minimarkets y tiendas de todo el Peru en un solo lugar. Compra online con delivery rapido. Paga con Yape o efectivo.",
  alternates: {
    canonical: `${BASE_URL}/marketplace`,
  },
  openGraph: {
    title: "Marketplace Buleje — Bodegas y Tiendas de Todo el Peru",
    description:
      "Encuentra bodegas, minimarkets y tiendas de todo el Peru. Delivery rapido, Yape y efectivo.",
    url: `${BASE_URL}/marketplace`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

// JSON-LD schemas — SEO structured data for Google rich results.
// Referencias:
//  - WebSite + SearchAction: https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox
//  - BreadcrumbList: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
//  - CollectionPage: https://schema.org/CollectionPage

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

export default function MarketplacePage() {
  return (
    <>
      <JsonLd data={websiteSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={collectionSchema} />
      <MarketplaceContent />
    </>
  );
}
