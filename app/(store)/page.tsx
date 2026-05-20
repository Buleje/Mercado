import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { cacheLife, cacheTag } from "next/cache";
// Brandon 2026-05-20 v5: LandingHeader removido — chrome unificado vive
// en app/(store)/layout.tsx (mismo que /tiendas y /marketplace).

// ── Dynamic imports — Brandon 2026-05-20 audit-sprint perf:
// reducen initial bundle (Framer Motion + setInterval del hero, carousel cliente,
// scroll listeners del CTA mobile) y paralelizan compile. SSR se mantiene en
// los que aportan SEO above-the-fold (LandingHero, PopularCategoriesTiles,
// ComoFuncionaSection); below-fold (ReviewsCarousel) y mobile-only
// (StickyMobileCTA) van con ssr:false.
const LandingHero = dynamic(() => import("@/components/landing/LandingHero"), {
  ssr: true,
  loading: () => <div className="min-h-[600px] bg-[var(--surface-canvas)]" aria-hidden />,
});
// Brandon 2026-05-20: en Server Components Next 16 NO se permite `ssr: false`.
// Mantenemos `ssr: true` (default) — dynamic igual aporta code-splitting del
// chunk y permite paralelizar el compile. Los componentes pesados client-side
// se hidratarán post-LCP de todos modos por React Server Components streaming.
const ReviewsCarousel = dynamic(
  () => import("@/components/landing/LandingClientSections").then((m) => ({ default: m.ReviewsCarousel })),
  { loading: () => <div className="min-h-[300px]" aria-hidden /> },
);
const PopularCategoriesTiles = dynamic(
  () => import("@/components/landing/PopularCategoriesTiles"),
  { loading: () => <div className="min-h-[400px] bg-[var(--surface-sunken)]" aria-hidden /> },
);
const ComoFuncionaSection = dynamic(
  () => import("@/components/landing/sections/ComoFuncionaSection"),
  { loading: () => <div className="min-h-[400px] bg-[var(--surface-raised)]" aria-hidden /> },
);
const StickyMobileCTA = dynamic(
  () => import("@/components/landing/StickyMobileCTA"),
);
import { Reveal } from "@/components/landing/Reveal";
import { PaicheLoading } from "@/components/ui-system/illustrations/PaicheLoading";
import {
  Store,
  ArrowUpRight,
  Search,
  Bike,
  Building2,
  Sparkles,
  Star,
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
  title: "Pide lo que quieras, te lo llevamos",
  description:
    "Bodegas, restaurantes y farmacias de Pucallpa con delivery rápido. Paga con Yape, Plin o efectivo. Tu marketplace local en la Amazonía peruana.",
  alternates: { canonical: "https://www.buleje.pe" },
  openGraph: {
    title: "Pide lo que quieras, te lo llevamos | Buleje",
    description:
      "Bodegas, restaurantes y farmacias con delivery rápido. Yape y efectivo.",
    url: "https://www.buleje.pe",
    siteName: "Buleje",
    type: "website",
    locale: "es_PE",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Buleje — Marketplace de Bodegas y Tiendas del Perú",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pide lo que quieras, te lo llevamos | Buleje",
    description:
      "Bodegas, restaurantes y farmacias con delivery rápido en Pucallpa. Yape y efectivo.",
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
import { MarketplaceStatsDB } from "@/lib/db/marketplace-public.db";

async function getMarketplaceStats() {
  const { storeCount, productCount } = await MarketplaceStatsDB.getPublicMarketplaceStats();
  return { storeCount, productCount };
}

interface TopStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
}

async function getTopStores(): Promise<TopStore[]> {
  const stores = await MarketplaceStatsDB.getTopMarketplaceStores(10);
  return stores.map((s) => ({ id: s.id, slug: s.slug, name: s.name, logo: s.logo }));
}

// ── JSON-LD B2C marketplace ──────────────────────────────────────────────────
async function BulejeJsonLd() {
  // Audit 2026-05-17 02-P2-2: storeCount ya no se usa aquí (aggregateRating
  // removido por falta de reviewCount real). Mantener la función por si
  // futuras Schema.org entries necesitan stats.
  await getMarketplaceStats();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Buleje",
    url: "https://www.buleje.pe",
    description:
      "Marketplace de bodegas, restaurantes y tiendas del Perú. Compra online con delivery rápido. Yape y efectivo.",
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
          addressLocality: "Pucallpa",
          addressRegion: "Ucayali",
          addressCountry: "PE",
        },
      ],
      areaServed: [
        { "@type": "City", name: "Pucallpa" },
        { "@type": "Country", name: "Perú" },
      ],
    },
  };

  // Brandon 2026-05-20 v10 audit P1: FAQPage schema para Rich Results
  // (accordeon de preguntas directo en SERP). Las respuestas son del
  // copy real del marketplace, no inventadas.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "¿Cómo hago un pedido en Buleje?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Elegís tu tienda en /tiendas, seleccionás los productos y pagás con Yape, Plin o efectivo. Tu pedido llega en 25–35 minutos.",
        },
      },
      {
        "@type": "Question",
        name: "¿Buleje hace delivery en Pucallpa?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí. Hacemos delivery en Pucallpa y zonas cercanas de Ucayali. Tenemos bodegas, restaurantes, farmacias y más.",
        },
      },
      {
        "@type": "Question",
        name: "¿Puedo pagar con Yape o Plin en Buleje?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sí, aceptamos Yape, Plin y efectivo contra entrega en todos los pedidos del marketplace.",
        },
      },
      {
        "@type": "Question",
        name: "¿Cuánto tarda el delivery de Buleje?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "El tiempo estimado es de 25 a 35 minutos según tu ubicación y la tienda elegida. Las tiendas con horario abierto entregan el mismo día.",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}

// ── 1. Hero Rappi-style — buscador centrado + tagline corto ──────────────────
// Q1 2026-05-20: async para consumir getMarketplaceStats (cached "use cache").
// Renderiza stats reales debajo del search + trust-pill Yape/efectivo +
// subtítulo VISIBLE en mobile (antes hidden sm:block — invisible al usuario
// Pucallpa que no sabía que Buleje hace delivery con Yape).
async function RappiStyleHero() {
  const { storeCount, productCount } = await getMarketplaceStats();
  return (
    <section
      aria-label="Inicio"
      className="relative overflow-hidden border-b-2 border-[var(--accent)]/15 bg-linear-to-br from-[var(--accent-soft)] via-[var(--surface-canvas)] to-[var(--accent-soft)]"
    >
      {/* Brandon 2026-05-20 v8: orbs decorativos y dotted grid solo en sm+
          (mobile pintaba 2 blurs grandes + radial-gradient inset-0 = ~40%
          del paint time del above-the-fold). Mobile mantiene el gradiente
          liso del bg + border-b accent — diseño igual de claro, paint
          instantáneo. */}
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-[var(--accent)]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute -bottom-32 -left-32 h-[360px] w-[360px] rounded-full bg-[var(--accent)]/10 blur-3xl"
      />
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(var(--accent) 1.5px, transparent 1.5px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Brandon 2026-05-20 v8: hero mobile mas profesional —
          · padding pt-12→pt-8 sm:pt-20 (mas compacto, igual sentido aire desktop)
          · animate-ping gated a sm+ (mobile evita re-paint GPU)
          · `pointer-events-none` en blur overlays para no bloquear scroll */}
      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-20 pb-8 sm:pb-16 text-center">
        <p className="inline-flex items-center gap-2 mb-3 sm:mb-5 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
          <span
            aria-hidden
            className="inline-block h-[3px] w-8 sm:w-10 rounded-full bg-[var(--accent)]"
          />
          <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
            <span className="hidden sm:absolute sm:inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60 sm:animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          </span>
          Pedí online en Pucallpa
          <span
            aria-hidden
            className="inline-block h-[3px] w-8 sm:w-10 rounded-full bg-[var(--accent)]"
          />
        </p>

        <h1 className="text-[clamp(2rem,8vw,5rem)] font-extrabold leading-[1.02] sm:leading-[0.96] tracking-[-0.03em] sm:tracking-[-0.04em] text-[var(--text-primary)] max-w-4xl mx-auto">
          ¿Qué se te <span className="italic font-serif text-[var(--accent)]">antoja hoy?</span>
        </h1>
        {/* Brandon 2026-05-20 v12 audit F2 SEO: inyectadas keywords
            "marketplace", "Pucallpa", "Ucayali", "Amazonía peruana" en
            copy visible (audit reportó count=0 en hero text). Útil para
            Googlebot que da más peso al texto visible que a metadata.
            Q1 2026-05-20: subtítulo VISIBLE en mobile (era hidden sm:block). */}
        <p className="mt-3 sm:mt-5 max-w-2xl mx-auto text-sm sm:text-xl text-[var(--text-secondary)] leading-snug sm:leading-[1.4]">
          <span className="sm:hidden">
            El marketplace de Pucallpa, Ucayali — delivery rápido en 2 minutos.
          </span>
          <span className="hidden sm:inline">
            El marketplace #1 de Pucallpa, Ucayali. Bodegas, restaurantes y
            farmacias de tus vecinos en la Amazonía peruana, con delivery
            rápido y pagos en Yape, Plin o efectivo.
          </span>
        </p>

        {/* Form GET → /tiendas?q=... — sin JS, navegación nativa.
            Brandon 2026-05-20 v8: oculto en mobile (md:block). El cliente
            ya tiene un search pill en el navbar arriba — duplicarlo aquí en
            mobile saturaba el viewport y el hero no se sentía profesional.
            En desktop sí se muestra porque el hero es protagonista visual. */}
        <form
          role="search"
          action="/tiendas"
          method="get"
          className="hidden md:block mt-6 sm:mt-8 max-w-2xl mx-auto"
        >
          <div className="group relative">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 sm:h-6 sm:w-6 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors pointer-events-none"
              aria-hidden
              strokeWidth={2}
            />
            <input
              type="search"
              name="q"
              placeholder="Buscá tu tienda, restaurante o producto…"
              aria-label="Buscar tienda o producto"
              autoComplete="off"
              className="w-full h-14 sm:h-16 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] pl-14 sm:pl-16 pr-32 sm:pr-40 text-base sm:text-lg font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all hover:border-[var(--accent)]/40 hover:shadow-md focus:border-[var(--accent)] focus:bg-[var(--surface-canvas)] focus:shadow-lg focus:shadow-[var(--accent)]/15 focus:ring-4 focus:ring-[var(--accent)]/10 shadow-md"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-2 h-11 sm:h-12 px-4 sm:px-6 rounded-full bg-[var(--accent-600,var(--accent))] text-white text-sm sm:text-base font-extrabold shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <span className="hidden sm:inline">Buscar</span>
              <Search className="h-4 w-4 sm:h-5 sm:w-5 sm:hidden" strokeWidth={2.5} />
              <ArrowUpRight className="hidden sm:inline-block h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </form>

        {/* Q1 2026-05-20: Trust signals — stats reales + Yape pill.
            UX audit detectó: el vecino nuevo no sabe que Buleje funciona
            (sin reviews visibles ni números). storeCount/productCount
            ya vienen cacheados de getMarketplaceStats. */}
        {(storeCount > 0 || productCount > 0) && (
          <div className="mt-4 sm:mt-5 flex items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm font-bold text-[var(--text-secondary)] flex-wrap">
            {storeCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                </span>
                <span>{storeCount} tiendas activas</span>
              </span>
            )}
            {productCount > 0 && (
              <>
                <span aria-hidden className="text-[var(--rule-base)]">·</span>
                <span>{productCount.toLocaleString("es-PE")}+ productos</span>
              </>
            )}
            <span aria-hidden className="text-[var(--rule-base)]">·</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[var(--accent)]">
              Yape · Plin · efectivo
            </span>
          </div>
        )}

        {/* Chips sub-CTA — atajos */}
        <div className="mt-5 sm:mt-7 flex items-center justify-center gap-2 flex-wrap">
          <Link
            href="/tiendas"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white border-2 border-transparent hover:bg-[var(--accent)] hover:shadow-md px-5 h-10 sm:h-11 text-sm font-extrabold transition-all shadow-sm"
          >
            <Store className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Ver todas las tiendas
          </Link>
          <Link
            href="/marketplace/ofertas"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)]/40 px-4 h-10 sm:h-11 text-sm font-extrabold text-[var(--text-primary)] transition-all shadow-sm"
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Ofertas del día
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── 2. Categorías del superadmin — Brandon mayo 14 v3 ───────────────────────
// Antes eran emojis hardcoded. Ahora vienen del JSON que administra el
// superadmin (mismo storage que /api/marketplace/categories), con imageUrl
// real. Mantenemos el layout Rappi: 2 cards XL destacados arriba +
// resto en grid chico. Restaurantes y Bodegas (supermercado) son siempre
// los destacados (los primeros en orden), el resto va al grid chico.
// Emojis de fallback por slug si la imagen no está subida aún.

const EMOJI_FALLBACK: Record<string, string> = {
  restaurante: "🍱",
  bodega: "🛒",
  fruteria: "🥬",
  farmacia: "💊",
  ferreteria: "🛠️",
  polleria: "🍗",
  panaderia: "🥐",
  licoreria: "🍷",
  carniceria: "🥩",
  minimarket: "🏪",
  tecnologia: "📱",
};

const FEATURED_SLUGS = ["restaurante", "bodega"] as const;

function hrefForCategory(id: string): string {
  // Si la categoría existe como filtro /tiendas, ir ahí. Sino /marketplace/categoria.
  return `/tiendas?cat=${encodeURIComponent(id)}`;
}

async function CategoriesGrid() {
  const cats = await getSuperadminCategories();

  // Particiona: las 2 destacadas primero (Restaurantes + Bodega), resto en grid chico
  const featured = FEATURED_SLUGS
    .map((slug) => cats.find((c) => c.id === slug))
    .filter((c): c is SuperadminCategory => c !== undefined);
  const secondary = cats.filter((c) => !FEATURED_SLUGS.includes(c.id as typeof FEATURED_SLUGS[number]));

  if (cats.length === 0) return null;

  return (
    <section
      aria-label="Categorías"
      className="bg-[var(--surface-canvas)] py-12 sm:py-20"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-6 mb-6 sm:mb-10">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
              <span
                aria-hidden
                className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]"
              />
              Categorías
            </p>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.02]">
              Explorá por{" "}
              <span className="italic font-serif text-[var(--accent)]">categoría</span>
            </h2>
          </div>
          <Link
            href="/tiendas"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-4 h-10 text-xs font-bold text-[var(--text-primary)] transition-all"
          >
            Ver todas
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>

        {/* ── Featured XL: Restaurantes + Supermercado ────────────────── */}
        {featured.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 mb-3 sm:mb-5">
            {featured.map((c, idx) => (
              <Link
                key={c.id}
                href={hrefForCategory(c.id)}
                className="group relative flex items-center gap-4 sm:gap-6 rounded-3xl border-2 border-[var(--rule-base)] bg-linear-to-br from-[var(--accent-soft)]/70 to-[var(--surface-raised)] p-5 sm:p-8 hover:border-[var(--accent)] hover:-translate-y-1 hover:shadow-xl transition-all overflow-hidden min-h-[140px] sm:min-h-[180px]"
              >
                <div
                  aria-hidden
                  // Brandon 2026-05-20: blur orb decorativo solo en sm+ (paint
                  // costoso en mobile). blur-2xl + color fijo accent vs el
                  // gradiente b.tone original — más ligero y consistente.
                  className="hidden sm:block pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[var(--accent)]/15 blur-2xl group-hover:bg-[var(--accent)]/25 transition-colors"
                />
                {/* Imagen superadmin si existe, sino emoji fallback */}
                <span
                  className="relative inline-flex h-20 w-20 sm:h-28 sm:w-28 items-center justify-center rounded-full bg-[var(--surface-canvas)] shrink-0 shadow-md ring-4 ring-[var(--accent)]/10 group-hover:scale-110 transition-transform overflow-hidden"
                >
                  {c.imageUrl ? (
                    <Image
                      src={c.imageUrl}
                      alt={`${c.label} en Pucallpa con delivery rápido`}
                      fill
                      sizes="(min-width: 640px) 112px, 80px"
                      className="object-cover"
                      // Audit 2026-05-17 02-P1-02: featured[0] (Restaurante) es LCP
                      // candidate above-the-fold mobile. priority elimina ~200ms.
                      priority={idx === 0}
                    />
                  ) : (
                    <span className="text-5xl sm:text-7xl">
                      {EMOJI_FALLBACK[c.id] ?? "🛍️"}
                    </span>
                  )}
                </span>
                <div className="relative min-w-0 flex-1">
                  <h3 className="text-xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)] leading-tight">
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
        {secondary.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
            {secondary.map((c) => (
              <Link
                key={c.id}
                href={hrefForCategory(c.id)}
                className="group flex flex-col items-center gap-2 sm:gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4 hover:border-[var(--accent)] hover:-translate-y-1 hover:shadow-md transition-all"
              >
                <span
                  className="inline-flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-[var(--accent-soft)]/60 overflow-hidden group-hover:scale-110 transition-transform shrink-0"
                >
                  {c.imageUrl ? (
                    <Image
                      src={c.imageUrl}
                      alt={`${c.label} con delivery en Pucallpa`}
                      width={64}
                      height={64}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <span className="text-3xl sm:text-4xl">
                      {EMOJI_FALLBACK[c.id] ?? "🛍️"}
                    </span>
                  )}
                </span>
                <span className="text-[length:var(--ts-xs)] sm:text-sm font-extrabold tracking-tight text-center text-[var(--text-primary)] leading-tight line-clamp-2">
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

// ── 3. Top stores — SOLO logo + nombre grande (Brandon mayo 14 v2) ───────────
// Antes era FeaturedStoresCarousel con rating, productos, zona, categoría.
// Ahora minimal: avatar grande del logo + nombre debajo. Estilo "marcas"
// como Rappi en su sección de top 10. Grid responsive en lugar de carrusel
// para mostrar más limpio y sin JS de embla.

async function TopStoresSection() {
  const stores = await getTopStores();
  if (stores.length === 0) {
    return <EmptyStoresPlaceholder />;
  }
  return (
    <section
      aria-label="Tiendas más elegidas"
      className="bg-[var(--surface-sunken)]/40 border-y border-[var(--rule-soft)] py-12 sm:py-20"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-3 mb-6 sm:mb-10">
          <div>
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
              Top elegidos
            </p>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.02]">
              Las más elegidas{" "}
              <span className="italic font-serif text-[var(--accent)]">esta semana</span>
            </h2>
          </div>
          <Link
            href="/tiendas"
            className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)] hover:text-[var(--accent)] px-4 h-10 text-xs font-bold text-[var(--text-primary)] transition-all"
          >
            Ver todas
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>

        {/* Grid de logos: 3 cols mobile / 5 desktop. Solo logo redondo +
            nombre debajo. Hover = lift + ring accent. */}
        <ul
          role="list"
          aria-label={`${stores.length} tiendas destacadas`}
          className="grid grid-cols-3 sm:grid-cols-5 gap-4 sm:gap-6"
        >
          {stores.slice(0, 10).map((s, idx) => (
            <li key={s.id}>
              <Link
                href={`/marketplace/${s.slug}`}
                className="group flex flex-col items-center gap-3 sm:gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded-2xl"
              >
                {/* Logo grande circular */}
                <div className="relative h-24 w-24 sm:h-32 sm:w-32 rounded-full bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] overflow-hidden shadow-md ring-4 ring-transparent group-hover:ring-[var(--accent)]/30 group-hover:border-[var(--accent)] group-hover:scale-[1.04] transition-all">
                  {s.logo ? (
                    <Image
                      src={s.logo}
                      alt={s.name}
                      fill
                      sizes="(min-width: 640px) 128px, 96px"
                      className="object-cover"
                      // Audit 2026-05-17 02-P1-01: primeras 3 logos son LCP candidate
                      // en mobile (above-the-fold). priority elimina ~300ms de LCP en 3G.
                      priority={idx < 3}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] text-white font-black text-3xl sm:text-5xl">
                      {s.name.trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                {/* Nombre debajo, con buen tamaño */}
                <p className="text-sm sm:text-base font-extrabold tracking-tight text-center text-[var(--text-primary)] leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors max-w-[140px]">
                  {s.name}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function EmptyStoresPlaceholder() {
  return (
    <section className="bg-[var(--surface-sunken)]/40 border-y border-[var(--rule-soft)] py-12 sm:py-16">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 text-center">
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
          Estamos arrancando con los primeros negocios de Pucallpa. ¿Tenés
          una tienda? Sumate al Plan Fundador y arrancá hoy mismo.
        </p>
        <Link
          href="/negocios"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-6 h-12 text-sm font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:shadow-xl hover:scale-[1.02] transition-all"
        >
          Abrir mi tienda
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

// ── 4. Trabajá con nosotros — paleta de marca, sin acentos azul/naranja ──────
// Brandon mayo 14 2026 v2: rediseñado con solo --accent + neutros. Antes
// usaba #0ea5e9 y #f97316 que rompían visualmente con el resto del proyecto.
// Ahora layout más editorial: hero card grande arriba + 3 sub-cards abajo.

interface JoinCard {
  href: string;
  eyebrow: string;
  title: string;
  desc: string;
  cta: string;
  Icon: LucideIcon;
}

const JOIN_CARDS: JoinCard[] = [
  {
    href: "/negocios",
    eyebrow: "Para tiendas",
    title: "Registrá tu tienda",
    desc: "Bodega, minimarket o tienda de barrio. Sin comisión los primeros 90 días.",
    cta: "Abrir mi tienda",
    Icon: Store,
  },
  {
    href: "/negocios?tipo=comercio",
    eyebrow: "Para comercios",
    title: "Registrá tu comercio",
    desc: "Restaurante, farmacia o licorería. Llegá a más clientes hoy.",
    cta: "Registrar comercio",
    Icon: Building2,
  },
  {
    href: "/marketplace/repartidor",
    eyebrow: "Para repartidores",
    title: "Unite como repartidor",
    desc: "Generá ingresos extra con tu moto. Cobrás por pedido + 100% propinas.",
    cta: "Quiero repartir",
    Icon: Bike,
  },
];

function JoinUsSection() {
  return (
    <section
      aria-label="Sumate a Buleje"
      className="relative overflow-hidden bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)] py-16 sm:py-24"
    >
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute -top-32 right-1/4 h-[480px] w-[480px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute -bottom-32 left-1/4 h-[360px] w-[360px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header editorial */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
            <span aria-hidden className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]" />
            Sumate a Buleje
            <span aria-hidden className="inline-block h-[3px] w-8 rounded-full bg-[var(--accent)]" />
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.02]">
            Trabajá con{" "}
            <span className="italic font-serif text-[var(--accent)]">nosotros</span>
          </h2>
          <p className="mt-3 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            Vendé, repartí o creá tu negocio digital. Buleje está armando la
            red local de Pucallpa.
          </p>
        </div>

        {/* 3 cards editorial — todas con paleta accent + neutros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          {JOIN_CARDS.map((c, i) => {
            const Icon = c.Icon;
            // Card central destacada con bg accent-soft, las otras con bg raised
            const isFeatured = i === 0;
            return (
              <Link
                key={c.href}
                href={c.href}
                className={`group relative flex flex-col rounded-3xl border-2 p-6 sm:p-8 transition-all overflow-hidden hover:-translate-y-1 ${
                  isFeatured
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]/40 hover:bg-[var(--accent-soft)]/60 hover:shadow-2xl hover:shadow-[var(--accent)]/20"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:shadow-xl"
                }`}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[var(--accent)]/[0.10] blur-2xl group-hover:bg-[var(--accent)]/[0.20] transition-colors"
                />
                <span
                  aria-hidden
                  className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-5 shrink-0 transition-colors ${
                    isFeatured
                      ? "bg-[var(--accent-600,var(--accent))] text-white shadow-md shadow-[var(--accent)]/30"
                      : "bg-[var(--accent-soft)] text-[var(--accent)] group-hover:bg-[var(--accent-600,var(--accent))] group-hover:text-white"
                  }`}
                >
                  <Icon className="h-7 w-7" strokeWidth={2} />
                </span>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
                  {c.eyebrow}
                </p>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight">
                  {c.title}
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed flex-1">
                  {c.desc}
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--accent)] group-hover:gap-2.5 transition-all">
                  {c.cta}
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Main Home ────────────────────────────────────────────────────────────────
// Brandon 2026-05-20 v5: LandingHeader y Footer REMOVIDOS de la página.
// El chrome unificado (MarketplaceNavbar + ConditionalPromoBar +
// ConditionalSecondaryNav + BottomNav + Footer) vive ahora en
// app/(store)/layout.tsx — único punto compartido con /tiendas y /marketplace.
export default async function Home() {
  return (
    <main id="main-content">
      <BulejeJsonLd />

      {/* 1. Hero compacto con buscador */}
      <RappiStyleHero />

      {/* 2. Categorías del superadmin: 2 XL (Restaurantes + Bodega) + resto chicas */}
      <Suspense fallback={<SectionSkeleton />}>
        <Reveal>
          <CategoriesGrid />
        </Reveal>
      </Suspense>

      {/* 3. Top elegidos — solo logo + nombre */}
      <Suspense fallback={<SectionSkeleton />}>
        <Reveal>
          <TopStoresSection />
        </Reveal>
      </Suspense>

      {/* 4. Trabajá con nosotros — paleta del proyecto */}
      <Reveal>
        <JoinUsSection />
      </Reveal>
    </main>
  );
}

function SectionSkeleton() {
  return <PaicheLoading variant="section" />;
}
