import { cache, Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND_GEO } from "@/lib/geo";
import { cacheLife, cacheTag } from "next/cache";
import StoreDetailClient from "@/components/marketplace/store-detail/StoreDetailClient";
import StoreDetailLoading from "./loading";
import { MarketplaceStoresDB, MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";

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

// NOTA (Brandon 2026-05-30): se REVIRTIÓ generateStaticParams. Quitar el warning
// dev "Uncached data outside <Suspense>" vía generateStaticParams habilitaba el
// PRERENDER del storefront, pero la capa DB usa `Date.now()` en el render path
// (proxy Prisma → query-monitor.trackQuery + getBySlug trial-check), prohibido
// bajo cacheComponents → el prerender LANZABA y rompía la tienda (404/"Cargando…"
// atascado). El warning original era cosmético (no-bloqueante, la página
// funciona); un storefront roto NO. El storefront queda DINÁMICO (rendea
// on-demand, sin prerender) — que es lo correcto: sus datos son dinámicos
// (getOrSet + Date.now). Para matar el warning de verdad habría que volver
// prerender-safe toda la capa DB (mover Date.now dentro de "use cache"),
// trabajo mayor fuera de alcance. Ver [[project_storefront_blocking_route]].
//
// ACTUALIZACIÓN 2026-09-05: vuelve `generateStaticParams`, pero SIN prerenderar
// ninguna tienda real. Lo que rompió en mayo fue prerenderar páginas de verdad:
// su render ejecutaba la capa DB (`Date.now()` en el proxy Prisma) en build y
// lanzaba. Devolver SÓLO el placeholder habilita el shell estático —que es lo
// único que el warning pedía— y deja que cada tienda siga rendeando on-demand
// vía `dynamicParams` (default true), con todo el fetch dentro del <Suspense>
// de abajo. Es el mismo diagnóstico que ya dejó escrito la ruta hermana
// `producto/[productId]`: sin esta función el segmento dinámico no puede
// prerenderar shell, y Next atribuye el "Uncached data" al RootLayout — que es
// exactamente el stack que aparecía en el log.

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  // cacheComponents exige ≥1 entry. `__validate__` no existe como tienda: su
  // render cae en `notFound()`. No se listan slugs reales A PROPÓSITO — ver la
  // nota de arriba.
  return [{ slug: "__validate__" }];
}

// ── generateMetadata ───────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // `params` NO se puede awaitear DENTRO de `"use cache"` (no soportado en
  // Next 16). Mientras se hacía, la directiva NO surtía efecto y este
  // generateMetadata quedaba haciendo IO sin cachear — y como generateMetadata
  // corre FUERA de todo <Suspense> por definición, eso es exactamente el
  // blocking-route que la ruta venía reportando. El slug se resuelve acá
  // afuera y entra como argumento plano a la función cacheada.
  const { slug } = await params;
  return buildStoreMetadata(slug);
}

async function buildStoreMetadata(slug: string): Promise<Metadata> {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace-store", `marketplace-store:${slug}`);
  const store = await getStoreBySlug(slug);

  if (!store) {
    return {
      title: "Tienda",
      description: "Descubre esta tienda en el Marketplace de Buleje.",
    };
  }

  const baseUrl = "https://www.buleje.pe";
  const storeUrl = `${baseUrl}/marketplace/${slug}`;
  const zone = store.zone ?? BRAND_GEO.city;
  const baseDesc = getStoreTagline({
    slug,
    name: store.name,
    category: store.category,
    existing: store.description,
  });

  // Brandon 2026-05-20 v12 audit F1: description enriquecida con rating +
  // tiempo entrega (rich snippet en SERP, formato pedido por audit). Solo
  // agrega métricas cuando hay datos reales — fallback al tagline base.
  const rating = store.rating ?? 0;
  const reviewCount = store.reviewCount ?? 0;
  const metricsLine =
    rating > 0 && reviewCount > 0
      ? ` ${store.name} · ${rating.toFixed(1)}★ · ${reviewCount} reseñas.`
      : "";
  const desc =
    `Pedí ${formatCategoryLabel(store.category).toLowerCase()} en ${zone} con delivery rápido. Pagá con Yape, Plin o efectivo.${metricsLine}`.slice(
      0,
      155,
    );
  // Si el tagline base es más rico que el genérico, lo concatenamos como
  // segunda oración (manteniendo description ≤ 155c).
  const finalDesc =
    baseDesc && baseDesc !== store.description ? desc : `${desc} ${baseDesc ?? ""}`.trim().slice(0, 155);

  // Brandon 2026-05-20 v11 audit P2 SEO: og:type semántico segun categoria.
  // Next Metadata.openGraph.type solo acepta enum estricto — usamos `other`
  // para emitir el meta tag custom "restaurant"/"business.business" que
  // Facebook/Instagram reconocen para rich preview.
  const RESTAURANT_CATEGORIES = ["restaurante", "polleria", "pizzeria", "pollería", "pizzería", "comida", "snack"];
  const isRestaurant = RESTAURANT_CATEGORIES.some((c) =>
    (store.category ?? "").toLowerCase().includes(c),
  );
  const ogTypeCustom = isRestaurant ? "restaurant" : "business.business";

  // Brandon 2026-05-20 v12 audit F1: og:image dinámica via /api/og
  // (Edge runtime con rate-limit). Pasa title + subtitle como query params
  // para generar imagen 1200×630 con texto contextual del store.
  // El logo plano 400×400 quedaba mal en WhatsApp/Twitter previews.
  const ogImageUrl = `${baseUrl}/api/og?title=${encodeURIComponent(
    store.name,
  )}&subtitle=${encodeURIComponent(
    `${formatCategoryLabel(store.category)} en ${zone}`,
  )}`;

  return {
    title: `${store.name} — ${formatCategoryLabel(store.category)} en ${zone}`,
    description: finalDesc,
    alternates: {
      canonical: storeUrl,
      // Brandon 2026-05-21 SEO pro: hreflang para search engines.
      // x-default señala el fallback para usuarios sin locale preferida.
      languages: {
        "es-PE": storeUrl,
        "x-default": storeUrl,
      },
    },
    openGraph: {
      title: `${store.name} — Compra con delivery en ${zone}`,
      description: finalDesc,
      url: storeUrl,
      siteName: "Buleje",
      locale: "es_PE",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${store.name} — ${formatCategoryLabel(store.category)} en ${zone} · Buleje`,
        },
      ],
    },
    // OG type custom via `other` — sobrescribe el "website" del bloque
    // openGraph anterior porque Next emite ambos meta tags.
    other: {
      "og:type": ogTypeCustom,
    },
    twitter: {
      card: "summary_large_image",
      title: `${store.name} | Marketplace`,
      description: finalDesc,
      images: [{
        url: ogImageUrl,
        alt: `${store.name} — ${formatCategoryLabel(store.category)} en ${zone}`,
      }],
    },
  };
}

// ── JSON-LD ────────────────────────────────────────────────────────────────────

// Brandon 2026-05-20 v11 audit Bloque C — categorías que activan
// @type:Restaurant + servesCuisine (rich snippet con horario).
const RESTAURANT_CATEGORIES_LD = [
  "restaurante", "polleria", "pizzeria", "pollería", "pizzería", "comida", "snack",
];
const SCHEMA_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface DayHours { open: number; openMin: number; close: number; closeMin: number; }

function deriveOpeningHoursSpec(hoursJson: unknown) {
  if (!hoursJson || typeof hoursJson !== "object") return [];
  const h = hoursJson as Record<string, DayHours | DayHours[] | undefined>;
  const out: Array<{ "@type": "OpeningHoursSpecification"; dayOfWeek: string; opens: string; closes: string }> = [];
  for (let i = 0; i < 7; i++) {
    const raw = h[String(i)] ?? (h as unknown as Array<DayHours | undefined>)[i];
    const day = Array.isArray(raw) ? raw[0] : raw;
    if (!day || typeof day !== "object") continue;
    const opens = `${String(day.open ?? 0).padStart(2, "0")}:${String(day.openMin ?? 0).padStart(2, "0")}`;
    const closes = `${String(day.close ?? 0).padStart(2, "0")}:${String(day.closeMin ?? 0).padStart(2, "0")}`;
    if (opens === "00:00" && closes === "00:00") continue;
    out.push({ "@type": "OpeningHoursSpecification", dayOfWeek: SCHEMA_DAYS[i] ?? "Monday", opens, closes });
  }
  return out;
}

function StoreJsonLd({
  name,
  description,
  slug,
  logo,
  zone,
  category,
  rating,
  reviewCount,
  hoursJson,
  phone,
  lat,
  lng,
}: {
  name: string;
  description: string | null;
  slug: string;
  logo: string | null;
  zone: string | null;
  category: string;
  rating: number;
  reviewCount: number;
  hoursJson?: unknown;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const baseUrl = "https://www.buleje.pe";
  const storeUrl = `${baseUrl}/marketplace/${slug}`;
  const isRestaurant = RESTAURANT_CATEGORIES_LD.some((c) => (category ?? "").toLowerCase().includes(c));
  const openingHours = deriveOpeningHoursSpec(hoursJson);
  const formattedPhone = phone
    ? phone.startsWith("+") ? phone : `+51${phone.replace(/\D/g, "")}`
    : null;

  // Brandon 2026-05-20 v11 audit Bloque C — LocalBusiness/Restaurant
  // enriquecido: @id, parentOrganization, servesCuisine, openingHours,
  // telephone + contactPoint, priceRange formateado, currenciesAccepted.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": isRestaurant ? "Restaurant" : "LocalBusiness",
    "@id": `${storeUrl}#store`,
    name,
    description: description ?? `Tienda ${category} en ${zone ?? BRAND_GEO.city}, Perú. Delivery rápido.`,
    url: storeUrl,
    ...(logo && { image: logo, logo }),
    ...(formattedPhone && { telephone: formattedPhone }),
    address: {
      "@type": "PostalAddress",
      addressLocality: zone ?? BRAND_GEO.city,
      addressRegion: BRAND_GEO.region,
      addressCountry: "PE",
    },
    // Brandon 2026-05-30 (audit #7): coords reales de la tienda si el dueño las
    // configuró (Store.lat/lng); fallback al centro de Pucallpa. Antes siempre
    // hardcodeadas → Google mostraba TODAS las tiendas en el mismo punto del mapa.
    geo: {
      "@type": "GeoCoordinates",
      latitude: lat ?? -8.3791,
      longitude: lng ?? -74.5539,
    },
    ...(rating > 0 && reviewCount > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: rating,
        reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    priceRange: "S/ 5 - S/ 100",
    currenciesAccepted: "PEN",
    paymentAccepted: "Cash, Yape, Plin",
    areaServed: { "@type": "City", name: zone ?? BRAND_GEO.city },
    ...(isRestaurant && { servesCuisine: ["Peruana", category] }),
    ...(openingHours.length > 0 && { openingHoursSpecification: openingHours }),
    ...(formattedPhone && {
      contactPoint: {
        "@type": "ContactPoint",
        telephone: formattedPhone,
        contactType: "customer service",
        areaServed: "PE",
        availableLanguage: "Spanish",
      },
    }),
    parentOrganization: { "@id": `${baseUrl}/#organization` },
    // Brandon 2026-05-21 SEO pro: SpeakableSpecification permite a Google
    // Assistant + Alexa leer en voz alta el nombre + tagline cuando el
    // usuario pregunta "qué venden en X". Selectores CSS apuntan al h1 y
    // el párrafo de tagline en el StoreHero.
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["#store-hero-heading", "#store-hero-tagline"],
    },
  };

    // Brandon mayo 15 v4 (audit Security #2): escape de "<" + separadores
  // Unicode U+2028 / U+2029 que JSON.stringify no escapa pero algunos
  // parsers JS interpretan como newlines, lo que podria romper el
  // <script> JSON-LD y permitir XSS si el admin guarda payload malicioso.
  // Brandon 2026-05-20 v11 audit Bloque C \u2014 BreadcrumbList 3 niveles
  // (antes ausente, audit P0 reported).
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: baseUrl },
      { "@type": "ListItem", position: 2, name: `Tiendas en ${BRAND_GEO.city}`, item: `${baseUrl}/tiendas` },
      { "@type": "ListItem", position: 3, name, item: storeUrl },
    ],
  };

  // Brandon 2026-05-30 (audit): usar la util de producci\u00f3n safeJsonLdStringify
  // (escapa < > & U+2028 U+2029) en vez del `safe()` inline que solo escapaba
  // < y los separadores Unicode \u2014 defensa m\u00e1s completa contra XSS en JSON-LD.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbLd) }}
      />
    </>
  );
}

// \u2500\u2500 ProductsItemList JSON-LD \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Brandon 2026-05-21 SEO round 3: rich result de cat\u00e1logo. Google indexa
// hasta 30 productos como ItemList con Offer (precio + currency + URL).
// Pre-exist\u00edan Restaurant + BreadcrumbList; faltaba el cat\u00e1logo en s\u00ed \u2014
// resultado: el storefront NO compet\u00eda por rich snippets de productos.
// Limit 30 \u2192 suficiente para rich snippets de Google (>30 los ignora).
function ProductsItemListJsonLd({
  storeUrl,
  storeName,
  storeSlug,
  products,
}: {
  storeUrl: string;
  storeName: string;
  storeSlug: string;
  products: ReadonlyArray<{
    productId: number;
    productName: string;
    retailPrice: number;
    productImage: string | null;
    productCategory: string;
    stock: number | null;
  }>;
}) {
  // Solo emitimos JSON-LD si hay productos \u2014 evita ItemList vac\u00edo que
  // Google flagea como "low quality" en Rich Results Test.
  if (!products.length) return null;

  // Filtra productos agotados (stock === 0) \u2014 Google penaliza Offer
  // InStock con stock real 0. Productos con stock null = sin control
  // de stock (restaurantes/servicios) \u2192 asumimos disponible.
  const available = products.filter((p) => p.stock !== 0);

  const items = available.slice(0, 30).map((p, idx) => {
    const productUrl = `${storeUrl}/producto/${p.productId}`;
    return {
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "Product",
        "@id": `${productUrl}#product`,
        name: p.productName,
        url: productUrl,
        ...(p.productImage && { image: p.productImage }),
        ...(p.productCategory && { category: p.productCategory }),
        brand: { "@type": "Brand", name: storeName },
        offers: {
          "@type": "Offer",
          url: productUrl,
          price: p.retailPrice.toFixed(2),
          priceCurrency: "PEN",
          availability: "https://schema.org/InStock",
          seller: {
            "@type": "Organization",
            name: storeName,
            url: storeUrl,
          },
        },
      },
    };
  });

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${storeUrl}#catalog`,
    name: `Cat\u00e1logo de ${storeName}`,
    description: `Productos disponibles en ${storeName} con delivery en ${BRAND_GEO.city}`,
    numberOfItems: items.length,
    itemListElement: items,
  };

  return (
    <script
      type="application/ld+json"
      data-store-slug={storeSlug}
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(itemListLd) }}
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
  // Brandon 2026-05-21 perf FOUC v5: el Suspense fallback usaba PaicheLoading
  // (icono "Abriendo la tienda…" centrado). Durante la SPA navigation desde
  // /tiendas → click → /marketplace/[slug], el usuario veía 700-900ms del
  // icono Paiche antes del contenido real. Ahora usamos el MISMO skeleton
  // que loading.tsx (hero + stats + filter + grid) — estructura matched al
  // storefront final → fin del flash icono→layout.
  return (
    <Suspense fallback={<StoreDetailLoading />}>
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
      {/* Audit SEO 2026-05-31 (Brandon: "schema honesto, UI sembrada"): el
          aggregateRating del JSON-LD usa el agregado REAL de la tabla Review
          (reviewSummary.average/total), NO la columna sembrada store.rating/
          reviewCount. Si no hay reseñas reales (total=0) el gate interno de
          StoreJsonLd omite el aggregateRating → cero estrellas falsas a Google.
          La UI de la tienda sigue mostrando store.rating (semilla de
          lanzamiento) por separado. */}
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
        rating={reviewSummary.average}
        reviewCount={reviewSummary.total}
        hoursJson={hoursJson}
        phone={(store as { phone?: string | null }).phone ?? null}
        lat={(store as { lat?: number | null }).lat ?? null}
        lng={(store as { lng?: number | null }).lng ?? null}
      />
      {/* Brandon 2026-05-21 SEO round 3: ItemList con productos del catálogo.
          Habilita rich results de Google "Products from this store" — antes
          solo teníamos Restaurant/LocalBusiness sin enumerar el menú. */}
      <ProductsItemListJsonLd
        storeUrl={`https://www.buleje.pe/marketplace/${slug}`}
        storeName={store.name}
        storeSlug={slug}
        products={products}
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

      {/* Brandon 2026-06-12: la burbuja flotante ChatBubble se REMOVIÓ (era
          molesta). El chat tienda↔cliente vive ahora en el botón "Mensaje" del
          StoreHero (dispara buleje:open-chat → Messenger headless del nav). La
          ayuda general del marketplace está en el botón "Ayuda" del nav (IA). */}
    </>
  );
}
