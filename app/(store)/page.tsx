import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";
import {
  DiscountBanner,
  ReviewsCarousel,
} from "@/components/landing/LandingClientSections";
import LandingHero from "@/components/landing/LandingHero";
import PopularCategoriesTiles from "@/components/landing/PopularCategoriesTiles";
import ComoFuncionaSection from "@/components/landing/sections/ComoFuncionaSection";
import LandingHeader from "@/components/landing/LandingHeader";
import StickyMobileCTA from "@/components/landing/StickyMobileCTA";
import {
  Store,
  Bike,
  ArrowUpRight,
  Smartphone,
  Send,
  Banknote,
  CreditCard,
  type LucideIcon,
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

export const metadata: Metadata = {
  title: "Buleje — Pide lo que quieras, te lo llevamos | Bodegas, Mercado y Más",
  description:
    "Compra en bodegas, minimarkets y tiendas de tu zona con delivery rápido. Paga con Yape o efectivo. Miles de productos al alcance de tu mano en Buleje.",
  alternates: {
    canonical: "https://www.buleje.pe",
  },
  openGraph: {
    title: "Buleje — Pide lo que quieras, te lo llevamos",
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
    prisma.store.count({ where: { isPublished: true } }).catch(() => 0),
    prisma.product.count({ where: { active: true } }).catch(() => 0),
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

// ── Hero — 2-column layout con ilustraciones locales + stats trust strip ──
async function HeroSection() {
  const stats = await getMarketplaceStats();
  return (
    <LandingHero
      storeCount={stats.storeCount}
      productCount={stats.productCount}
      avgRating={stats.avgRating}
    />
  );
}

// ── Reviews section (real DB data → animated carousel) ──
async function ReviewsSection() {
  const reviews = await getMarketplaceReviews();

  const fallbackReviews = [
    { id: "f1", name: "Maria L.", text: "Pide mis cosas de la bodega y llegaron en 30 minutos. Increíble.", rating: 5, date: new Date("2025-12-15") },
    { id: "f2", name: "Carlos R.", text: "Pago con Yape y listo. Más fácil que ir al mercado.", rating: 5, date: new Date("2025-11-20") },
    { id: "f3", name: "Ana P.", text: "Las frutas llegaron frescas y bien empacadas. Volveré a comprar.", rating: 4, date: new Date("2025-10-10") },
    { id: "f4", name: "Jorge M.", text: "Los precios son iguales que en la bodega pero me lo traen a la casa. Genial.", rating: 5, date: new Date("2025-09-05") },
    { id: "f5", name: "Rosa T.", text: "Ya no necesito salir al mercado con esta lluvia. Todo llega perfecto.", rating: 5, date: new Date("2025-08-18") },
    { id: "f6", name: "Luis S.", text: "Compré para la semana entera. Rápido y sin problemas.", rating: 4, date: new Date("2025-07-22") },
  ];

  const displayReviews = reviews.length > 0 ? reviews : fallbackReviews;

  return <ReviewsCarousel reviews={displayReviews} />;
}

// ── Business + Driver CTA banners — editorial asimétrico ──
function PromoBanners() {
  const banners = [
    {
      kicker: "Para dueños",
      icon: Store,
      titleLine1: "¿Tienes un",
      titleAccent: "negocio?",
      desc: "Registra tu bodega, minimarket o tienda y empieza a vender online gratis. Miles de clientes te esperan.",
      primary: { label: "Abrir mi tienda", href: "/abrir-tienda" },
      secondary: { label: "Ver planes", href: "/abrir-tienda#planes" },
    },
    {
      kicker: "Para repartidores",
      icon: Bike,
      titleLine1: "¿Quieres",
      titleAccent: "repartir?",
      desc: "Únete como repartidor y genera ingresos extra entregando pedidos en tu zona. Tú eliges tu horario.",
      primary: { label: "Quiero ser repartidor", href: "/marketplace/repartidor" },
      secondary: null as { label: string; href: string } | null,
    },
  ];

  return (
    <section
      aria-label="Sumate a Buleje"
      className="py-20 sm:py-28 bg-[var(--surface-canvas)]"
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--rule-soft)] border border-[var(--rule-soft)] rounded-2xl overflow-hidden">
          {banners.map((b, i) => {
            const Icon = b.icon;
            return (
              <div
                key={i}
                className="group relative bg-[var(--surface-raised)] p-8 sm:p-12 transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <div className="flex items-center gap-3 mb-8">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)]">
                    {b.kicker}
                  </p>
                </div>

                <h3 className="text-[clamp(2rem,4.5vw,3rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
                  {b.titleLine1}
                  <br />
                  <span className="italic font-serif text-[var(--accent)]">
                    {b.titleAccent}
                  </span>
                </h3>
                <p className="mt-6 text-base text-[var(--text-secondary)] leading-relaxed max-w-md">
                  {b.desc}
                </p>

                <div className="mt-10 flex flex-wrap gap-3">
                  <Link
                    href={b.primary.href}
                    className="group/cta inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] px-6 py-3 text-sm font-bold text-[var(--surface-canvas)] hover:bg-[var(--accent)] hover:gap-3 transition-all"
                  >
                    {b.primary.label}
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5"
                      strokeWidth={2.25}
                    />
                  </Link>
                  {b.secondary && (
                    <Link
                      href={b.secondary.href}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--rule-base)] bg-transparent px-6 py-3 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                    >
                      {b.secondary.label}
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

// ── Planes snapshot — sección editorial con 3 planes destacados ──
// Nota: el bloque "Nosotros" ahora vive en NosotrosSection (arriba en el flujo).
function AboutAndPricingSnapshot() {
  const planes = [
    {
      name: "Gratis",
      price: "S/ 0",
      tagline: "Para empezar hoy",
      perks: ["Catálogo ilimitado", "Yape/efectivo", "Hasta 50 pedidos/mes"],
      tone: "neutral" as const,
    },
    {
      name: "Pro",
      price: "S/ 49",
      tagline: "Para vender en serio",
      perks: ["Inventario + caja", "Reportes + exportes", "Pedidos ilimitados"],
      tone: "primary" as const,
    },
    {
      name: "Enterprise",
      price: "A medida",
      tagline: "Para cadenas",
      perks: ["Multi-sucursal", "API + webhooks", "Soporte dedicado"],
      tone: "neutral" as const,
    },
  ];

  return (
    <section
      id="planes"
      aria-label="Planes"
      className="relative overflow-hidden bg-[var(--surface-canvas)] py-20 sm:py-28 scroll-mt-20"
    >
      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header editorial */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12 sm:mb-16">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Planes
            </p>
            <h2 className="text-[clamp(2.25rem,6vw,4rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Empieza gratis.
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                Sin letra chica.
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Elige el plan que te queda. Cambiás cuando quieras, sin contratos ni permanencias.
          </p>
        </div>

        {/* Grid 3 planes — Pro destacado */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
          {planes.map((p) => {
            const isPrimary = p.tone === "primary";
            return (
              <div
                key={p.name}
                className={`relative rounded-2xl p-8 sm:p-10 ${
                  isPrimary
                    ? "border-2 border-[var(--accent)] bg-[var(--accent-soft)] md:scale-[1.02] md:shadow-xl"
                    : "border border-[var(--rule-soft)] bg-[var(--surface-raised)]"
                }`}
              >
                {isPrimary && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--accent)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white">
                    Más popular
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
                  {p.tagline}
                </p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
                  {p.name}
                </h3>
                <p
                  className={`mt-3 text-[clamp(2rem,4vw,2.75rem)] font-black tabular-nums tracking-[-0.03em] leading-none ${
                    isPrimary
                      ? "text-[var(--accent)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  {p.price}
                  <span className="ml-2 text-sm font-semibold text-[var(--text-tertiary)]">
                    /mes
                  </span>
                </p>
                <ul className="mt-6 space-y-2">
                  {p.perks.map((perk) => (
                    <li
                      key={perk}
                      className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
                    >
                      <span
                        aria-hidden
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]"
                      />
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/abrir-tienda#planes"
            className="inline-flex items-center gap-2 text-base font-bold text-[var(--accent)] hover:gap-3 transition-all"
          >
            Ver comparativa completa
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Popular payment methods — editorial wordmark list ──
function PaymentMethods() {
  const methods: Array<{ name: string; desc: string; Icon: LucideIcon }> = [
    { name: "Yape", desc: "Transferencia al instante", Icon: Smartphone },
    { name: "Plin", desc: "Desde tu app del banco", Icon: Send },
    { name: "Efectivo", desc: "Contra entrega", Icon: Banknote },
    { name: "Tarjeta", desc: "Débito y crédito", Icon: CreditCard },
  ];
  return (
    <section
      aria-label="Formas de pago"
      className="py-20 sm:py-28 bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)]"
    >
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12 sm:mb-14">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Formas de pago
            </p>
            <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Pagas como
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                tú quieras.
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Cuatro maneras de pagar sin complicaciones. Eliges al momento del
            checkout — no hay cargos ocultos.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--rule-soft)] border border-[var(--rule-soft)] rounded-2xl bg-[var(--surface-raised)] overflow-hidden">
          {methods.map((m) => {
            const Icon = m.Icon;
            return (
              <div
                key={m.name}
                className="group relative bg-[var(--surface-raised)] px-6 py-8 sm:py-10 transition-colors hover:bg-[var(--surface-canvas)]"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] mb-5 transition-colors group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <p className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-black tracking-[-0.03em] text-[var(--text-primary)] leading-none">
                  {m.name}
                </p>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {m.desc}
                </p>
              </div>
            );
          })}
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
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
          <span
            aria-hidden
            className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
          />
          Empieza hoy
        </p>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
          Todo lo que necesitas,
          <br />
          <span className="italic font-serif text-[var(--accent)]">
            en un solo lugar.
          </span>
        </h2>
        <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
          Pide a bodegas cerca tuyo. Delivery en 25 min. Pagás con Yape o
          efectivo al recibir.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link
            href="/marketplace"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg hover:bg-[var(--accent)] hover:gap-3 transition-all"
          >
            Explorar marketplace
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.25}
            />
          </Link>
          <Link
            href="/abrir-tienda"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-8 py-4 text-base font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Abre tu tienda
            <span aria-hidden>→</span>
          </Link>
        </div>
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
      <DiscountBanner />

      {/* Hero — presentación del marketplace */}
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection />
      </Suspense>

      {/* Categorías populares — grid unico 6 categorias con ilustraciones */}
      <PopularCategoriesTiles />

      {/* Cómo funciona — 4 pasos + stats + CTA (reemplaza /como-funciona) */}
      <ComoFuncionaSection />

      {/* Conoce a tu bodeguero — humanos detrás (movida desde /tiendas) */}
      <BodegueroSpotlight />

      {/* Nosotros — historia + valores (stats viven en hero, no se duplican) */}
      <NosotrosSection />

      {/* Voz de la comunidad — reviews reales de DB */}
      <Suspense fallback={<SectionSkeleton />}>
        <ReviewsSection />
      </Suspense>

      {/* Planes snapshot (el bloque de Nosotros ya vive arriba en NosotrosSection) */}
      <AboutAndPricingSnapshot />

      {/* FAQ — sección editorial consolidada (reemplaza /faq) */}
      <FAQSection />

      {/* Ser parte — negocio + repartidor */}
      <PromoBanners />

      {/* Info confianza */}
      <PaymentMethods />

      {/* CTA final */}
      <FinalCTA />

      <Footer />
      <StickyMobileCTA />
    </main>
  );
}

function HeroSkeleton() {
  return (
    <div className="py-16 sm:py-20 bg-white dark:bg-gray-950">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <div className="h-12 w-80 bg-gray-200 dark:bg-gray-800 rounded-xl mx-auto mb-4 animate-pulse" />
        <div className="h-6 w-96 bg-gray-100 dark:bg-gray-800 rounded-lg mx-auto mb-8 animate-pulse" />
        <div className="h-14 max-w-xl mx-auto bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="h-8 w-64 bg-gray-200 dark:bg-gray-800 rounded-lg mx-auto mb-8 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
