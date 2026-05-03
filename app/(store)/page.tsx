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
function EarlyAdopterPlaceholder() {
  return (
    <section
      aria-label="Únete a los primeros negocios"
      className="bg-[var(--surface-canvas)] py-20 sm:py-28"
    >
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-6">
          <span aria-hidden className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]" />
          Pre-launch
        </p>
        <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[1.05]">
          Sé de los primeros 10 negocios.
        </h2>
        <p className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto">
          Estamos arrancando con bodegas seleccionadas en Pucallpa. Te
          contactamos personalmente, configuramos tu tienda contigo y te
          acompañamos los primeros 90 días. Sin costo.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href="/abrir-tienda"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-7 py-4 text-base font-extrabold shadow-md hover:gap-3 transition-all"
          >
            Quiero abrir mi tienda
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.5} />
          </Link>
        </div>
        <p className="mt-6 text-sm text-[var(--text-tertiary)]">
          Acompañamiento 1-a-1 los primeros 90 días · Sin permanencia · Cancelas cuando quieras
        </p>
      </div>
    </section>
  );
}

// ── Business + Driver CTA banners — editorial asimétrico ──
function PromoBanners() {
  // Mayo 2026: home solo muestra el banner de bodegueros (vendedores).
  // El de repartidores se movió a su propia landing /repartidores para
  // mantener la home 100% enfocada en la audiencia primaria.
  const banners = [
    {
      keyKicker: "landing.promo.business.kicker",
      icon: Store,
      keyTitle1: "landing.promo.business.title1",
      keyTitleAccent: "landing.promo.business.titleAccent",
      keyDesc: "landing.promo.business.desc",
      keyStat: "landing.promo.business.stat",
      keyStatLabel: "landing.promo.business.statLabel",
      keyPrimary: "landing.promo.business.cta",
      primaryHref: "/abrir-tienda",
      keySecondary: null as string | null,
      secondaryHref: "",
      tone: "from-[var(--accent)] to-emerald-700",
    },
  ];

  return (
    <section
      aria-label="Sumate a Buleje"
      className="py-20 sm:py-28 bg-[var(--surface-canvas)]"
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5">
          {banners.map((b, i) => {
            const Icon = b.icon;
            return (
              <div
                key={i}
                className="group relative bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-3xl p-8 sm:p-10 transition-all hover:border-[var(--accent)] hover:shadow-[var(--shadow-lg)] overflow-hidden"
              >
                {/* Gradient accent decorativo top-right */}
                <div
                  aria-hidden
                  className={`absolute -top-20 -right-20 h-56 w-56 rounded-full bg-linear-to-br ${b.tone} opacity-[0.12] blur-3xl group-hover:opacity-[0.18] transition-opacity`}
                />

                <div className="relative flex items-center gap-3 mb-6">
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br ${b.tone} text-white shadow-md`}>
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    <T k={b.keyKicker} />
                  </p>
                </div>

                <h3 className="relative text-[clamp(1.75rem,3.8vw,2.5rem)] font-black tracking-[-0.03em] text-[var(--text-primary)] leading-[1.05]">
                  <T k={b.keyTitle1} />
                  <br />
                  <span className="text-[var(--accent)]">
                    <T k={b.keyTitleAccent} />
                  </span>
                </h3>

                <p className="relative mt-5 text-base text-[var(--text-secondary)] leading-relaxed max-w-md">
                  <T k={b.keyDesc} />
                </p>

                {/* Stat highlight */}
                <div className="relative mt-6 inline-flex items-baseline gap-2 rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] px-4 py-2.5">
                  <span className="text-2xl font-black tabular-nums tracking-tight text-[var(--accent)]">
                    <T k={b.keyStat} />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    <T k={b.keyStatLabel} />
                  </span>
                </div>

                <div className="relative mt-8 flex flex-wrap gap-3">
                  <Link
                    href={b.primaryHref}
                    className="group/cta inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-extrabold text-white shadow-md shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-lg transition-all"
                  >
                    <T k={b.keyPrimary} />
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5"
                      strokeWidth={2.5}
                    />
                  </Link>
                  {b.keySecondary && (
                    <Link
                      href={b.secondaryHref}
                      className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-transparent px-6 py-3 text-sm font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      <T k={b.keySecondary} />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Planes snapshot — fuente única plan-tiers.ts ──
// Brandon mayo 2026: antes la home tenía 3 planes hardcoded distintos a
// los de /abrir-tienda. Ahora ambos leen de PLANS y los 4 planes
// coinciden: Estándar (S/39 con primer mes gratis), Pro (S/99), Enterprise
// (S/159), Max (S/199).
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
// Ahora un strip horizontal sobrio con colores oficiales (Yape morado #722EAB,
// Plin azul #00BFB3) — más rápido de procesar, ocupa menos espacio vertical.
function PaymentMethods() {
  return (
    <section
      aria-label="Formas de pago"
      className="py-12 sm:py-16 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]"
    >
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-6">
          <T k="landing.payment.kicker" fallback="Tus clientes pagan como ya saben pagar" />
        </p>
        <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4">
          {/* Yape — morado oficial #722EAB */}
          <span
            className="inline-flex items-center gap-2.5 rounded-full bg-white dark:bg-[var(--surface-raised)] border border-[var(--rule-base)] px-5 py-3 shadow-sm"
          >
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white font-black text-[length:var(--ts-2xs)]"
              style={{ background: "#722EAB" }}
            >
              Y
            </span>
            <span className="text-base font-extrabold text-[var(--text-primary)]">Yape</span>
          </span>
          {/* Plin — turquesa oficial #00BFB3 */}
          <span
            className="inline-flex items-center gap-2.5 rounded-full bg-white dark:bg-[var(--surface-raised)] border border-[var(--rule-base)] px-5 py-3 shadow-sm"
          >
            <span
              aria-hidden
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white font-black text-[length:var(--ts-2xs)]"
              style={{ background: "#00BFB3" }}
            >
              P
            </span>
            <span className="text-base font-extrabold text-[var(--text-primary)]">Plin</span>
          </span>
          {/* Efectivo */}
          <span className="inline-flex items-center gap-2.5 rounded-full bg-white dark:bg-[var(--surface-raised)] border border-[var(--rule-base)] px-5 py-3 shadow-sm">
            <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--data-success-50)] text-[var(--data-success-600)]">
              <Banknote className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="text-base font-extrabold text-[var(--text-primary)]">Efectivo</span>
          </span>
          {/* Tarjeta */}
          <span className="inline-flex items-center gap-2.5 rounded-full bg-white dark:bg-[var(--surface-raised)] border border-[var(--rule-base)] px-5 py-3 shadow-sm">
            <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
              <CreditCard className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <span className="text-base font-extrabold text-[var(--text-primary)]">Tarjeta</span>
          </span>
        </div>
        <p className="mt-6 text-center text-sm text-[var(--text-tertiary)]">
          Sin comisiones para ti · Cobras como ya cobras
        </p>
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
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-10 py-5 text-lg font-extrabold shadow-lg shadow-[var(--accent)]/30 hover:gap-3 hover:shadow-xl transition-all"
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
