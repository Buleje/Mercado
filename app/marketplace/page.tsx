import type { Metadata } from "next";
import MarketplaceContent from "@/components/marketplace/MarketplaceContent";
import MarketplaceHomeHeader from "@/components/marketplace/home/MarketplaceHomeHeader";
import JsonLd from "@/components/JsonLd";
import ItemListJsonLd from "@/components/seo/ItemListJsonLd";
import { BRAND_GEO } from "@/lib/geo";
import {
  getInitialMarketplaceStores,
  getPublishedStoreCount,
} from "@/lib/marketplace/initial-stores";
import { getFeaturedStoresWithProducts } from "@/lib/db/marketplace-featured.db";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { StoreReviewsDB } from "@/lib/db/store-reviews.db";
import { getStoreTagline } from "@/lib/store-tagline";

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

  // Adapt title and description based on zona.
  // Designer audit P0 SEO: layout root tiene `template: "%s | Buleje"` —
  // NO duplicar "Buleje" en titles de child pages, y "Perú" con tilde.
  const title = zona
    ? `Marketplace en ${zona.charAt(0).toUpperCase() + zona.slice(1)} — Bodegas y Tiendas`
    : `Marketplace — Bodegas y Tiendas en ${BRAND_GEO.city}`;
  const description = zona
    ? `Bodegas, minimarkets, restaurantes y farmacias en ${zona}. Pedí online con delivery rápido a domicilio y pagá con Yape, Plin o efectivo — sin app.`
    : `Bodegas, minimarkets, restaurantes y farmacias de ${BRAND_GEO.cityRegion} en un solo lugar. Delivery rápido a domicilio, pagá con Yape, Plin o efectivo.`;

  return {
    title,
    description,
    keywords: [
      "marketplace bodegas Perú",
      "bodegas online",
      "minimarkets delivery",
      "comprar abarrotes online",
      "delivery a domicilio",
      `delivery ${BRAND_GEO.city}`,
      `bodegas ${BRAND_GEO.city}`,
      "restaurantes delivery",
      "farmacia delivery",
      "tiendas cerca de mí",
      "pedir comida online",
      "pagar con Yape",
      "pagar con Plin",
      ...(zona ? [`bodegas ${zona}`, `delivery ${zona}`, `tiendas ${zona}`] : []),
    ],
    category: "Shopping",
    // SEO: NO redefinir `robots` ni `alternates` parcialmente — Next REEMPLAZA
    // el objeto entero, no hace merge profundo. Antes `robots:{index,follow}`
    // pisaba el root (perdía max-image-preview:large + el guard noindex de
    // preview) y `alternates:{canonical}` pisaba el hreflang del root. Acá
    // re-declaramos AMBOS completos (canonical dinámico por zona + hreflang) y
    // dejamos que `robots` se herede del root (rich + env-aware).
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "es-PE": canonicalUrl,
        es: canonicalUrl,
        "x-default": canonicalUrl,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "Buleje",
      locale: "es_PE",
      type: "website",
      images: [
        {
          url: "/api/og",
          width: 1200,
          height: 630,
          alt: `Buleje — bodegas y tiendas con delivery en ${BRAND_GEO.cityRegion}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/api/og"],
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
  "name": "Marketplace Buleje — Bodegas y Tiendas",
  "description": `Catálogo de bodegas, minimarkets, restaurantes y farmacias de ${BRAND_GEO.cityRegion} con delivery a domicilio y pago con Yape, Plin, tarjeta o efectivo.`,
  "url": `${BASE_URL}/marketplace`,
  "inLanguage": "es-PE",
  "keywords":
    "bodegas online, minimarkets delivery, restaurantes, farmacia, abarrotes, Yape, Plin, delivery a domicilio",
  "about": {
    "@type": "Thing",
    "name": "Marketplace de bodegas y tiendas del Perú con delivery",
  },
  "provider": {
    "@type": "Organization",
    "name": "Buleje",
    "url": BASE_URL,
  },
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

  // Server-side prefetch para eliminar skeleton flash + SSR/SEO de las 2
  // secciones de mayor valor comercial (Cerca tuyo + Más vendidos): su
  // contenido sale en el HTML inicial, crawlable por Google.
  // storeCount: conteo real para el trust strip del header SSR.
  const [initialStores, storeCount, featuredStores, topToday] = await Promise.all([
    hasFilters ? Promise.resolve(undefined) : getInitialMarketplaceStores(),
    getPublishedStoreCount(),
    getFeaturedStoresWithProducts({ limit: 10, productsPerStore: 3 }).catch(() => []),
    MarketplacePublicDB.getTopToday(10).catch(() => ({ items: [] as Awaited<ReturnType<typeof MarketplacePublicDB.getTopToday>>["items"] })),
  ]);

  // Proyecta getTopToday al shape que espera MarketplaceBestsellersStrip
  // (mismo mapeo que /api/marketplace/bestsellers).
  const initialBestsellers = topToday.items.map((it) => ({
    id: it.productId,
    storeProductId: it.storeProductId,
    productId: it.productId,
    name: it.name,
    storeId: it.store.id,
    storeName: it.store.name,
    storeSlug: it.store.slug,
    storeLogo: it.store.logo,
    image: it.image,
    price: it.price,
    originalPrice: it.originalPrice,
    unit: it.unit,
    category: it.category,
    stock: it.stock,
    unitsSold: it.soldUnits,
  }));

  // Audit SEO 2026-05-31 ("schema honesto, UI sembrada"): el aggregateRating
  // del ItemList sale SOLO de reseñas REALES (tabla Review), no de la columna
  // sembrada store.reviewCount. Map vacío hoy → cero estrellas falsas a Google;
  // se auto-activa por tienda cuando lleguen reseñas reales.
  const storeReviewAgg =
    initialStores && initialStores.length > 0
      ? await StoreReviewsDB.getApprovedAggregatesByStoreIds(
          initialStores.slice(0, 20).map((s) => s.id),
        )
      : new Map<string, { average: number; total: number }>();

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
            description: getStoreTagline({
              slug: store.slug,
              name: store.name,
              category: store.category,
              existing: store.description,
            }),
            // Solo reseñas REALES (no la columna sembrada store.reviewCount).
            aggregateRating: (() => {
              const agg = storeReviewAgg.get(store.id);
              return agg
                ? { ratingValue: agg.average, reviewCount: agg.total }
                : undefined;
            })(),
          }))}
        />
      )}

      {/* H1 SEO sr-only (el header editorial visible se removió — Brandon 2026-06-05). */}
      <MarketplaceHomeHeader storeCount={storeCount} />

      {/* Banner movido a la columna DERECHA (publicidad) del layout 3-col tipo
          Facebook — ver MarketplaceRightRail dentro de MarketplaceContent
          (Brandon 2026-06-05). */}

      <MarketplaceContent
        initialStores={featuredStores}
        initialBestsellers={initialBestsellers}
      />
    </>
  );
}
