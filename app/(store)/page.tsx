import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { cacheLife, cacheTag } from "next/cache";
import { resolveStoreContext } from "@/lib/store-metadata";
import TenantStoreHome from "@/components/store/TenantStoreHome";
import { safeJsonLdStringify } from "@/lib/seo/json-ld";
import { getLiveBannersForSlot } from "@/lib/promo-banners";
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
// La Junta del Barrio — rail de compra colaborativa vecinal (self-fetch,
// se auto-oculta si no hay juntas abiertas). Fase A3.
const JuntaBarrioStrip = dynamic(
  () => import("@/components/marketplace/home/JuntaBarrioStrip"),
);
// Hero rotativo full-width estilo marketplace pro (Brandon 2026-06-12): reemplaza
// el viejo hero "Pedí en {ciudad}" + buscador por un banner deslizable (swipe).
const HomeHeroBanner = dynamic(
  () => import("@/components/marketplace/home/HomeHeroBanner"),
);
// WelcomeStrip retirado del inicio (Brandon 2026-07-06) — ver comentario abajo.
import { PaicheLoading } from "@/components/ui-system/illustrations/PaicheLoading";
import CategoriasBento from "@/components/marketplace/home/CategoriasBento";
import DescubreSeccion from "@/components/marketplace/home/DescubreSeccion";
import UrgenciaHoy from "@/components/marketplace/home/UrgenciaHoy";
import TiendasDelBarrio from "@/components/marketplace/home/TiendasDelBarrio";
import CatalogoSeccion from "@/components/marketplace/home/CatalogoSeccion";
import HomeFaq from "@/components/marketplace/home/HomeFaq";
import { HOME_FAQS } from "@/lib/marketplace/home-faqs";
import HomeRecentlyViewed from "@/components/marketplace/home/HomeRecentlyViewed";
import { ShowWhenAllVerticals } from "@/components/marketplace/home/MarketplaceVerticalChips";

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
  description: `Pide online en ${BRAND_GEO.city} (${BRAND_GEO.province}, ${BRAND_GEO.region}): bodegas, restaurantes y farmacias con delivery rápido. Paga con Yape, Plin o efectivo.`,
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

// ── Categorías del catálogo (audit #2 2026-07-05, eje "por producto") ────────
// La sección "Explora por categoría" pasó de RUBROS de tienda (Restaurantes/
// Ferreterías, del JSON del superadmin) a CATEGORÍAS DE PRODUCTO (Bebidas/
// Carnes/Postres…, vía MarketplacePublicDB) — la MISMA fuente que el header y
// el mega-menú → una sola taxonomía consistente. Esta forma la reusa CategoriesGrid.

// ── Cached marketplace stats + top stores via lib/db (regla #1 CLAUDE.md)
// Brandon 2026-05-20 audit-sprint: las queries antes hacían `prisma.*` directo
// con eslint-disable como excusa cross-tenant. Ahora vive en
// `lib/db/marketplace-public.db.ts` (MarketplaceStatsDB) — único punto que
// accede a prisma, con `use cache` + cacheLife + cacheTag homogéneos.
import { MarketplaceStatsDB, MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
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
  const initialBanners = (await getLiveBannersForSlot("tiendas-hero"))
    .filter((b) => b.active)
    .sort((a, b) => a.order - b.order);
  return (
    <section aria-label="Inicio" className="relative">
      {/* H1 de la home — invisible pero presente (SEO). Mantiene la keyword geo
          que Google pondera fuerte en el H1 de la portada. */}
      <h1 className="sr-only">
        Pide online en {BRAND_GEO.city}, {BRAND_GEO.region} — bodegas,
        restaurantes y farmacias con delivery rápido (Yape, Plin o efectivo)
      </h1>
      <HomeHeroBanner initialBanners={initialBanners} />
    </section>
  );
}

export default async function Home() {
  // Tienda INDIVIDUAL del comerciante (subdominio / /t/<slug>): portada propia,
  // AISLADA del marketplace. En el dominio principal se ve la home del marketplace.
  const { isTenant } = await resolveStoreContext();
  if (isTenant) return <TenantStoreHome />;

  return (
    <main id="main-content" className="flex flex-col [&>div:empty]:hidden">
      <BulejeJsonLd />
      {/* A · Hero (H1 visible para SEO) */}
      <HomeHero />
      {/* B · Retomar (se oculta solo) */}
      <Suspense fallback={null}>
        <ShowWhenAllVerticals>
          <HomeRecentlyViewed />
        </ShowWhenAllVerticals>
      </Suspense>
      {/* B · ¿Qué se te antoja? (desktop; en celular mandan los chips del chrome) */}
      <div className="hidden md:block">
        <Suspense fallback={<SectionSkeleton minH="min-h-[340px]" />}>
          <CategoriasBento />
        </Suspense>
      </div>
      {/* B · Descubre */}
      <Suspense fallback={null}>
        <ShowWhenAllVerticals>
          <DescubreSeccion />
        </ShowWhenAllVerticals>
      </Suspense>
      {/* B · Se acaban hoy */}
      <Suspense fallback={null}>
        <ShowWhenAllVerticals>
          <UrgenciaHoy />
        </ShowWhenAllVerticals>
      </Suspense>
      {/* B · Tiendas de tu barrio */}
      <Suspense fallback={null}>
        <ShowWhenAllVerticals>
          <TiendasDelBarrio />
        </ShowWhenAllVerticals>
      </Suspense>
      <JuntaBarrioStrip />
      {/* C · Todo el mercado */}
      <CatalogoSeccion />
      {/* C · Preguntas frecuentes (matchean el FAQPage schema) */}
      <HomeFaq />
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
