import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { cacheLife, cacheTag } from "next/cache";
import { resolveStoreContext } from "@/lib/store-metadata";
import TenantStoreHome from "@/components/store/TenantStoreHome";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { getBannersForSlot } from "@/lib/promo-banners";
import { getFeaturedStoresWithProducts } from "@/lib/db/marketplace-featured.db";
// Brandon 2026-05-20 v5: LandingHeader removido — chrome unificado vive
// en app/(store)/layout.tsx (mismo que /tiendas y /marketplace).

// ── Dynamic imports — Brandon 2026-05-20 audit-sprint perf:
// code-splitting de la sección cliente pesada (ComoFuncionaSection con i18n).
// 2026-05-27 optimización: removidos LandingHero / ReviewsCarousel /
// PopularCategoriesTiles / StickyMobileCTA — eran imports muertos (la home
// B2C v2 ya no los renderiza). Menos código que parsear + 0 lint noise.
// Brandon 2026-06-08: ComoFuncionaSection + JoinUsSection (contenido B2B
// "cómo funciona / trabajá con nosotros") REMOVIDOS de la home B2C — la home
// arranca SHOP-FIRST (estilo Mercado Libre/Temu). El contenido para vendedores
// vive en /negocios y /vender (donde va ese público), no en la home del comprador.
// Brandon 2026-05-30 (conversión A1): rail de recompra para el cliente.
//  - QuickReorder: "Volvé a pedir" tu último pedido (client, auth-gated, se
//    auto-oculta si no hay pedido previo). Recompra en 1 toque.
//  - TopToday: "Lo más pedido hoy" cross-tienda con quick-add directo al carrito
//    (se auto-oculta si no hay datos). Ambos self-fetch + self-contained.
const MarketplaceTopToday = dynamic(
  () => import("@/components/marketplace/MarketplaceTopToday"),
);
// Catálogo de productos completo (fusión /marketplace → /, Brandon 2026-06-08).
const HomeCatalog = dynamic(
  () => import("@/components/marketplace/home/HomeCatalog"),
);
// "Nuevos en {ciudad}" — descubrimiento con productos recién agregados (real data).
const HomeNewArrivals = dynamic(
  () => import("@/components/marketplace/home/HomeNewArrivals"),
);
// Hero rotativo full-width estilo marketplace pro (Brandon 2026-06-12): reemplaza
// el viejo hero "Pedí en {ciudad}" + buscador por un banner deslizable (swipe).
const HomeHeroBanner = dynamic(
  () => import("@/components/marketplace/home/HomeHeroBanner"),
);
// Banda animada con los logos de TODAS las tiendas (marquee infinito) — va
// arriba de la fila Ofertas | Paquetes (Brandon 2026-06-12).
const StoreLogosMarquee = dynamic(
  () => import("@/components/marketplace/home/StoreLogosMarquee"),
);
// Caja de descubrimiento genérica (catálogo) — Ofertas / Paquetes. Misma
// temática que "Recién llegados" / "Ranking" (Brandon 2026-06-12).
const HomeCatalogStrip = dynamic(
  () => import("@/components/marketplace/home/HomeCatalogStrip"),
);
import { Reveal } from "@/components/landing/Reveal";
import { PaicheLoading } from "@/components/ui-system/illustrations/PaicheLoading";
import CatalogSortTabs from "@/components/marketplace/home/CatalogSortTabs";
import SectionHeading from "@/components/marketplace/home/SectionHeading";
import HomeRecentlyViewed from "@/components/marketplace/home/HomeRecentlyViewed";
import { ShowWhenAllVerticals } from "@/components/marketplace/home/MarketplaceVerticalChips";
import {
  Store,
  ArrowUpRight,
  Bike,
  Star,
  UtensilsCrossed,
  ShoppingCart,
  Apple,
  Pill,
  Wrench,
  Drumstick,
  Croissant,
  Wine,
  Beef,
  Smartphone,
  ShoppingBag,
  MapPin,
  ChevronDown,
  MessageCircle,
  Tag,
  Package,
  type LucideIcon,
} from "@buleje/design-system/icons";

// Footer ya vive en app/(store)/layout.tsx (chrome unificado v5).

// ── Brandon mayo 14 2026 v2: home rediseñada B2C tipo Rappi ──────────────────
// v2 cambios:
//   - Categorías con emojis (no Lucide icons), Restaurantes y Supermercado
//     destacados en cards XL al estilo Rappi
//   - Carrusel de tiendas custom: solo logo + nombre grande (sin rating)
//   - Quitado banner TiendasHeroAds (saturaba)
//   - JoinUsSection rediseñada con paleta del proyecto (solo --accent + neutros)
// ──────────────────────────────────────────────────────────────────────────────

// Brandon 2026-05-20 v9 audit P1: home SEO con description 155c + og:site_name
// explícito ("Buleje") + twitter card. Antes faltaba siteName → Facebook/
// LinkedIn no podían armar el snippet con el sitio.
export const metadata: Metadata = {
  // El template del root layout agrega " | Buleje" → mantener este título
  // ≤51 chars para que el total quede ≤60 (Google trunca en SERP). Audit SEO.
  title: `Delivery en ${BRAND_GEO.city} — bodegas y comida`,
  description: `Pedí online en ${BRAND_GEO.city} (${BRAND_GEO.province}, ${BRAND_GEO.region}): bodegas, restaurantes y farmacias con delivery rápido. Paga con Yape, Plin o efectivo.`,
  keywords: [
    "delivery Ciudad Constitución",
    "marketplace Ciudad Constitución",
    "bodegas Ciudad Constitución",
    "restaurantes Ciudad Constitución delivery",
    "farmacias Ciudad Constitución",
    "comida a domicilio Ciudad Constitución",
    "delivery Oxapampa",
    "delivery Pasco",
    "delivery Selva Central",
    "pagar con Yape",
    "Plin delivery",
    "tiendas cerca de mí Ciudad Constitución",
    "Buleje Ciudad Constitución",
  ],
  alternates: {
    canonical: "https://www.buleje.pe",
    languages: { "es-PE": "https://www.buleje.pe", es: "https://www.buleje.pe" },
  },
  openGraph: {
    title: `Pide lo que quieras, te lo llevamos en ${BRAND_GEO.city} | Buleje`,
    description: `Bodegas, restaurantes y farmacias de ${BRAND_GEO.city} con delivery rápido. Yape, Plin o efectivo.`,
    url: "https://www.buleje.pe",
    siteName: "Buleje",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: `Buleje — Marketplace de ${BRAND_GEO.city}, ${BRAND_GEO.region}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `Pide lo que quieras, te lo llevamos en ${BRAND_GEO.city} | Buleje`,
    description: `Bodegas, restaurantes y farmacias con delivery rápido en ${BRAND_GEO.city}. Yape y efectivo.`,
    images: ["/api/og"],
  },
};

// ── Categorías principales (admin desde superadmin) ─────────────────────────
// Lee directo del JSON server-side (mismo storage que /api/marketplace/categories)
// para evitar el round-trip HTTP en la home.
interface SuperadminCategory {
  id: string;
  label: string;
  description: string;
  imageUrl: string | null;
}

async function getSuperadminCategories(): Promise<SuperadminCategory[]> {
  "use cache";
  cacheLife({ revalidate: 30, stale: 60, expire: 300 });
  cacheTag("marketplace-categories");
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const path = join(process.cwd(), "lib", "data", "marketplace-categories.json");
    const raw = await readFile(path, "utf8");
    const data = JSON.parse(raw) as Record<
      string,
      { label: string; description?: string; imageUrl: string | null; active: boolean }
    >;
    return Object.entries(data)
      .filter(([, v]) => v.active !== false)
      .map(([id, v]) => ({
        id,
        label: v.label,
        description: v.description ?? "",
        imageUrl: v.imageUrl,
      }));
  } catch {
    return [];
  }
}

// ── Cached marketplace stats + top stores via lib/db (regla #1 CLAUDE.md)
// Brandon 2026-05-20 audit-sprint: las queries antes hacían `prisma.*` directo
// con eslint-disable como excusa cross-tenant. Ahora vive en
// `lib/db/marketplace-public.db.ts` (MarketplaceStatsDB) — único punto que
// accede a prisma, con `use cache` + cacheLife + cacheTag homogéneos.
import { MarketplaceStatsDB, MarketplacePublicDB, type FeaturedStorePreview } from "@/lib/db/marketplace-public.db";
import { BRAND_GEO } from "@/lib/geo";
import { storeListItem } from "@/lib/seo-store-schema";

interface TopStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  /** Beneficio "Destacar en Home" (superadmin) → badge + prioridad. */
  featuredHome?: boolean;
}

async function getTopStores(): Promise<TopStore[]> {
  // Brandon 2026-05-31 (audit home): traemos hasta 22 para que "Destacadas"
  // (top 10) y "Recomendadas" (overflow, slice(10)) muestren tiendas DISTINTAS
  // en vez de la misma lista reordenada. Con pocas tiendas, Recomendadas se
  // oculta sola (guard length>0). getTopMarketplaceStores cachea (getOrSet).
  const stores = await MarketplaceStatsDB.getTopMarketplaceStores(22);
  return stores.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    logo: s.logo,
    category: s.category,
    zone: s.zone,
    rating: s.rating,
    reviewCount: s.reviewCount,
    featuredHome: s.featuredHome,
  }));
}

// Ranking "Lo más pedido hoy" para el JSON-LD de la home. Va dentro de
// `"use cache"` a propósito: getTopToday() lee `new Date()` (ventana 24h/7d) y,
// sin un Cache Component que lo contenga, Next 16 dispara
// `next-prerender-current-time` al prerenderear la ruta "/" (el acceso a la
// hora actual fuera de cache/Request data no es prerendereable). Cachear el
// resultado 120s — que es justo el TTL interno de getTopToday — resuelve el
// error sin volver dinámica toda la home.
async function getTopProductsForJsonLd() {
  "use cache";
  cacheLife({ revalidate: 120, stale: 300, expire: 600 });
  cacheTag("marketplace-top-today");
  return MarketplacePublicDB.getTopToday(10).catch(() => ({
    items: [] as Awaited<ReturnType<typeof MarketplacePublicDB.getTopToday>>["items"],
  }));
}

// ── FAQ — fuente única de verdad ────────────────────────────────────────────
// Audit SEO 2026-05-31: estas preguntas alimentan DOS cosas a la vez:
//   1. El FAQPage JSON-LD (Rich Results de Google).
//   2. La sección <HomeFaqSection /> VISIBLE al final de la home.
// Google exige que el contenido del FAQPage schema sea visible en la página
// (si es solo schema = "content mismatch", no da rich result y arriesga acción
// manual). Tener una sola lista evita que el schema y el texto se desincronicen.
// Copy real del marketplace + geo de lanzamiento (Ciudad Constitución).
const HOME_FAQS: { q: string; a: string }[] = [
  {
    q: "¿Cómo hago un pedido en Buleje?",
    a: "Elegís tu tienda en /tiendas, seleccionás los productos y pagás con Yape, Plin o efectivo. Tu pedido llega en 25–35 minutos.",
  },
  {
    q: `¿Buleje hace delivery en ${BRAND_GEO.city}?`,
    a: `Sí. Hacemos delivery en ${BRAND_GEO.city} y zonas cercanas de ${BRAND_GEO.province} (${BRAND_GEO.region}). Tenemos bodegas, restaurantes, farmacias y más.`,
  },
  {
    q: "¿Puedo pagar con Yape o Plin en Buleje?",
    a: "Sí, aceptamos Yape, Plin y efectivo contra entrega en todos los pedidos del marketplace.",
  },
  {
    q: "¿Cuánto tarda el delivery de Buleje?",
    a: "El tiempo estimado es de 25 a 35 minutos según tu ubicación y la tienda elegida. Las tiendas con horario abierto entregan el mismo día.",
  },
];

// ── JSON-LD B2C marketplace ──────────────────────────────────────────────────
async function BulejeJsonLd() {
  // Audit 2026-05-17 02-P2-2: storeCount ya no se usa aquí (aggregateRating
  // removido por falta de reviewCount real).
  // Audit 2026-06-10 P2: eliminado el `await getMarketplaceStats()` muerto —
  // bloqueaba el render sin usar el resultado. Si Schema.org vuelve a
  // necesitar stats, re-importar getMarketplaceStats.
  // SEO 2026-05-27: ItemList de tiendas reales destacadas. Ayuda a Google
  // a entender el catálogo del marketplace y habilita carrusel de entidades.
  // Datos verídicos (top stores de la DB) — no sintéticos.
  const topStores = await getTopStores();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Buleje",
    url: "https://www.buleje.pe",
    description: `Marketplace de bodegas, restaurantes y tiendas de ${BRAND_GEO.city} (${BRAND_GEO.province}, ${BRAND_GEO.region}). Compra online con delivery rápido. Yape y efectivo.`,
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.buleje.pe/tiendas?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
    // Audit 2026-05-17 02-P2-2: AggregateRating exige reviewCount con
    // reseñas reales, no conteo de tiendas. Emitir un rating sintético es
    // rich-snippet inválido en GSC. Hasta que tengamos un endpoint que
    // agregue Review reales del marketplace, omitimos aggregateRating del
    // WebSite schema. Se reintroducirá con datos verídicos.
    provider: {
      "@type": "Organization",
      name: "Buleje",
      url: "https://www.buleje.pe",
      address: [
        {
          "@type": "PostalAddress",
          addressLocality: BRAND_GEO.city,
          addressRegion: BRAND_GEO.region,
          addressCountry: BRAND_GEO.countryCode,
        },
      ],
      areaServed: [
        { "@type": "City", name: BRAND_GEO.city },
        { "@type": "AdministrativeArea", name: BRAND_GEO.province },
        { "@type": "AdministrativeArea", name: BRAND_GEO.region },
        { "@type": "Country", name: BRAND_GEO.country },
      ],
    },
  };

  // Brandon 2026-05-20 v10 audit P1: FAQPage schema para Rich Results
  // (accordeon de preguntas directo en SERP). Audit SEO 2026-05-31: ahora
  // derivado de HOME_FAQS (single source of truth) para mantener el schema
  // en sync con la sección <HomeFaqSection /> VISIBLE en la página.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  // SEO local (2026-05-26): LocalBusiness con geo + horario + contacto.
  // Es el schema que activa el "pack local" de Google y las búsquedas
  // "cerca de mí" / Google Maps en Pucallpa. El Organization de arriba es
  // genérico; este aporta coordenadas, horario y teléfono reales.
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://www.buleje.pe/#localbusiness",
    name: "Buleje",
    description: `Marketplace de bodegas, restaurantes y farmacias de ${BRAND_GEO.city} (${BRAND_GEO.province}, ${BRAND_GEO.region}) con delivery rápido. Pago con Yape, Plin o efectivo.`,
    url: "https://www.buleje.pe",
    image: "https://www.buleje.pe/brand/buleje-logo.png",
    logo: "https://www.buleje.pe/brand/buleje-logo.png",
    telephone: BRAND_GEO.phone,
    priceRange: "S/",
    currenciesAccepted: "PEN",
    paymentAccepted: "Yape, Plin, Efectivo, Tarjeta",
    address: {
      "@type": "PostalAddress",
      addressLocality: BRAND_GEO.city,
      addressRegion: BRAND_GEO.region,
      addressCountry: BRAND_GEO.countryCode,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: BRAND_GEO.lat,
      longitude: BRAND_GEO.lng,
    },
    areaServed: [
      { "@type": "City", name: BRAND_GEO.city },
      { "@type": "AdministrativeArea", name: BRAND_GEO.province },
      { "@type": "AdministrativeArea", name: BRAND_GEO.region },
    ],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "07:00",
        closes: "22:00",
      },
    ],
    sameAs: ["https://instagram.com/buleje"],
  };

  // BreadcrumbList raíz (audit SEO 2026-05-31). La home es el nivel 1 de la
  // jerarquía; declararlo da consistencia con /tiendas, storefronts y PDPs que
  // ya emiten su propio breadcrumb, y Google lo usa para entender el árbol del
  // sitio. Una sola entrada "Inicio" es válida y no resta.
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: "https://www.buleje.pe",
      },
    ],
  };

  // ItemList de tiendas destacadas reales (solo si hay datos).
  const itemListSchema =
    topStores.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Tiendas destacadas en Buleje ${BRAND_GEO.city}`,
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: topStores.length,
          // SEO local 2026-06-01: cada item es ahora un negocio local rico
          // (Restaurant / GroceryStore / Pharmacy / Store) con address, no un
          // ListItem plano. Ver lib/seo-store-schema.
          itemListElement: topStores.map((s, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: storeListItem(s),
          })),
        }
      : null;

  // ItemList de PRODUCTOS más pedidos (B5 SEO/IA): matchea el rail visible
  // "Lo más pedido hoy" → carrusel de productos en SERP + alimenta a las IAs
  // con el catálogo real (Product + Offer con precio). Solo datos reales.
  const topProductsRes = await getTopProductsForJsonLd();
  const productListSchema =
    topProductsRes.items.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Lo más pedido en Buleje ${BRAND_GEO.city}`,
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: topProductsRes.items.length,
          itemListElement: topProductsRes.items.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            item: {
              "@type": "Product",
              name: p.name,
              ...(p.image ? { image: p.image } : {}),
              url: `https://www.buleje.pe/marketplace/${p.store.slug}/producto/${p.productId}`,
              offers: {
                "@type": "Offer",
                price: p.price,
                priceCurrency: "PEN",
                availability:
                  p.stock > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                seller: { "@type": "Organization", name: p.store.name },
              },
            },
          })),
        }
      : null;

  return (
    <>
      {/* Brandon 2026-05-31 (audit home): safeJsonLdStringify escapa < > & y los
          separadores U+2028/U+2029 — los nombres de tienda vienen de vendors
          (admin externo) y un `</script>` en el name rompía el tag (stored XSS).
          JSON.stringify NO escapa eso. Mismo fix que el storefront. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(localBusinessSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(breadcrumbSchema) }}
      />
      {itemListSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(itemListSchema) }}
        />
      )}
      {productListSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(productListSchema) }}
        />
      )}
    </>
  );
}

// ── 1. Hero = banner rotativo full-width (Brandon 2026-06-12) ────────────────
// Antes: hero "Pedí en {ciudad}" + buscador + stats. Ahora: un banner grande
// estilo marketplace pro (AliExpress/Temu) que abarca todo el ancho y se
// desliza (swipe). El buscador vive en el header (chrome), por eso acá no va.
// SEO INTACTO: el <h1> con keyword geo sigue presente (sr-only) — Google lo
// indexa igual; los metadatos y el JSON-LD viven aparte (generateMetadata +
// BulejeJsonLd) y no se tocan. Los banners salen del slot `tiendas-hero`
// (los MISMOS que antes vivían en la columna "Publicidad" del catálogo).
async function HomeHero() {
  // perf audit P1: resolvemos los banners en el SERVER (lectura del JSON de
  // slots, sin red) y los pasamos como initialBanners → el hero se pinta en el
  // primer byte, sin la cascada hidratar→fetch→pintar del fetch client.
  const initialBanners = getBannersForSlot("tiendas-hero")
    .filter((b) => b.active)
    .sort((a, b) => a.order - b.order);
  return (
    <section aria-label="Inicio" className="relative">
      {/* H1 de la home — invisible pero presente (SEO). Mantiene la keyword geo
          que Google pondera fuerte en el H1 de la portada. */}
      <h1 className="sr-only">
        Pedí online en {BRAND_GEO.city}, {BRAND_GEO.region} — bodegas,
        restaurantes y farmacias con delivery rápido (Yape, Plin o efectivo)
      </h1>
      <HomeHeroBanner initialBanners={initialBanners} />
    </section>
  );
}

// perf audit P1: el marquee de logos también se resuelve en el SERVER (los
// logos vienen ya pintados, sin fetch client). getFeaturedStoresWithProducts
// cachea internamente (getOrSet). productsPerStore:0 = solo identidad de tienda.
async function StoreLogosMarqueeRSC() {
  const stores = await getFeaturedStoresWithProducts({ limit: 20, productsPerStore: 0 }).catch(
    () => [] as Awaited<ReturnType<typeof getFeaturedStoresWithProducts>>,
  );
  return (
    <StoreLogosMarquee
      initialStores={stores.map((s) => ({
        slug: s.slug,
        name: s.name,
        logo: s.logo,
        category: s.category,
        zone: s.zone,
        rating: s.rating,
        reviewCount: s.reviewCount,
        productsCount: s.productsCount,
      }))}
    />
  );
}

// ── 2. Categorías del superadmin — Brandon mayo 14 v3 ───────────────────────
// Antes eran emojis hardcoded. Ahora vienen del JSON que administra el
// superadmin (mismo storage que /api/marketplace/categories), con imageUrl
// real. Mantenemos el layout Rappi: 2 cards XL destacados arriba +
// resto en grid chico. Restaurantes y Bodegas (supermercado) son siempre
// los destacados (los primeros en orden), el resto va al grid chico.
// Emojis de fallback por slug si la imagen no está subida aún.

// Mapa de iconos Lucide por slug de categoría (reemplaza emojis).
// Regla: CERO emojis literales en UI — todo Lucide desde @buleje/design-system/icons.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  restaurante: UtensilsCrossed,
  bodega:      ShoppingCart,
  fruteria:    Apple,
  farmacia:    Pill,
  ferreteria:  Wrench,
  polleria:    Drumstick,
  panaderia:   Croissant,
  licoreria:   Wine,
  carniceria:  Beef,
  minimarket:  Store,
  tecnologia:  Smartphone,
};

const FEATURED_SLUGS = ["restaurante", "bodega"] as const;

function hrefForCategory(id: string): string {
  // Si la categoría existe como filtro /tiendas, ir ahí. Sino /marketplace/categoria.
  return `/tiendas?cat=${encodeURIComponent(id)}`;
}

async function CategoriesGrid() {
  // Brandon 2026-05-30: solo mostramos rubros VINCULADOS a tiendas reales —
  // cero categorías muertas. Cruzamos las categorías del superadmin con los
  // `Store.category` de tiendas publicadas (case-insensitive: en la DB conviven
  // "bodega" y "Abarrotes"). Una categoría sin ninguna tienda creada NO aparece.
  const [allCats, activeSlugs] = await Promise.all([
    getSuperadminCategories(),
    MarketplaceStatsDB.getActiveStoreCategorySlugs(),
  ]);
  const activeSet = new Set(activeSlugs.map((s) => s.toLowerCase()));
  const cats = allCats.filter(
    // - sin ids de sistema (prefijo "_", ej "_meta") → card vacía
    // - solo categorías con ≥1 tienda publicada vinculada
    (c) => c.id && !c.id.startsWith("_") && activeSet.has(c.id.toLowerCase()),
  );

  // Particiona: las 2 destacadas primero (Restaurantes + Bodega), resto en grid chico
  const featured = FEATURED_SLUGS
    .map((slug) => cats.find((c) => c.id === slug))
    .filter((c): c is SuperadminCategory => c !== undefined);
  const secondary = cats.filter((c) => !FEATURED_SLUGS.includes(c.id as typeof FEATURED_SLUGS[number]));

  if (cats.length === 0) return null;

  // Brandon 2026-06-12: con POCAS categorías el split featured-XL + grid-de-6
  // dejaba huecos enormes. Si hay ≤4 rubros, una sola fila ADAPTATIVA donde las
  // cards se reparten todo el ancho (auto-fit) y crecen para llenarlo. Con >4
  // volvemos al layout featured + secundarias (que ya llena bien).
  const fewCats = cats.length <= 4;

  return (
    <section
      aria-label="Categorías"
      className="bg-[var(--surface-canvas)] py-5 sm:py-7"
    >
      <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Categorías"
          title="Explora por categoría"
          subtitle={`Todo lo que tu barrio vende, en un solo lugar — con delivery rápido en ${BRAND_GEO.city}.`}
          actionLabel="Ver todas"
          actionHref="/tiendas"
        />

        {/* ── Pocas categorías → fila adaptativa que llena todo el ancho ── */}
        {fewCats && (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 sm:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {cats.map((c, idx) => (
              <Link
                key={c.id}
                href={hrefForCategory(c.id)}
                className="group relative flex items-center gap-3 sm:gap-5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-6 hover:border-[var(--accent)] transition-colors overflow-hidden min-h-[108px] sm:min-h-[132px]"
              >
                <span className="relative inline-flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-[var(--surface-sunken)] shrink-0 ring-1 ring-[var(--rule-soft)] overflow-hidden">
                  {c.imageUrl ? (
                    <Image
                      src={c.imageUrl}
                      alt={`${c.label} en ${BRAND_GEO.city} con delivery rápido`}
                      fill
                      sizes="(min-width: 640px) 80px, 64px"
                      className="object-cover"
                      priority={idx === 0}
                    />
                  ) : (() => {
                    const CatIcon = CATEGORY_ICONS[c.id] ?? ShoppingBag;
                    return (
                      <CatIcon className="h-8 w-8 sm:h-10 sm:w-10 text-[var(--accent)]" strokeWidth={1.5} aria-hidden />
                    );
                  })()}
                </span>
                <div className="relative min-w-0 flex-1">
                  <h3 className="text-lg sm:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight line-clamp-2">
                    {c.label}
                  </h3>
                  {c.description && (
                    <p className="mt-1 text-sm text-[var(--text-secondary)] leading-snug line-clamp-2">
                      {c.description}
                    </p>
                  )}
                  <span className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--accent)] group-hover:gap-2.5 transition-all">
                    Explorar
                    <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Featured XL: Restaurantes + Supermercado ────────────────── */}
        {!fewCats && featured.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 mb-3 sm:mb-5">
            {featured.map((c, idx) => (
              <Link
                key={c.id}
                href={hrefForCategory(c.id)}
                className="group relative flex items-center gap-4 sm:gap-6 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-7 hover:border-[var(--accent)] transition-colors overflow-hidden min-h-[120px] sm:min-h-[150px]"
              >
                {/* Imagen superadmin si existe, sino icono Lucide como fallback */}
                <span
                  className="relative inline-flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-[var(--surface-sunken)] shrink-0 ring-1 ring-[var(--rule-soft)] overflow-hidden"
                >
                  {c.imageUrl ? (
                    <Image
                      src={c.imageUrl}
                      alt={`${c.label} en ${BRAND_GEO.city} con delivery rápido`}
                      fill
                      sizes="(min-width: 640px) 96px, 80px"
                      className="object-cover"
                      // Audit 2026-05-17 02-P1-02: featured[0] (Restaurante) es LCP
                      // candidate above-the-fold mobile. priority elimina ~200ms.
                      priority={idx === 0}
                    />
                  ) : (() => {
                    const CatIcon = CATEGORY_ICONS[c.id] ?? ShoppingBag;
                    return (
                      <CatIcon
                        className="h-10 w-10 sm:h-14 sm:w-14 text-[var(--accent)]"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    );
                  })()}
                </span>
                <div className="relative min-w-0 flex-1">
                  {/* text-xl hasta lg para que "Restaurantes" (12 chars) entre
                      en 1 línea al lado de la imagen; text-3xl solo en lg+ donde
                      la card es ancha. Sin break-words (rompía a mitad de palabra). */}
                  <h3 className="text-xl lg:text-3xl font-black tracking-tight text-[var(--text-primary)] leading-tight">
                    {c.label}
                  </h3>
                  {c.description && (
                    <p className="mt-1.5 sm:mt-2 text-sm sm:text-base text-[var(--text-secondary)] leading-snug">
                      {c.description}
                    </p>
                  )}
                  <span className="mt-3 sm:mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--accent)] group-hover:gap-2.5 transition-all">
                    Explorar
                    <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Secondary: categorías más chicas (3 cols mobile, 6 desktop) ── */}
        {!fewCats && secondary.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
            {secondary.map((c) => (
              <Link
                key={c.id}
                href={hrefForCategory(c.id)}
                className="group flex flex-col items-center gap-2 sm:gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4 hover:border-[var(--accent)] transition-colors"
              >
                <span
                  className="inline-flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] overflow-hidden ring-1 ring-[var(--rule-soft)] shrink-0"
                >
                  {c.imageUrl ? (
                    <Image
                      src={c.imageUrl}
                      alt={`${c.label} con delivery en ${BRAND_GEO.city}`}
                      width={64}
                      height={64}
                      className="object-cover w-full h-full"
                    />
                  ) : (() => {
                    const CatIcon = CATEGORY_ICONS[c.id] ?? ShoppingBag;
                    return (
                      <CatIcon
                        className="h-7 w-7 sm:h-8 sm:w-8 text-[var(--accent)]"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                    );
                  })()}
                </span>
                <span className="text-[length:var(--ts-xs)] sm:text-sm font-extrabold tracking-tight text-center text-[var(--text-primary)] leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                  {c.label}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── 3. Tiendas destacadas — carrusel pro con rating, categoría y zona ──────────
// v3 2026-05-26: cards enriquecidas (antes solo logo+nombre). Agrega rating
// (estrellas), categoría y zona cuando la fuente los trae. Sin fetch nuevo:
// getTopStores() ya devuelve category/zone/rating/reviewCount desde MarketplaceStatsDB.

/** Renderiza las estrellas de rating (0–5). Solo muestra si rating > 0. */
function StoreRatingStars({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  if (rating <= 0) return null;
  const full = Math.floor(rating);
  const partial = rating % 1 >= 0.5 ? 1 : 0;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rating.toFixed(1)} de 5 estrellas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3 w-3 shrink-0 ${i < full ? "fill-[var(--accent)] text-[var(--accent)]" : i === full && partial ? "fill-[var(--accent)]/50 text-[var(--accent)]/50" : "fill-none text-[var(--rule-base)]"}`}
          strokeWidth={1.5}
          aria-hidden
        />
      ))}
      {reviewCount > 0 && (
        <span className="text-[10px] font-bold text-[var(--text-tertiary)] tabular-nums ml-0.5">
          ({reviewCount})
        </span>
      )}
    </span>
  );
}

/**
 * StoreCard — card estilo marketplace app (Rappi/Uber Eats): cover con
 * textura de marca + logo solapado tipo avatar + contenido alineado a la
 * izquierda (nombre, rating, chips categoría/zona, pie delivery).
 * v4 2026-05-27: rediseño de card centrada → listado pro con cover.
 * Reusada por Tiendas destacadas (grid) y Recomendadas para vos (rail).
 */
// Acepta TopStore o FeaturedStorePreview (superset): el rail "Recomendadas"
// reusa StoreCard con los datos del showcase. Evita la trampa de mantenimiento
// del duck-typing implícito (audit code-review #3).
function StoreCard({ s, priority = false }: { s: TopStore | FeaturedStorePreview; priority?: boolean }) {
  const initial = s.name.trim().charAt(0).toUpperCase();
  // Ícono de la categoría para el watermark del cover — rellena el espacio
  // antes vacío con una señal visual del rubro. (pulido home 2026-05-31)
  const CoverIcon = CATEGORY_ICONS[s.category] ?? Store;
  return (
    <Link
      href={`/marketplace/${s.slug}`}
      aria-label={`${s.name}${s.featuredHome ? ", destacada" : ""}${s.rating > 0 ? `, ${s.rating.toFixed(1)} estrellas` : ""}${s.category ? `, ${s.category}` : ""}${s.zone ? `, ${s.zone}` : ""}`}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-[var(--surface-raised)] transition-colors duration-[var(--dur-base)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${s.featuredHome ? "border-[var(--accent)]" : "border-[var(--rule-base)] hover:border-[var(--accent)]"}`}
    >
      {/* Cover plano (de-neon Brandon 2026-06-08) — sin gradiente teal ni textura. */}
      <div className="relative h-14 sm:h-16 bg-[var(--surface-sunken)]">
        {/* Watermark del rubro — rellena el cover (antes vacío) con señal visual
            de la categoría, abajo-derecha para no chocar con el avatar (izq). */}
        <CoverIcon
          aria-hidden
          className="pointer-events-none absolute right-2.5 bottom-1 h-11 w-11 sm:h-12 sm:w-12 text-[var(--accent)]/25 -rotate-12 group-hover:scale-110 group-hover:text-[var(--accent)]/35 transition-all"
          strokeWidth={1.5}
        />
        {/* Badge Destacada (beneficio superadmin "Destacar en Home") */}
        {s.featuredHome && (
          <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow">
            <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
            Destacada
          </span>
        )}
      </div>

      {/* Logo avatar solapando el cover */}
      <div className="px-3 sm:px-4 -mt-7 sm:-mt-8">
        <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-[var(--surface-canvas)] ring-4 ring-[var(--surface-raised)] overflow-hidden shadow-md group-hover:scale-[1.05] transition-transform shrink-0">
          {s.logo ? (
            <Image
              src={s.logo}
              alt=""
              fill
              sizes="(min-width: 640px) 64px, 56px"
              className="object-cover"
              priority={priority}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark,var(--accent))] text-white font-black text-2xl sm:text-3xl">
              {initial}
            </div>
          )}
        </div>
      </div>

      {/* Body alineado a la izquierda */}
      <div className="flex flex-1 flex-col px-3 sm:px-4 pt-2 pb-3">
        {/* Nombre */}
        <p className="text-sm sm:text-base font-extrabold tracking-tight text-[var(--text-primary)] leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
          {s.name}
        </p>

        {/* Rating */}
        {s.rating > 0 && (
          <div className="mt-1">
            <StoreRatingStars rating={s.rating} reviewCount={s.reviewCount} />
          </div>
        )}

        {/* Chips categoría + zona */}
        {(s.category || s.zone) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {s.category && (
              <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] sm:text-xs font-bold text-[var(--accent)] line-clamp-1 max-w-full">
                {s.category}
              </span>
            )}
            {s.zone && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] sm:text-xs font-semibold text-[var(--text-secondary)] line-clamp-1 max-w-full">
                <MapPin className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
                {s.zone}
              </span>
            )}
          </div>
        )}

        {/* Pie: delivery + estimación de entrega. "25–35 min" = estimación de
            plataforma para Pucallpa (igual que el hero "delivery en 25 min" y el
            storefront), no un dato inventado por tienda. Rellena la card. */}
        <div className="mt-auto flex items-center gap-1.5 border-t border-[var(--rule-soft)] pt-2.5 text-[10px] sm:text-xs font-bold text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors">
          <Bike className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span>Delivery</span>
          <span aria-hidden className="opacity-50">·</span>
          <span>25–35 min</span>
        </div>
      </div>
    </Link>
  );
}

// ── FeaturedStoreCard — card showcase XL para las 3 tiendas destacadas ──────
// Brandon 2026-05-30: banner de portada (o gradiente de marca si no hay) +
// logo avatar + rating/categoría/zona + PREVIEW del catálogo (hasta 4 productos
// con imagen). "Lo que ofrecen" de un vistazo. Card entera clickeable (stretched
// link a la tienda). Reemplaza la grilla de 10 cards chicas por 3 cards ricas.
function FeaturedStoreCard({ s, priority = false }: { s: FeaturedStorePreview; priority?: boolean }) {
  const initial = s.name.trim().charAt(0).toUpperCase();
  const CoverIcon = CATEGORY_ICONS[s.category] ?? Store;
  const extraProducts = Math.max(0, s.productCount - s.preview.length);
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden border bg-[var(--surface-raised)] transition-colors duration-[var(--dur-base)] ${
        s.featuredHome
          ? "border-[var(--accent)]"
          : "border-[var(--rule-base)] hover:border-[var(--accent)]"
      }`}
    >
      {/* Banner de portada — imagen real, o fondo plano (de-neon Brandon 2026-06-08). */}
      <div className="relative h-24 sm:h-28 overflow-hidden bg-[var(--surface-sunken)]">
        {s.banner ? (
          <Image
            src={s.banner}
            alt=""
            fill
            sizes="(min-width: 1024px) 420px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            priority={priority}
          />
        ) : (
          <>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage: "radial-gradient(circle, var(--accent) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
                maskImage: "linear-gradient(to bottom, black, transparent)",
                WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
                opacity: 0.16,
              }}
            />
            <CoverIcon
              aria-hidden
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-20 w-20 -rotate-12 text-[var(--accent)]/30"
              strokeWidth={1.25}
            />
          </>
        )}
        {/* Velo inferior para que el logo/nombre respiren sobre el banner */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-black/35 to-transparent" />
        {/* Rating badge (si tiene reseñas reales) */}
        {s.rating > 0 && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 bg-[var(--surface-canvas)]/95 px-2.5 py-1 text-xs font-black tabular-nums text-[var(--text-primary)] shadow ring-1 ring-[var(--rule-soft)]">
            <Star className="h-3 w-3 fill-[var(--accent)] text-[var(--accent)]" aria-hidden />
            {s.rating.toFixed(1)}
          </span>
        )}
        {/* Badge "Destacada" (beneficio superadmin) */}
        {s.featuredHome && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow">
            <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
            Destacada
          </span>
        )}
      </div>

      {/* Logo avatar solapando el banner + identidad */}
      <div className="flex items-start gap-3 px-4 sm:px-5 -mt-8">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-[var(--surface-canvas)] ring-4 ring-[var(--surface-raised)] shadow-sm">
          {s.logo ? (
            <Image src={s.logo} alt="" fill sizes="64px" className="object-cover" priority={priority} />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark,var(--accent))] text-2xl font-black text-white">
              {initial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-9">
          <h3 className="text-lg sm:text-xl font-black tracking-tight leading-tight text-[var(--text-primary)] line-clamp-1 transition-colors group-hover:text-[var(--accent)]">
            {s.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {s.category && (
              <span className="inline-flex items-center bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-bold capitalize text-[var(--accent)]">
                {s.category}
              </span>
            )}
            {s.zone && (
              <span className="inline-flex items-center gap-0.5 bg-[var(--surface-sunken)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                <MapPin className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                {s.zone}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cuerpo: preview (si hay) arriba + footer delivery + CTA anclados abajo.
          Las 3 cards comparten el MISMO baseline (delivery + Ver tienda) → fila
          pareja; los thumbs son el extra de quien los tiene. De-neon Brandon 2026-06-08. */}
      <div className="flex flex-1 flex-col px-4 sm:px-5 pt-3 pb-4">
        {s.preview.length > 0 && (
          <div className="mb-3 grid grid-cols-4 gap-2">
            {s.preview.map((p, i) => (
              <div
                key={p.id}
                className="relative aspect-square overflow-hidden bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-soft)]"
              >
                <Image
                  src={p.image}
                  alt={p.name}
                  fill
                  sizes="80px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {i === s.preview.length - 1 && extraProducts > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-black text-white">
                    +{extraProducts}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer anclado abajo — delivery + CTA. Mismo baseline en las 3 cards. */}
        <div className="mt-auto">
          <div className="flex items-center gap-1.5 border-t border-[var(--rule-soft)] pt-2.5 text-[11px] sm:text-xs font-bold text-[var(--text-tertiary)]">
            <Bike className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span>Delivery · 25–35 min</span>
            {s.productCount > 0 && (
              <>
                <span aria-hidden className="opacity-50">·</span>
                <span>{s.productCount} productos</span>
              </>
            )}
          </div>
          {/* CTA — stretched link: toda la card es clickeable, 1 solo enlace (a11y) */}
          <Link
            href={`/marketplace/${s.slug}`}
            aria-label={`Ver tienda ${s.name}`}
            className="mt-3 inline-flex w-full h-10 items-center justify-center gap-1.5 border border-[var(--accent)] text-sm font-bold text-[var(--accent)] transition-colors after:absolute after:inset-0 after:content-[''] hover:bg-[var(--accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            Ver tienda
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

async function TopStoresSection() {
  // Brandon 2026-05-30: showcase de 3 tiendas destacadas RICAS (banner + logo +
  // rating + preview de catálogo). El resto va al rail "Recomendadas".
  const stores = await MarketplaceStatsDB.getFeaturedStoresWithPreview(12);
  if (stores.length === 0) {
    return <EmptyStoresPlaceholder />;
  }
  const destacadas = stores.slice(0, 3);
  return (
    <>
      <section
        aria-label="Tiendas destacadas"
        className="bg-[var(--surface-sunken)]/40 border-y border-[var(--rule-soft)] py-5 sm:py-7"
      >
        <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Tiendas destacadas"
            title={`Las más elegidas en ${BRAND_GEO.city}`}
            actionLabel="Ver todas"
            actionHref="/tiendas"
          />

          {/* 3 cards showcase: 1 col mobile / 3 cols ≥640px */}
          <ul
            role="list"
            aria-label={`${destacadas.length} tiendas destacadas`}
            className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-6"
          >
            {destacadas.map((s) => (
              <li key={s.id}>
                {/* Audit SEO 2026-05-31: SIN priority. Esta sección "Tiendas
                    destacadas" va DEBAJO del fold (hero + categorías arriba),
                    así que forzar priority en sus 3-6 imágenes (banner+logo)
                    competía por ancho de banda con el LCP real del hero y las
                    hacía cargar eager. Sin priority, next/image las lazy-loadea
                    (loading="lazy") y mejora el LCP. */}
                <FeaturedStoreCard s={s} />
              </li>
            ))}
          </ul>
        </div>
      </section>

    </>
  );
}

function EmptyStoresPlaceholder() {
  return (
    <section className="bg-[var(--surface-sunken)]/40 border-y border-[var(--rule-soft)] py-12 sm:py-16">
      <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <span
          aria-hidden
          className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] mb-5"
        >
          <Store className="h-8 w-8" strokeWidth={1.75} />
        </span>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)]">
          Las primeras tiendas están abriendo
        </h2>
        <p className="mt-2 text-base text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
          Estamos arrancando con los primeros negocios de {BRAND_GEO.city}. ¿Tenés
          una tienda? Sumate al Plan Fundador y arrancá hoy mismo.
        </p>
        <Link
          href="/negocios"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-6 h-12 text-sm font-extrabold hover:opacity-90 transition-opacity"
        >
          Abrir mi tienda
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

// ── 4. Trabajá con nosotros ──────────────────────────────────────────────────
// Brandon 2026-05-31: extraído a components/marketing/JoinUsSection.tsx (importado
// arriba) para reusarlo en /tiendas sin copy-paste (single source of truth).

// ── Main Home ────────────────────────────────────────────────────────────────
// Brandon 2026-05-20 v5: LandingHeader y Footer REMOVIDOS de la página.
// El chrome unificado (MarketplaceNavbar + ConditionalPromoBar +
// ConditionalSecondaryNav + BottomNav + Footer) vive ahora en
// app/(store)/layout.tsx — único punto compartido con /tiendas y /marketplace.
// ── FAQ visible — server component, accordeón nativo <details> (sin JS) ──────
// Audit SEO 2026-05-31: el FAQPage schema necesitaba contenido VISIBLE en la
// página (política de Google) — antes era schema-only. Esto también suma copy
// indexable con keywords long-tail locales ("delivery en {city}", "pagar con
// Yape"). Nativo <details>/<summary>: accesible por teclado, 0 JavaScript.
function HomeFaqSection() {
  return (
    <section
      id="preguntas-frecuentes"
      aria-labelledby="faq-heading"
      className="py-7 sm:py-9 bg-[var(--surface-sunken)]/40 border-y border-[var(--rule-soft)]"
    >
      <div className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          headingId="faq-heading"
          eyebrow="Preguntas frecuentes"
          title={`Todo sobre comprar y pedir en ${BRAND_GEO.city}`}
        />

        {/* 2 columnas masonry (Brandon 2026-06-01): llena el ancho y cada
            columna se expande independiente al abrir un acordeón (sin saltos de
            la otra). Reparto par/impar preservando el número original. Sigue
            siendo native <details> → 0 JS, indexable, accesible. */}
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 md:items-start">
          {[0, 1].map((colIdx) => (
            <div key={colIdx} className="space-y-3 sm:space-y-4">
              {HOME_FAQS.filter((_, i) => i % 2 === colIdx).map((f) => {
                const n = HOME_FAQS.indexOf(f) + 1;
                return (
                  /* Brandon 2026-06-13: rediseño editorial SIN bordes redondeados.
                     Tarjeta cuadrada con regla de acento a la IZQUIERDA (gris →
                     acento al abrir), tinte suave + número resaltado en open. */
                  <details
                    key={n}
                    className="group border border-[var(--rule-base)] border-l-[3px] border-l-[var(--rule-strong)] bg-[var(--surface-raised)] transition-colors open:border-l-[var(--accent)] open:bg-[var(--accent-soft)]/25"
                  >
                    <summary className="flex items-center gap-3.5 cursor-pointer list-none px-4 sm:px-5 py-4 [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--surface-sunken)] text-[length:var(--ts-sm)] font-black tabular-nums text-[var(--text-tertiary)] transition-colors group-open:bg-[var(--accent)] group-open:text-white">
                        {String(n).padStart(2, "0")}
                      </span>
                      <span className="flex-1 text-base font-bold leading-snug text-[var(--text-primary)] transition-colors group-open:text-[var(--accent)]">
                        {f.q}
                      </span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center text-[var(--text-tertiary)] transition-colors group-open:text-[var(--accent)]">
                        <ChevronDown
                          className="h-5 w-5 transition-transform duration-200 group-open:rotate-180"
                          strokeWidth={2.5}
                          aria-hidden
                        />
                      </span>
                    </summary>
                    <div className="pl-[3.875rem] pr-5 pb-5 -mt-1">
                      <p className="text-base text-[var(--text-secondary)] leading-relaxed">
                        {f.a}
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
          ))}
        </div>

        {/* Cierre — duda no resuelta → WhatsApp directo. Bloque cuadrado con
            franja de acento a la izquierda (consistente con las tarjetas). */}
        <div className="mt-6 sm:mt-8 flex flex-col gap-4 border border-[var(--rule-base)] border-l-[3px] border-l-[var(--accent)] bg-[var(--surface-raised)] px-5 sm:px-7 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
              ¿Te quedó otra duda?
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Escribinos por WhatsApp y te respondemos al toque.
            </p>
          </div>
          <a
            href={`https://wa.me/${BRAND_GEO.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
              `Hola Buleje, tengo una pregunta sobre pedir en ${BRAND_GEO.city}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center gap-2 bg-[var(--accent)] px-6 h-12 text-sm font-extrabold text-white shadow-sm transition-all hover:gap-3 hover:shadow-md active:scale-95"
          >
            <MessageCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            Escribir por WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

export default async function Home() {
  // Tienda INDIVIDUAL del comerciante (subdominio / /t/<slug>): el inicio es una
  // portada propia (TenantStoreHome) con CTA a su catálogo (/tienda) — AISLADA del
  // marketplace. En el dominio principal se ve la home del marketplace. Brandon 2026-06-07.
  const { isTenant } = await resolveStoreContext();
  if (isTenant) return <TenantStoreHome />;

  return (
    <main id="main-content">
      <BulejeJsonLd />

      {/* 1. Hero = banner rotativo full-width (swipe) */}
      <HomeHero />

      {/* 1.2 Verticales — SOLO MOBILE (Brandon 2026-06-11): los chips
          Comida/Bodega/Ferretería/Electro/Farmacia los aporta el chrome
          (ConditionalSecondaryNav), apilados sobre la barra de categorías en un
          bloque sticky. En DESKTOP se quitaron a pedido de Brandon: la pantalla
          grande ya navega por el rail izquierdo + "Categorías", y el catálogo
          muestra todo (sin filtro de vertical). */}

      {/* Brandon 2026-06-12: estas secciones de descubrimiento (visto, nuevos,
          tiendas destacadas, lo más pedido) SOLO aparecen en "Todo". Al elegir
          una categoría específica (Comida/Ferretería) se ocultan y queda solo el
          catálogo general FILTRADO. */}

      {/* 1.5 Visto recientemente — self-hide si no vio nada. */}
      <Suspense fallback={null}>
        <ShowWhenAllVerticals>
          <HomeRecentlyViewed />
        </ShowWhenAllVerticals>
      </Suspense>

      {/* 2. Categorías del superadmin (solo desktop lg+ — en mobile duplica los
          chips de vertical). */}
      <div className="hidden lg:block">
        <Suspense fallback={<SectionSkeleton minH="min-h-[340px]" />}>
          <Reveal>
            <CategoriesGrid />
          </Reveal>
        </Suspense>
      </div>

      {/* 2.5 Descubrimiento — "Recién llegados" + "Ranking semanal" LADO A LADO
          (Brandon 2026-06-12): una sola fila, 2 cajas; cada caja muestra ~3
          cards deslizables. En mobile se apilan. Cada caja se auto-oculta si no
          tiene datos. */}
      <Suspense fallback={null}>
        <ShowWhenAllVerticals>
          <Reveal>
            <section
              aria-label="Recién llegados y ranking"
              className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-stretch">
                <HomeNewArrivals boxed />
                <MarketplaceTopToday boxed />
              </div>
            </section>
          </Reveal>
        </ShowWhenAllVerticals>
      </Suspense>

      {/* 3. Marquee de logos (todas las tiendas) + fila Ofertas | Paquetes.
          Brandon 2026-06-12: reemplaza el grid de "Tiendas destacadas" por dos
          cajas (Ofertas + Paquetes) con la misma temática de la fila de
          descubrimiento. Cada caja se auto-oculta si no tiene productos. */}
      <Suspense fallback={null}>
        <ShowWhenAllVerticals>
          <Reveal>
            <StoreLogosMarqueeRSC />
            <section
              aria-label="Ofertas y paquetes"
              className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-stretch">
                <HomeCatalogStrip
                  fetchUrl="/api/marketplace/catalog?sort=price_asc&limit=12"
                  eyebrow="Ofertas"
                  title="Ofertas del día"
                  actionHref="/?sort=price_asc#catalogo"
                  ariaLabel="Ofertas"
                  icon={<Tag className="h-5 w-5" strokeWidth={2.25} aria-hidden />}
                />
                <HomeCatalogStrip
                  fetchUrl="/api/marketplace/catalog?category=promociones&limit=12"
                  eyebrow="Paquetes"
                  title="Combos y paquetes"
                  actionHref="/?cat=promociones#catalogo"
                  ariaLabel="Paquetes"
                  icon={<Package className="h-5 w-5" strokeWidth={2.25} aria-hidden />}
                />
              </div>
            </section>
          </Reveal>
        </ShowWhenAllVerticals>
      </Suspense>

      {/* "Lo más pedido" ahora vive en la fila de descubrimiento (2.5), lado a
          lado con "Recién llegados". Brandon 2026-06-12. */}

      {/* 3.6 Catálogo de productos — el GRID completo que vivía en /marketplace
          (fusión /marketplace → /, Brandon 2026-06-08). Scroll infinito: va antes
          del FAQ; al agotarse el catálogo aparecen FAQ + footer. */}
      <Reveal>
        <section
          id="catalogo"
          aria-label="Catálogo de productos"
          className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 scroll-mt-24"
        >
          <SectionHeading eyebrow="Catálogo" title="Todos los productos" />
          {/* Audit mobile #6: tabs de orden → un solo grid que se reordena
              (Destacados/Nuevos/Menor precio/Mejor valorado), en vez de carruseles
              con productos repetidos. Setea ?sort= que el catálogo ya consume. */}
          <Suspense fallback={<div className="mb-3 h-11 border-b border-[var(--rule-soft)]" />}>
            <CatalogSortTabs />
          </Suspense>
          <HomeCatalog />
        </section>
      </Reveal>

      {/* 4. Preguntas frecuentes — contenido VISIBLE que matchea el FAQPage
          schema (política Google) + copy local indexable. Es ayuda al COMPRADOR
          (cómo pedir/pagar), por eso se queda; el "cómo funciona" para vendedores
          se movió a /negocios. */}
      <Reveal>
        <HomeFaqSection />
      </Reveal>
    </main>
  );
}

// Reserva la altura aproximada de la sección que carga, para que al swapear
// el contenido real NO salte la página (fix CLS 0.315 → objetivo <0.1).
function SectionSkeleton({ minH = "min-h-[600px]" }: { minH?: string }) {
  return (
    <div className={`${minH} flex items-center justify-center`}>
      <PaicheLoading variant="section" />
    </div>
  );
}
