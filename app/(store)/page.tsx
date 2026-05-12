import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import { ReviewsCarousel } from "@/components/landing/LandingClientSections";
import LandingHero from "@/components/landing/LandingHero";
import PopularCategoriesTiles from "@/components/landing/PopularCategoriesTiles";
import ComoFuncionaSection from "@/components/landing/sections/ComoFuncionaSection";
import LandingHeader from "@/components/landing/LandingHeader";
import StickyMobileCTA from "@/components/landing/StickyMobileCTA";
import { Reveal } from "@/components/landing/Reveal";
import { PaicheLoading } from "@/components/ui-system/illustrations/PaicheLoading";
import T from "@/components/T";
import {
  Store,
  ArrowUpRight,
  Banknote,
  CreditCard,
} from "@buleje/design-system/icons";
// Below-fold — dynamic con skeleton para reducir initial bundle en prod y
// parallelizar compile en dev. Combinacion warm-routes (ver scripts/) +
// dynamic es ideal: cada chunk se compila una vez, luego navegacion es <1s.
const BodegueroSpotlight = dynamic(
  () => import("@/components/marketplace/home/BodegueroSpotlight"),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const NosotrosSection = dynamic(
  () => import("@/components/landing/sections/NosotrosSection"),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const FAQSection = dynamic(
  () => import("@/components/landing/sections/FAQSection"),
  { ssr: true, loading: () => <SectionSkeleton /> },
);
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });
// Brandon mayo 2026: home y /abrir-tienda muestran los 4 planes
// idénticos (Estándar/Pro/Enterprise/Max) — fuente única plan-tiers.
const HomePlansToggle = dynamic(
  () => import("@/components/landing/abrir-tienda/PlansToggle"),
);

export const metadata: Metadata = {
  // Designer audit P0: el template root "%s | Buleje" duplicaba la marca.
  // Removido "Buleje — " del prefijo y "| Bodegas..." del suffix; el template
  // añade "| Buleje" al final, dando: "Pide lo que quieras... | Buleje".
  title: "Pide lo que quieras, te lo llevamos",
  description:
    "Compra en bodegas, minimarkets y tiendas de tu zona con delivery rápido. Paga con Yape o efectivo. Miles de productos al alcance de tu mano en Buleje.",
  alternates: {
    canonical: "https://www.buleje.pe",
  },
  openGraph: {
    title: "Pide lo que quieras, te lo llevamos | Buleje",
    description:
      "Compra en bodegas y tiendas de tu zona con delivery rápido. Yape y efectivo.",
    url: "https://www.buleje.pe",
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
};

// ── Cached marketplace stats from DB ──
async function getMarketplaceStats() {
  "use cache";
  cacheLife({ revalidate: 300, stale: 60, expire: 900 });
  cacheTag("marketplace-stats");
  const { prisma } = await import("@/lib/prisma");
  const [storeCount, productCount, avgRating] = await Promise.all([
    // eslint-disable-next-line no-restricted-properties -- agregacion publica marketplace cross-tenant.
    prisma.store.count({ where: { isPublished: true } }).catch(() => 0),
    // eslint-disable-next-line no-restricted-properties -- agregacion publica marketplace cross-tenant.
    prisma.product.count({ where: { active: true } }).catch(() => 0),
    // eslint-disable-next-line no-restricted-properties -- agregacion publica marketplace cross-tenant.
    prisma.review
      .aggregate({ _avg: { rating: true }, where: { status: "approved" } })
      .then((r) => r._avg.rating ?? 4.8)
      .catch(() => 4.8),
  ]);
  return { storeCount, productCount, avgRating: Number(avgRating.toFixed(1)) };
}

// ── Cached reviews from DB ──
async function getMarketplaceReviews() {
  "use cache";
  cacheLife({ revalidate: 600, stale: 120, expire: 1800 });
  cacheTag("marketplace-reviews");
  const { prisma } = await import("@/lib/prisma");
  try {
    // eslint-disable-next-line no-restricted-properties -- reviews publicas marketplace cross-tenant.
    return await prisma.review.findMany({
      where: { status: "approved", rating: { gte: 4 }, storeId: { not: null } },
      orderBy: { date: "desc" },
      take: 6,
      select: { id: true, name: true, text: true, rating: true, date: true },
    });
  } catch {
    return [];
  }
}

// ── JSON-LD structured data (consumer marketplace) ──
async function BulejeJsonLd() {
  const { avgRating, storeCount } = await getMarketplaceStats();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Buleje",
    url: "https://www.buleje.pe",
    description:
      "Marketplace de bodegas y tiendas del Peru. Compra online con delivery rápido.",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.buleje.pe/marketplace?buscar={search_term_string}",
      "query-input": "required name=search_term_string",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: avgRating.toString(),
      reviewCount: Math.max(storeCount, 1).toString(),
      bestRating: "5",
      worstRating: "1",
    },
    provider: {
      "@type": "Organization",
      name: "Buleje",
      url: "https://www.buleje.pe",
      foundingLocation: {
        "@type": "Place",
        name: "Ciudad Constitución, Perú",
      },
      address: [
        {
          "@type": "PostalAddress",
          addressLocality: "Ciudad Constitución",
          addressRegion: "Pasco",
          addressCountry: "PE",
        },
        {
          "@type": "PostalAddress",
          addressLocality: "Pucallpa",
          addressRegion: "Ucayali",
          addressCountry: "PE",
        },
      ],
      areaServed: [
        { "@type": "City", name: "Ciudad Constitución" },
        { "@type": "City", name: "Pucallpa" },
        { "@type": "Country", name: "Perú" },
      ],
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

// ── Hero — 2-column layout con ilustraciones locales + diferenciador
// cualitativo. Audit P9: removida la query de stats que era descartada
// dentro del componente (LandingHero ya no usa numbers desde mayo).
function HeroSection() {
  return (
    <LandingHero />
  );
}

// StatsMarquee section eliminada (mayo 2026): mostraba "6+ tiendas / 147+
// productos" como métricas prominentes — números bajos minan credibilidad.
// La home volverá a tener una sección "en números" cuando superemos 500
// tiendas activas. Mientras tanto: diferenciador regional honesto en hero.

// ── Reviews section (real DB data) o placeholder honesto pre-launch ──
// UX Strategy P1-5 fix 2026-04-30: si no hay reviews reales, NO mostramos
// fallbackReviews falsos. Mayo 2026: agregamos un placeholder honesto
// "Únete a los primeros 10 negocios" cuando la sección está vacía.
async function ReviewsSection() {
  const reviews = await getMarketplaceReviews();
  if (reviews.length > 0) return <ReviewsCarousel reviews={reviews} />;
  return <EarlyAdopterPlaceholder />;
}

// ── Placeholder honesto para fase pre-launch ──
// v2 (2026-05-10): rediseñado con peso editorial. Antes era CTA solo centrado
// en océano vacío. Ahora 2 columnas con visual de cupos + checklist concreta
// + social proof + urgencia (sin inventar números).
function EarlyAdopterPlaceholder() {
  // Cupos: total 10, tomados 3 (ajustable cuando entren onboardings reales).
  const CUPOS_TOTAL = 10;
  const CUPOS_TOMADOS = 3;
  const cuposDisponibles = CUPOS_TOTAL - CUPOS_TOMADOS;
  const progressPct = (CUPOS_TOMADOS / CUPOS_TOTAL) * 100;

  const BENEFICIOS = [
    "Setup 1-a-1 con tu tienda lista en una tarde",
    "Acompañamiento WhatsApp directo · 90 días",
    "Cero comisión por venta los primeros 90 días",
    "Sesión de fotos de tus productos sin costo",
    "Tu negocio en el mapa Buleje desde el día 1",
  ];

  return (
    <section
      aria-label="Únete a los primeros negocios"
      className="relative overflow-hidden bg-[var(--surface-canvas)] py-20 sm:py-28 border-y border-[var(--rule-soft)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-20 h-[500px] w-[500px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-20 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.04] blur-3xl"
      />

      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">
          {/* ── Columna izquierda: pitch + checklist + CTA ──────────────── */}
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
              </span>
              Pre-launch · Pucallpa
            </p>
            <h2 className="text-[clamp(2.25rem,5.5vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.98]">
              Sé de los primeros{" "}
              <span className="text-[var(--accent)]">{CUPOS_TOTAL} negocios.</span>
            </h2>
            <p className="mt-5 text-lg sm:text-xl text-[var(--text-secondary)] leading-[1.45] max-w-xl">
              Estamos arrancando con bodegas seleccionadas. Te contactamos personalmente,
              configuramos tu tienda contigo y te acompañamos cada paso.
            </p>

            {/* Checklist de qué incluye */}
            <ul className="mt-8 space-y-2.5 max-w-xl">
              {BENEFICIOS.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)] shrink-0 mt-0.5"
                  >
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 8.5 6.5 12 13 4" />
                    </svg>
                  </span>
                  <span className="text-base text-[var(--text-secondary)] leading-snug">
                    {b}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/abrir-tienda"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-7 py-4 text-base font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
              >
                Reservar mi cupo gratis
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
              </Link>
              <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                Sin tarjeta · 5 minutos · Cancelas cuando quieras
              </span>
            </div>
          </div>

          {/* ── Columna derecha: visual de cupos ────────────────────────── */}
          <aside className="relative">
            <div className="rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-7 sm:p-9 shadow-[var(--shadow-lg)]">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Cupos del Plan Fundador
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-50)] text-[var(--data-warning-700)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
                  Limitado
                </span>
              </div>
              <p className="text-5xl sm:text-6xl font-black tracking-[-0.04em] tabular-nums leading-none mt-2">
                <span className="text-[var(--accent)]">{cuposDisponibles}</span>
                <span className="text-[var(--text-tertiary)] text-2xl sm:text-3xl font-extrabold ml-2">
                  / {CUPOS_TOTAL}
                </span>
              </p>
              <p className="mt-1 text-base text-[var(--text-secondary)]">
                cupos disponibles ahora mismo
              </p>

              {/* Progress bar */}
              <div className="mt-6">
                <div className="relative h-3 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-[var(--accent)] to-[var(--accent-600,var(--accent))] transition-[width] duration-[var(--dur-slower)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[length:var(--ts-xs)]">
                  <span className="font-bold text-[var(--accent)] tabular-nums">
                    {CUPOS_TOMADOS} tomados
                  </span>
                  <span className="font-bold text-[var(--text-tertiary)] tabular-nums">
                    {cuposDisponibles} libres
                  </span>
                </div>
              </div>

              {/* Avatares de fundadores */}
              <div className="mt-7 pt-6 border-t border-[var(--rule-soft)]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
                  Negocios que ya entraron
                </p>
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {[
                      { l: "D", c: "var(--accent)" },
                      { l: "P", c: "#722EAB" },
                      { l: "L", c: "#f97316" },
                    ].map(({ l, c }) => (
                      <span
                        key={l}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white font-black text-sm ring-3 ring-[var(--surface-raised)]"
                        style={{ background: c }}
                        aria-hidden
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-snug">
                    <strong className="font-extrabold text-[var(--text-primary)]">Don Lucho, Pòlleria El Dorado</strong>{" "}
                    y otros ya están vendiendo con Buleje.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

// ── Business CTA banner — 2 columnas editorial ──
// v2 (2026-05-10): antes era un card grande con el lado derecho vacío
// (gradient blob solo). Ahora 2-col: izquierda pitch + CTA, derecha card
// oscuro con dashboard mock + numbers que respalden la promesa.
function PromoBanners() {
  return (
    <section
      aria-label="Sumate a Buleje"
      className="py-20 sm:py-28 bg-[var(--surface-canvas)]"
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="group relative bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-3xl overflow-hidden transition-all hover:border-[var(--accent)] hover:shadow-[var(--shadow-lg)]">
          {/* Gradient accent decorativo */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 -right-20 h-[440px] w-[440px] rounded-full bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] opacity-[0.10] blur-3xl group-hover:opacity-[0.18] transition-opacity"
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 p-8 sm:p-10 lg:p-12 items-center">
            {/* ── Izquierda: pitch + CTA ────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-600,var(--accent))] text-white shadow-md">
                  <Store className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <T k="landing.promo.business.kicker" fallback="Para dueños" />
                </p>
              </div>

              <h3 className="text-[clamp(1.75rem,4vw,2.75rem)] font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.04]">
                <T k="landing.promo.business.title1" fallback="Vendé sin comisión" />
                <br />
                <span className="text-[var(--accent)]">
                  <T k="landing.promo.business.titleAccent" fallback="los primeros 90 días." />
                </span>
              </h3>

              <p className="mt-5 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed max-w-lg">
                <T
                  k="landing.promo.business.desc"
                  fallback="Tu bodega online en 5 minutos. Yape, efectivo, delivery propio. Cero costo fijo."
                />
              </p>

              {/* Bullet list compacto */}
              <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 max-w-xl">
                {[
                  "Setup en 5 minutos",
                  "Yape · Plin · Efectivo · Tarjeta",
                  "Delivery propio o nuestros repartidores",
                  "Soporte WhatsApp 24/7",
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] shrink-0 mt-0.5">
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 8.5 6.5 12 13 4" />
                      </svg>
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/abrir-tienda"
                  className="group/cta inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
                >
                  <T k="landing.promo.business.cta" fallback="Abrir mi tienda gratis" />
                  <ArrowUpRight
                    className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5"
                    strokeWidth={2.5}
                  />
                </Link>
                <Link
                  href="#planes"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-transparent px-6 py-3.5 text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  Ver planes
                </Link>
              </div>
            </div>

            {/* ── Derecha: dashboard mock con stats que respaldan ─────────── */}
            <aside className="relative">
              <div className="rounded-2xl bg-[var(--text-primary)] text-[var(--surface-canvas)] p-6 sm:p-7 shadow-[var(--shadow-xl)]">
                <div className="flex items-center justify-between gap-3 mb-5">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-white/60">
                    Tu panel · Hoy
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                    <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-70 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    </span>
                    En vivo
                  </span>
                </div>
                <p className="text-4xl sm:text-5xl font-black tracking-[-0.04em] tabular-nums leading-none">
                  S/ 2,887
                </p>
                <p className="mt-1 text-sm text-white/60">
                  vendido hoy · 23 pedidos
                </p>

                {/* Mini stats grid */}
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { v: "0%",    l: "comisión" },
                    { v: "5 min", l: "setup" },
                    { v: "24/7",  l: "soporte" },
                  ].map(({ v, l }) => (
                    <div key={l} className="rounded-xl bg-white/[0.06] backdrop-blur px-3 py-3">
                      <p className="text-lg sm:text-xl font-black tabular-nums leading-none tracking-tight">
                        {v === "0%" ? (
                          <>
                            <span className="text-[var(--accent)]">0</span>
                            <span className="text-white/50">%</span>
                          </>
                        ) : (
                          <span className="text-white">{v}</span>
                        )}
                      </p>
                      <p className="mt-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white/55">
                        {l}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Eventos recientes */}
                <ul className="mt-5 space-y-1.5">
                  {[
                    { who: "Doña Marta", what: "pidió pollo broaster · S/ 28.50", t: "hace 2 min" },
                    { who: "Carlos S.", what: "Yape confirmado · S/ 15.00", t: "hace 5 min" },
                    { who: "Lucía P.", what: "armó carrito de S/ 42.30", t: "hace 7 min" },
                  ].map((e) => (
                    <li key={e.t} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2">
                      <p className="text-xs text-white/85 leading-snug truncate min-w-0">
                        <strong className="font-extrabold text-white">{e.who}</strong>{" "}
                        <span className="text-white/60">·</span> {e.what}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] text-white/45 tabular-nums shrink-0">
                        {e.t}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Planes snapshot — fuente única plan-tiers.ts ──
// Brandon mayo 2026 v2: 4 planes alineados con /abrir-tienda y superadmin.
//   Free (S/0 siempre gratis con limites) · Starter (S/89 1er mes gratis) ·
//   Pro (S/179 badge "Mas elegido") · Business (S/349).
function AboutAndPricingSnapshot() {
  return (
    <section
      id="planes"
      aria-label="Planes"
      className="relative overflow-hidden bg-[var(--surface-canvas)] py-20 sm:py-28 scroll-mt-20"
    >
      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12 sm:mb-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
              <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
              <T k="landing.plans.kicker" fallback="Planes" />
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              <T k="landing.plans.title" fallback="Prueba un mes," />{" "}
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                <T k="landing.plans.titleAccent" fallback="pagá solo si te conviene." />
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            <T k="landing.plans.description" fallback="Cambiás de plan cuando quieras. Sin contratos, sin permanencia, sin sorpresas en la factura." />
          </p>
        </div>

        {/* Mismo PlansToggle que /abrir-tienda — cero duplicación,
            cero desincronización. */}
        <HomePlansToggle />

        <div className="mt-12 text-center">
          <Link
            href="/abrir-tienda#planes"
            className="inline-flex items-center gap-2 text-base font-bold text-[var(--accent)] hover:gap-3 transition-all"
          >
            <T k="landing.plans.compare" fallback="Ver comparativa completa" />
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Formas de pago — chip horizontal compacto con colores de marca ──
// Mayo 2026: antes era una sección gigante de 4 cards con iconos genéricos.
// PaymentMethods v2 (2026-05-10) — sección rediseñada: 2 grupos (digital /
// físico) con cards reales por método + callout "0% comisión" con valor
// claro. Antes era un strip de chips delgados que se perdía visualmente entre
// las secciones grandes vecinas (Planes y FinalCTA).
function PaymentMethods() {
  const METHODS = [
    {
      id: "yape",
      name: "Yape",
      tag: "El más usado en Pucallpa",
      type: "digital" as const,
      brandHex: "#722EAB",
      mark: "Y",
    },
    {
      id: "plin",
      name: "Plin",
      tag: "Multibanco — Interbank, BBVA, BCP",
      type: "digital" as const,
      brandHex: "#00BFB3",
      mark: "P",
    },
    {
      id: "efectivo",
      name: "Efectivo",
      tag: "El repartidor lleva vuelto",
      type: "fisico" as const,
      icon: Banknote,
    },
    {
      id: "tarjeta",
      name: "Tarjeta",
      tag: "Crédito o débito · vía Stripe",
      type: "fisico" as const,
      icon: CreditCard,
    },
  ];

  return (
    <section
      aria-label="Formas de pago"
      className="relative overflow-hidden py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-20 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-5">
            <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
            <T k="landing.payment.kicker" fallback="Formas de pago" />
          </p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.05]">
            Tus clientes pagan{" "}
            <span className="italic font-serif text-[var(--accent)]">como ya saben pagar</span>.
          </h2>
          <p className="mt-5 text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto">
            Cuatro métodos cubiertos. Tu negocio cobra como siempre, sin curva de aprendizaje.
          </p>
        </div>

        {/* Grid 4 métodos */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10 sm:mb-12">
          {METHODS.map((m) => (
            <article
              key={m.id}
              className="group relative rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6 transition-all duration-[var(--dur-base)] hover:border-[var(--accent)] hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                {m.type === "digital" ? (
                  <span
                    aria-hidden
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-white font-black text-lg shadow-sm"
                    style={{ background: m.brandHex }}
                  >
                    {m.mark}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white"
                  >
                    {m.icon ? <m.icon className="h-5 w-5" strokeWidth={2} /> : null}
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${
                    m.type === "digital"
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                  }`}
                >
                  {m.type === "digital" ? "Digital" : "Físico"}
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text-primary)] leading-tight">
                {m.name}
              </p>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-snug">
                {m.tag}
              </p>
            </article>
          ))}
        </div>

        {/* Callout 0% comisión + Cobras como ya cobras */}
        <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex items-center gap-5 flex-1 min-w-0">
            <p className="text-5xl sm:text-6xl font-black tracking-[-0.04em] tabular-nums leading-none shrink-0">
              <span className="text-[var(--accent)]">0</span>
              <span className="text-[var(--text-secondary)]">%</span>
            </p>
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Comisión por venta
              </p>
              <p className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] leading-tight">
                Cobras como ya cobras — el dinero llega directo a tu Yape, tu cuenta o tu caja.
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)] leading-snug">
                Buleje no toca tus ventas. Pagas solo el plan mensual, sin sorpresas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA editorial ──
function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-canvas)] border-t border-[var(--rule-soft)]">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[var(--accent)]/[0.05] blur-3xl"
      />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
          <span
            aria-hidden
            className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
          />
          <T k="landing.finalCta.kicker" fallback="Empieza hoy" />
        </p>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
          <T k="landing.finalCta.title1" fallback="Tu negocio merece" />{" "}
          <br />
          <span className="italic font-serif text-[var(--accent)]">
            <T k="landing.finalCta.titleAccent" fallback="algo más grande." />
          </span>
        </h2>
        <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
          <T k="landing.finalCta.description" fallback="Activa tu tienda online en 5 minutos y empieza a recibir pedidos hoy mismo. Sin compromiso, cancelas cuando quieras." />
        </p>
        {/* CTA único — antes había 2 botones idénticos hacia /abrir-tienda. */}
        <div className="mt-12 flex justify-center">
          <Link
            href="/abrir-tienda"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-10 py-5 text-lg font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
          >
            Abrir mi tienda gratis
            <ArrowUpRight
              className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.5}
            />
          </Link>
        </div>
        <p className="mt-6 text-sm text-[var(--text-tertiary)]">
          Sin tarjeta · Setup en 5 minutos · Cancelás cuando quieras
        </p>
      </div>
    </section>
  );
}

// ── Main page ──
// Flujo informativo: hero → categorías → cómo funciona → detrás del marketplace
// (bodegueros) → voz de la comunidad (reseñas) → ser parte (negocio / repartidor)
// → formas de pago → CTA.
// Removido: RecommendationsEngine, SocioPromoBanner, FeaturedStoresSection.
// (La landing debe informar, no vender productos individuales — eso es /marketplace/explorar).
export default async function Home() {
  return (
    <main id="main-content">
      <BulejeJsonLd />
      <LandingHeader />
      {/* DiscountBanner (10% nuevos compradores) movido a /marketplace —
          no debe aparecer en la home de vendedores. */}

      {/* Hero — presentación del marketplace */}
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection />
      </Suspense>

      {/* Categorías populares — grid unico 6 categorias con ilustraciones */}
      <Reveal>
        <PopularCategoriesTiles />
      </Reveal>

      {/* Cómo funciona — 4 pasos + stats + CTA (reemplaza /como-funciona) */}
      <Reveal>
        <ComoFuncionaSection />
      </Reveal>

      {/* Conoce a tu bodeguero — humanos detrás (movida desde /tiendas) */}
      <Reveal>
        <BodegueroSpotlight />
      </Reveal>

      {/* Nosotros — historia + valores (stats viven en hero, no se duplican) */}
      <Reveal>
        <NosotrosSection />
      </Reveal>

      {/* Voz de la comunidad — reviews reales de DB */}
      <Suspense fallback={<SectionSkeleton />}>
        <Reveal>
          <ReviewsSection />
        </Reveal>
      </Suspense>

      {/* Planes snapshot (el bloque de Nosotros ya vive arriba en NosotrosSection) */}
      <Reveal>
        <AboutAndPricingSnapshot />
      </Reveal>

      {/* FAQ — sección editorial consolidada (reemplaza /faq) */}
      <Reveal>
        <FAQSection />
      </Reveal>

      {/* Ser parte — negocio + repartidor */}
      <Reveal>
        <PromoBanners />
      </Reveal>

      {/* Info confianza */}
      <Reveal>
        <PaymentMethods />
      </Reveal>

      {/* CTA final */}
      <Reveal>
        <FinalCTA />
      </Reveal>

      <Footer />
      <StickyMobileCTA />
    </main>
  );
}

function HeroSkeleton() {
  return <PaicheLoading variant="page" label="Preparando tu marketplace…" />;
}

function SectionSkeleton() {
  return <PaicheLoading variant="section" />;
}
