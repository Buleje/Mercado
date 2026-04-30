import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import ChatBubble from "@/components/marketplace/ChatBubble";
import StoreDetailClient from "@/components/marketplace/store-detail/StoreDetailClient";
import { MarketplaceStoresDB, MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";

// Deduplicate getBySlug across generateMetadata + page render in the same
// request tree. Without this React.cache wrapper Next 16 invokes the lookup
// once per server lifecycle (generateMetadata, the page itself, and any
// nested RSC) — the in-memory `getOrSet` cache inside the DB layer cannot
// deduplicate within a single render because it is keyed by string and
// fetched concurrently. React.cache solves the per-request dedupe problem.
const getStoreBySlug = cache((slug: string) => MarketplaceStoresDB.getBySlug(slug));
import { getStoreTagline } from "@/lib/store-tagline";
import { StoreReviewsDB } from "@/lib/db/store-reviews.db";
import type { StoreCategoryChip } from "@/components/marketplace/store-detail/StoreCategories";
import { computeIsOpenNow } from "@/lib/marketplace/store-hours";

interface Props {
  params: Promise<{ slug: string }>;
}

// ── generateMetadata ───────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  "use cache";
  cacheLife("minutes");
  const { slug } = await params;
  cacheTag("marketplace-store", `marketplace-store:${slug}`);
  const store = await getStoreBySlug(slug);

  if (!store) {
    return {
      title: "Tienda | Marketplace Buleje",
      description: "Descubre esta tienda en el Marketplace de Buleje.",
    };
  }

  const storeUrl = `https://www.buleje.pe/marketplace/${slug}`;
  const zone = store.zone ?? "Perú";
  const desc = getStoreTagline({
    slug,
    name: store.name,
    category: store.category,
    existing: store.description,
  });

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
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  // 2. Fetch products (limit 100 for initial render)
  const productsRaw = await MarketplaceStoreProductsDB.list({
    storeId: store.id,
    limit: 100,
  });

  // 2b. Aplicar orden manual de productos por categoría (admin/marketplace/orden).
  // Productos no listados quedan al final, preservando orden original.
  const { getProductOrder, applyProductOrder } = await import("@/lib/store-product-order");
  const productOrderMap = await getProductOrder(slug);
  const products = (() => {
    if (Object.keys(productOrderMap).length === 0) return productsRaw;
    // Agrupa por categoría, aplica orden persistido a cada grupo, vuelve a unir.
    const byCat = new Map<string, typeof productsRaw>();
    const noCat: typeof productsRaw = [];
    for (const p of productsRaw) {
      const cat = p.productCategory;
      if (!cat) { noCat.push(p); continue; }
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(p);
    }
    const flat: typeof productsRaw = [];
    for (const [cat, items] of byCat) {
      const ordered = productOrderMap[cat]
        ? applyProductOrder(items, productOrderMap[cat])
        : items;
      flat.push(...ordered);
    }
    flat.push(...noCat);
    return flat;
  })();

  // 3. Build categories facet from product list
  const catCounts = new Map<string, number>();
  for (const p of products) {
    const cat = p.productCategory;
    if (cat) catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const baseCategories: StoreCategoryChip[] = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  // 3b. Aplicar orden manual configurado por el dueño (admin/marketplace/orden)
  // o por superadmin (superadmin/stores → Orden). Si no hay orden persistido
  // se conserva el orden por count desc.
  const { getCategoryOrder, getStoreCategoryImages } = await import("@/lib/store-category-order");
  const { resolveCategoryImages } = await import("@/lib/superadmin-category-images");
  const [persistedOrder, ownImages] = await Promise.all([
    getCategoryOrder(slug),
    getStoreCategoryImages(slug),
  ]);
  // Resuelve imágenes: per-store > global default > undefined (texto-only).
  const categoryImages = await resolveCategoryImages(ownImages);
  const categories: StoreCategoryChip[] = persistedOrder.length === 0
    ? baseCategories
    : (() => {
        const idxMap = new Map<string, number>();
        persistedOrder.forEach((name, i) => idxMap.set(name, i));
        return [...baseCategories].sort((a, b) => {
          const ra = idxMap.has(a.name) ? idxMap.get(a.name)! : Number.MAX_SAFE_INTEGER;
          const rb = idxMap.has(b.name) ? idxMap.get(b.name)! : Number.MAX_SAFE_INTEGER;
          if (ra !== rb) return ra - rb;
          return b.count - a.count;
        });
      })();

  // 4. Fetch reseñas REALES (de la tabla Review). Defensive: si falla,
  //    devuelve listas vacías y la UI muestra empty state honesto.
  const { reviews, summary: reviewSummary } = await StoreReviewsDB.listByStoreId(store.id);

  return (
    <>
      <StoreJsonLd
        name={store.name}
        description={getStoreTagline({
          slug,
          name: store.name,
          category: store.category,
          existing: store.description,
        })}
        slug={slug}
        logo={store.logo}
        zone={store.zone}
        category={store.category}
        rating={store.rating ?? 0}
        reviewCount={store.reviewCount}
      />

      {/* Breadcrumb largo removido — StoreDetailClient muestra solo
          "Volver a Tiendas" como punto de regreso (UX más simple). */}

      <StoreDetailClient
        store={store}
        products={products}
        categories={categories}
        categoryImages={categoryImages}
        reviewSummary={reviewSummary}
        reviews={reviews}
        isOpen={computeIsOpenNow()}
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
