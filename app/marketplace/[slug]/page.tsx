import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChatBubble from "@/components/marketplace/ChatBubble";
import StoreDetailClient from "@/components/marketplace/store-detail/StoreDetailClient";
import { Breadcrumbs } from "@/components/ui-system/Breadcrumbs";
import { MarketplaceStoresDB, MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";
import {
  MOCK_STORE_REVIEWS,
  MOCK_STORE_RATING_SUMMARY,
} from "@/lib/mock-store-reviews";
import type { StoreCategoryChip } from "@/components/marketplace/store-detail/StoreCategories";

interface Props {
  params: Promise<{ slug: string }>;
}

// ── generateMetadata ───────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await MarketplaceStoresDB.getBySlug(slug);

  if (!store) {
    return {
      title: "Tienda | Marketplace Buleje",
      description: "Descubre esta tienda en el Marketplace de Buleje.",
    };
  }

  const storeUrl = `https://www.buleje.pe/marketplace/${slug}`;
  const zone = store.zone ?? "Peru";
  const desc =
    store.description ??
    `Compra en ${store.name}, ${store.category} en ${zone}. Delivery rapido. Paga con Yape o efectivo. Marketplace Buleje.`;

  return {
    title: `${store.name} — ${store.category} en ${zone} | Marketplace Buleje`,
    description: desc,
    alternates: { canonical: storeUrl },
    openGraph: {
      title: `${store.name} — Compra con delivery en ${zone}`,
      description: desc,
      url: storeUrl,
      siteName: "Buleje",
      locale: "es_PE",
      type: "website",
      ...(store.logo
        ? { images: [{ url: store.logo, width: 400, height: 400, alt: `Logo de ${store.name}` }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${store.name} | Marketplace Buleje`,
      description: desc,
      ...(store.logo ? { images: [store.logo] } : {}),
    },
  };
}

// ── JSON-LD ────────────────────────────────────────────────────────────────────

function StoreJsonLd({
  name,
  description,
  slug,
  logo,
  zone,
  category,
  rating,
  reviewCount,
}: {
  name: string;
  description: string | null;
  slug: string;
  logo: string | null;
  zone: string | null;
  category: string;
  rating: number;
  reviewCount: number;
}) {
  const storeUrl = `https://www.buleje.pe/marketplace/${slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    description: description ?? `Tienda ${category} en ${zone ?? "Pucallpa"}, Perú. Delivery rápido.`,
    url: storeUrl,
    ...(logo && { image: logo }),
    address: {
      "@type": "PostalAddress",
      addressLocality: zone ?? "Pucallpa",
      addressRegion: "Ucayali",
      addressCountry: "PE",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: -8.3791,
      longitude: -74.5539,
    },
    ...(rating > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: rating,
        reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    priceRange: "S/",
    paymentAccepted: "Efectivo, Yape",
    areaServed: { "@type": "City", name: "Pucallpa" },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function StoreDetailPage({ params }: Props) {
  const { slug } = await params;

  // 1. Fetch store
  const store = await MarketplaceStoresDB.getBySlug(slug);
  if (!store) notFound();

  // 2. Fetch products (limit 100 for initial render)
  const products = await MarketplaceStoreProductsDB.list({
    storeId: store.id,
    limit: 100,
  });

  // 3. Build categories facet from product list
  const catCounts = new Map<string, number>();
  for (const p of products) {
    const cat = p.productCategory;
    if (cat) catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const categories: StoreCategoryChip[] = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return (
    <>
      <StoreJsonLd
        name={store.name}
        description={store.description}
        slug={slug}
        logo={store.logo}
        zone={store.zone}
        category={store.category}
        rating={store.rating ?? 0}
        reviewCount={store.reviewCount}
      />

      {/* Breadcrumbs — orienta al cliente sobre dónde está y cómo volver. */}
      <div className="mx-auto max-w-[1600px] px-4 pt-4 sm:px-6 lg:px-8">
        <Breadcrumbs
          items={[
            { label: "Marketplace", href: "/marketplace" },
            ...(store.zone
              ? [{ label: store.zone, href: `/marketplace?zona=${encodeURIComponent(store.zone)}` }]
              : []),
            { label: store.name },
          ]}
        />
      </div>

      <StoreDetailClient
        store={store}
        products={products}
        categories={categories}
        reviewSummary={MOCK_STORE_RATING_SUMMARY}
        reviews={MOCK_STORE_REVIEWS}
      />

      {/*
        ChatBubble del Bloque D2 del Marketplace.
        Se activa con el feature flag marketplace-chat-public en Vercel env.
        Si el flag está off, el endpoint devuelve 503 y el widget muestra
        "Chat temporalmente no disponible". Sin fricción si no está listo.
      */}
      <ChatBubble storeSlug={slug} storeName={store.name} />
    </>
  );
}
