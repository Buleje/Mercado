import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import ChatBubble from "@/components/marketplace/ChatBubble";
import StoreDetailClient from "@/components/marketplace/store-detail/StoreDetailClient";
import { PaicheLoading } from "@/components/ui-system/illustrations/PaicheLoading";
import { MarketplaceStoresDB, MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";

// Deduplicate getBySlug across generateMetadata + page render in the same
// request tree. Without this React.cache wrapper Next 16 invokes the lookup
// once per server lifecycle (generateMetadata, the page itself, and any
// nested RSC) — the in-memory `getOrSet` cache inside the DB layer cannot
// deduplicate within a single render because it is keyed by string and
// fetched concurrently. React.cache solves the per-request dedupe problem.
const getStoreBySlug = cache((slug: string) => MarketplaceStoresDB.getBySlug(slug));

// Brandon mayo 15 v3: N+1 fix — review.findMany + review.groupBy se llamaban
// 3x en 22ms (mismo storeId). Suspense boundaries y streaming re-evaluan el
// subarbol multiples veces; React.cache deduplica dentro del mismo request.
const getReviewsByStoreId = cache((tenantId: string, storeId: string) =>
  StoreReviewsDB.listByStoreId(tenantId, storeId),
);

// Hours JSON lookup — movido a lib/db/marketplace/stores.db.ts en Fase 2
// del audit profundo (2026-05-18 P0 #29). Importamos el helper memoizado.
import { getStoreHoursJson } from "@/lib/db/marketplace/stores.db";

// Designer audit: el title antes mostraba la categoría raw "polleria" sin
// tilde. Map mínimo a labels visibles correctos en español.
const CATEGORY_LABELS: Record<string, string> = {
  polleria: "Pollería",
  carniceria: "Carnicería",
  panaderia: "Panadería",
  licoreria: "Licorería",
  farmacia: "Farmacia",
  bodega: "Bodega",
  restaurante: "Restaurante",
  ferreteria: "Ferretería",
};
function formatCategoryLabel(raw: string): string {
  return CATEGORY_LABELS[raw] ?? (raw.charAt(0).toUpperCase() + raw.slice(1));
}

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
      title: "Tienda",
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
    title: `${store.name} — ${formatCategoryLabel(store.category)} en ${zone}`,
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
      title: `${store.name} | Marketplace`,
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

    // Brandon mayo 15 v4 (audit Security #2): escape de "<" + separadores
  // Unicode U+2028 / U+2029 que JSON.stringify no escapa pero algunos
  // parsers JS interpretan como newlines, lo que podria romper el
  // <script> JSON-LD y permitir XSS si el admin guarda payload malicioso.
  const safeJson = JSON.stringify(jsonLd)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJson }}
    />
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

// Cache Components (Next 16): la página delega TODO el fetch a un loader
// async wrappeado en <Suspense>. Si no, Next reporta "Uncached data accessed
// outside of <Suspense>" porque las DB calls bloquean el render completo.
// El Suspense local permite que el shell se prerender, y los datos streaman.
export default async function StoreDetailPage({ params }: Props) {
  const { slug } = await params;
  return (
    <Suspense fallback={<PaicheLoading variant="page" label="Abriendo la tienda…" />}>
      <StoreDetailContent slug={slug} />
    </Suspense>
  );
}

async function StoreDetailContent({ slug }: { slug: string }) {
  // 1. Fetch store
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  // 2. Fetch products (limit 100 for initial render)
  const productsRaw = await MarketplaceStoreProductsDB.list({
    storeId: store.id,
    limit: 100,
  });

  // 2b. Aplicar orden manual de categorias y productos definido por el admin
  // en /admin?tab=marketplace → Orden. Brandon espera que el catalogo del
  // storefront se muestre en ese orden — primero la seccion de la categoria
  // 1, luego la 2, etc. — y dentro de cada una en el orden de productos
  // persistido. Productos/categorias sin orden caen al final preservando
  // el orden original de la DB.
  const { getProductOrder, applyProductOrder } = await import("@/lib/store-product-order");
  const { getCategoryOrder, getStoreCategoryImages } = await import("@/lib/store-category-order");
  const { resolveCategoryImages } = await import("@/lib/superadmin-category-images");
  const [productOrderMap, persistedOrder, ownImages] = await Promise.all([
    getProductOrder(slug),
    getCategoryOrder(slug),
    getStoreCategoryImages(slug),
  ]);

  const products = (() => {
    const hasProductOrder = Object.keys(productOrderMap).length > 0;
    const hasCategoryOrder = persistedOrder.length > 0;
    if (!hasProductOrder && !hasCategoryOrder) return productsRaw;

    // Agrupa por categoria, aplica orden persistido a cada grupo,
    // luego une los grupos en el orden definido por persistedOrder.
    const byCat = new Map<string, typeof productsRaw>();
    const noCat: typeof productsRaw = [];
    for (const p of productsRaw) {
      const cat = p.productCategory;
      if (!cat) { noCat.push(p); continue; }
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(p);
    }

    // Lista de categorias en orden final: persistedOrder primero (intersectado
    // con las categorias que realmente tienen productos), luego las restantes
    // ordenadas por cantidad desc (default heuristico anterior).
    const inPersisted = new Set(persistedOrder);
    const presentCats = Array.from(byCat.keys());
    const orderedCats: string[] = [];
    for (const cat of persistedOrder) {
      if (byCat.has(cat)) orderedCats.push(cat);
    }
    presentCats
      .filter((c) => !inPersisted.has(c))
      .sort((a, b) => (byCat.get(b)?.length ?? 0) - (byCat.get(a)?.length ?? 0))
      .forEach((c) => orderedCats.push(c));

    const flat: typeof productsRaw = [];
    for (const cat of orderedCats) {
      const items = byCat.get(cat)!;
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

  // 4-5. Paralelizar 3 fetches independientes que antes corrian seriales:
  //  a) categoryImages (Object.keys de Settings global)
  //  b) reviews + summary (Review table)
  //  c) hoursJson (Store.hoursJson raw)
  // Ganancia: ~3× latencia → 1× la mas lenta. Tambien evita el N+1 detector
  // que disparaba 3x en 22ms por re-rendering de Suspense boundaries.
  const [categoryImages, reviewsAndSummary, hoursJson, storeHoursLib] = await Promise.all([
    resolveCategoryImages(ownImages),
    getReviewsByStoreId(store.tenantId, store.id),
    getStoreHoursJson(store.id),
    import("@/lib/marketplace-store-hours"),
  ]);
  const { reviews, summary: reviewSummary } = reviewsAndSummary;
  const { isOpenNow: storeIsOpenNow, nextOpening } = storeHoursLib;

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

  // PENTEST 2026-05-18 Fase 2 P0 #31: timezone fix.
  // ANTES: `new Date()` en Vercel devuelve UTC. computeIsOpenNow comparaba
  // horas UTC contra horario local Peru. A las 23:30 UTC = 18:30 Lima,
  // pero el sistema marcaba "cerrado" si la tienda cierra a 18:00.
  // AHORA: construir un Date ajustado a America/Lima usando toLocaleString.
  // El truco: `new Date(now.toLocaleString("en-US", {timeZone}))` crea un
  // Date donde getHours() y getMinutes() reflejan la hora local de Lima.
  const NOW_RAW = new Date();
  const NOW = new Date(
    NOW_RAW.toLocaleString("en-US", { timeZone: "America/Lima" }),
  );
  const isOpenReal = hoursJson
    ? storeIsOpenNow(hoursJson as never, NOW)
    : computeIsOpenNow();
  const nextOpenAt = hoursJson ? nextOpening(hoursJson as never, NOW) : null;

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
        isOpen={isOpenReal}
        hoursJson={hoursJson}
        nextOpeningAt={nextOpenAt ? nextOpenAt.toISOString() : null}
      />

      {/*
        ChatBubble del Bloque D2 del Marketplace.
        Se activa con el feature flag marketplace-chat-public en Vercel env.
        Si el flag está off, el endpoint devuelve 503 y el widget muestra
        "Chat temporalmente no disponible". Sin fricción si no está listo.

        Brandon mayo 14 2026: oculto en mobile (sm-only). En cel satura
        el viewport — el cliente tiene el sticky cart bar abajo y el
        widget tapa el catálogo. En desktop sigue visible.
      */}
      <div className="hidden sm:contents">
        <ChatBubble storeSlug={slug} storeName={store.name} />
      </div>
    </>
  );
}
