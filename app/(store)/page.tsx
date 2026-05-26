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
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
}

async function getTopStores(): Promise<TopStore[]> {
  const stores = await MarketplaceStatsDB.getTopMarketplaceStores(10);
  return stores.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    logo: s.logo,
    category: s.category,
    zone: s.zone,
    rating: s.rating,
    reviewCount: s.reviewCount,
  }));
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

// ── 1. Hero Premium — gradiente rico + textura amazónica + buscador protagonista
// v3 2026-05-26: fondo visual con gradiente teal/verde + textura sutil (sin
// imagen rota). Buscador visualmente más grande. Stats y CTAs mantenidos.
async function RappiStyleHero() {
  const { storeCount, productCount } = await getMarketplaceStats();
  return (
    <section
      aria-label="Inicio"
      className="relative overflow-hidden"
      style={{
        // Gradiente de marca: teal oscuro → teal Buleje (#00B4A6) → teal medio.
        // Color de marca, sin verdes. Profundidad sin imágenes externas.
        background:
          "linear-gradient(135deg, #00302c 0%, #005249 25%, #007a6e 55%, #00B4A6 88%, #008b7f 100%)",
      }}
    >
      {/* Textura sutil: puntos blancos muy transparentes (patrón selvático) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Líneas diagonales muy finas — refuerzan textura premium */}
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, white 0px, white 1px, transparent 1px, transparent 40px)",
        }}
      />

      {/* Orbs de luz: calidez teal en esquinas para profundidad 3D */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, #33C4B8 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-20 h-[400px] w-[400px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #5fd6cb 0%, transparent 70%)" }}
      />
      {/* Orb naranja cálido tenue — acento secundario de marca */}
      <div
        aria-hidden
        className="hidden sm:block pointer-events-none absolute top-1/2 -translate-y-1/2 right-[8%] h-[280px] w-[280px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #f97316 0%, transparent 70%)" }}
      />

      {/* Borde inferior sutil para separación de sección */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-white/10"
      />

      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-24 pb-10 sm:pb-20 text-center">
        {/* Eyebrow badge */}
        <p className="inline-flex items-center gap-2 mb-4 sm:mb-6 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white/75">
          <span
            aria-hidden
            className="inline-block h-[2px] w-8 sm:w-10 rounded-full bg-white/50"
          />
          <span aria-hidden className="relative inline-flex h-2 w-2">
            <span className="hidden sm:absolute sm:inline-flex h-full w-full rounded-full bg-[#34d4be] opacity-70 sm:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#34d4be]" />
          </span>
          Pedí online en Pucallpa
          <span
            aria-hidden
            className="inline-block h-[2px] w-8 sm:w-10 rounded-full bg-white/50"
          />
        </p>

        {/* H1 principal — tipografía grande, contraste blanco sobre verde oscuro */}
        <h1 className="text-[clamp(2.25rem,8.5vw,5.5rem)] font-extrabold leading-[1.0] tracking-[-0.035em] text-white max-w-4xl mx-auto drop-shadow-sm">
          ¿Qué se te{" "}
          <span
            className="italic font-serif"
            style={{ color: "#f97316" }}
          >
            antoja hoy?
          </span>
        </h1>

        {/* Subtítulo — texto claro con opacidad */}
        <p className="mt-4 sm:mt-6 max-w-2xl mx-auto text-sm sm:text-xl text-white/70 leading-snug sm:leading-[1.45]">
          <span className="sm:hidden">
            El marketplace de Pucallpa — delivery rápido, Yape o efectivo.
          </span>
          <span className="hidden sm:inline">
            El marketplace #1 de Pucallpa, Ucayali. Bodegas, restaurantes y
            farmacias de tus vecinos en la Amazonía peruana — delivery rápido
            con Yape, Plin o efectivo.
          </span>
        </p>

        {/* Buscador protagonista — visible en todos los tamaños de pantalla */}
        <form
          role="search"
          action="/tiendas"
          method="get"
          className="mt-8 sm:mt-10 max-w-2xl mx-auto"
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
              className="w-full h-14 sm:h-[4.5rem] rounded-2xl sm:rounded-full bg-white border-0 pl-14 sm:pl-16 pr-[5.5rem] sm:pr-44 text-base sm:text-lg font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all shadow-2xl shadow-black/30 focus:shadow-[0_8px_40px_rgba(0,0,0,0.35)] focus:ring-4 focus:ring-white/30"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-2 h-11 sm:h-14 px-4 sm:px-7 rounded-xl sm:rounded-full text-white text-sm sm:text-base font-extrabold shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
              style={{ background: "#f97316" }}
            >
              <span className="hidden sm:inline">Buscar</span>
              <Search className="h-4 w-4 sm:hidden" strokeWidth={2.5} aria-hidden />
              <ArrowUpRight className="hidden sm:inline-block h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </form>

        {/* Stats reales + trust pill Yape */}
        {(storeCount > 0 || productCount > 0) && (
          <div className="mt-5 sm:mt-6 flex items-center justify-center gap-3 sm:gap-5 text-xs sm:text-sm font-bold text-white/65 flex-wrap">
            {storeCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#34d4be] opacity-70 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#34d4be]" />
                </span>
                <span className="text-white/80">{storeCount} tiendas activas</span>
              </span>
            )}
            {productCount > 0 && (
              <>
                <span aria-hidden className="text-white/30">·</span>
                <span className="text-white/80">{productCount.toLocaleString("es-PE")}+ productos</span>
              </>
            )}
            <span aria-hidden className="text-white/30">·</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold text-white"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              Yape · Plin · efectivo
            </span>
          </div>
        )}

        {/* CTAs */}
        <div className="mt-6 sm:mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/tiendas"
            className="inline-flex items-center gap-2 rounded-full border-2 border-white/90 text-white hover:bg-white hover:text-[var(--accent)] px-6 h-11 sm:h-12 text-sm font-extrabold transition-all shadow-md hover:shadow-lg"
          >
            <Store className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Ver todas las tiendas
          </Link>
          <Link
            href="/marketplace/ofertas"
            className="inline-flex items-center gap-2 rounded-full px-6 h-11 sm:h-12 text-sm font-extrabold text-white transition-all shadow-md hover:shadow-lg hover:scale-[1.02]"
            style={{ background: "#f97316" }}
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
                {/* Imagen superadmin si existe, sino icono Lucide como fallback */}
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

async function TopStoresSection() {
  const stores = await getTopStores();
  if (stores.length === 0) {
    return <EmptyStoresPlaceholder />;
  }
  return (
    <section
      aria-label="Tiendas destacadas"
      className="bg-[var(--surface-sunken)]/40 border-y border-[var(--rule-soft)] py-12 sm:py-20"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-3 mb-6 sm:mb-10">
          <div>
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
              Tiendas destacadas
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

        {/* Grid de cards: 2 cols mobile / 3 tablet / 5 desktop.
            Cada card: logo + nombre + rating + categoría + zona. */}
        <ul
          role="list"
          aria-label={`${stores.length} tiendas destacadas`}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4"
        >
          {stores.slice(0, 10).map((s, idx) => (
            <li key={s.id}>
              <Link
                href={`/marketplace/${s.slug}`}
                aria-label={`${s.name}${s.rating > 0 ? `, ${s.rating.toFixed(1)} estrellas` : ""}${s.category ? `, ${s.category}` : ""}${s.zone ? `, ${s.zone}` : ""}`}
                className="group flex flex-col rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5 hover:border-[var(--accent)] hover:-translate-y-1 hover:shadow-xl transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                {/* Logo */}
                <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-xl bg-[var(--surface-canvas)] border border-[var(--rule-soft)] overflow-hidden shadow-sm group-hover:scale-[1.04] transition-transform mx-auto mb-3 shrink-0">
                  {s.logo ? (
                    <Image
                      src={s.logo}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 80px, 64px"
                      className="object-cover"
                      // Primeras 3 logos = LCP candidate
                      priority={idx < 3}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] text-white font-black text-2xl sm:text-3xl">
                      {s.name.trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Nombre */}
                <p className="text-sm font-extrabold tracking-tight text-center text-[var(--text-primary)] leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors mb-1.5">
                  {s.name}
                </p>

                {/* Rating */}
                <div className="flex justify-center mb-1.5">
                  <StoreRatingStars rating={s.rating} reviewCount={s.reviewCount} />
                </div>

                {/* Categoría + zona */}
                {(s.category || s.zone) && (
                  <div className="flex flex-col items-center gap-0.5">
                    {s.category && (
                      <span className="text-[10px] sm:text-xs font-semibold text-[var(--text-tertiary)] line-clamp-1 text-center">
                        {s.category}
                      </span>
                    )}
                    {s.zone && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-medium text-[var(--text-tertiary)] line-clamp-1">
                        <MapPin className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
                        {s.zone}
                      </span>
                    )}
                  </div>
                )}
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

      {/* 3. Tiendas destacadas — cards con rating + categoría + zona */}
      <Suspense fallback={<SectionSkeleton />}>
        <Reveal>
          <TopStoresSection />
        </Reveal>
      </Suspense>

      {/* 4. Cómo funciona — 4 pasos + stats + CTA */}
      <Suspense fallback={<SectionSkeleton />}>
        <Reveal>
          <ComoFuncionaSection />
        </Reveal>
      </Suspense>

      {/* 5. Trabajá con nosotros — paleta del proyecto */}
      <Reveal>
        <JoinUsSection />
      </Reveal>
    </main>
  );
}

function SectionSkeleton() {
  return <PaicheLoading variant="section" />;
}
