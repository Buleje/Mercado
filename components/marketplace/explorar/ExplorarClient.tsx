"use client";

/**
 * ExplorarClient — Hub de navegación B2C del marketplace.
 *
 * NO es para comprar directamente — es el menú visual del sitio.
 * Diseño comercial: gradientes, illustrations, copy cálido, CTAs grandes.
 *
 * Estructura B2C v3:
 *   1. Hero search
 *   2. SectionPortals (bento de 8 destinos)
 *   3. TrustStrip (4 stats con personalidad)
 *   4. Preview "Bodegas en tendencia" con CTA grande
 *   5. HowItWorks (3 pasos con conectores)
 *   6. Preview "Ofertas del día" con CTA grande
 *   7. Testimonials (3 reseñas wall of love)
 *   8. Preview "Categorías"
 *   9. FinalCTA bodegueros (mejorado con stats inline)
 */

import Link from "next/link";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import {
  ArrowUpRight,
  Store,
  Sparkles,
  Zap,
  ShieldCheck,
} from "@buleje/design-system/icons";

import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import ExplorarHeroSearch from "./ExplorarHeroSearch";
import ExplorarErrorBoundary from "./ExplorarErrorBoundary";
import ExplorarTracker from "./ExplorarTracker";
import ExplorarSectionPortals from "./ExplorarSectionPortals";
import ExplorarTrustStrip from "./ExplorarTrustStrip";
import ExplorarHowItWorks from "./ExplorarHowItWorks";
import ExplorarTestimonials from "./ExplorarTestimonials";

// Below-fold lazy
const WelcomeStrip = dynamic(() => import("@/components/marketplace/home/WelcomeStrip"), {
  ssr: false,
});
const ExplorarBackToTop = dynamic(() => import("./ExplorarBackToTop"), { ssr: false });
const ExplorarCategoriasGrid = dynamic(() => import("./ExplorarCategoriasGrid"), { ssr: false });
const BodegasTrendingRow = dynamic(() => import("./BodegasTrendingRow"), { ssr: false });
const DealsOfTheDayStrip = dynamic(() => import("./DealsOfTheDayStrip"), { ssr: false });

/**
 * PreviewSectionBox — preview comercial con header gradient + CTA pill grande.
 */
function PreviewSectionBox({
  eyebrow,
  title,
  subtitle,
  ctaHref,
  ctaLabel,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaHref: string;
  ctaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden shadow-sm">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--rule-soft)] bg-linear-to-r from-[var(--accent)]/5 via-[var(--surface-canvas)] to-[var(--surface-canvas)] px-5 sm:px-6 py-4 sm:py-5">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
            <span className="h-[3px] w-8 rounded-full bg-[var(--accent)]" aria-hidden />
            {eyebrow}
          </p>
          <h3 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-[var(--text-primary)] mt-2 leading-tight">
            {title}
          </h3>
          <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1.5 font-semibold">{subtitle}</p>
        </div>
        <Link
          href={ctaHref}
          className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm sm:text-base font-black uppercase tracking-wider text-white shadow-lg shadow-[var(--accent)]/30 transition-all hover:brightness-110 hover:gap-3 hover:shadow-xl shrink-0"
        >
          {ctaLabel}
          <ArrowUpRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={2.75}
            aria-hidden
          />
        </Link>
      </header>
      <div
        className={[
          "[&_section]:!max-w-none [&_section]:!mx-0 [&_section]:!px-4",
          "sm:[&_section]:!px-5 [&_section]:!py-4 sm:[&_section]:!py-5",
        ].join(" ")}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * FinalCTA — Card oscura con accent emphasis. Sin gradient saturado.
 */
function FinalCTA() {
  return (
    <section className="bg-[var(--surface-canvas)] py-12 sm:py-20 mt-4">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--rule-base)] bg-[var(--text-primary)] p-8 sm:p-12 lg:p-16">
          {/* Single subtle accent glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-[var(--accent)]/15 blur-3xl"
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 lg:gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm px-3.5 py-1.5 text-xs font-black uppercase tracking-[var(--ls-wider)] text-white mb-6">
                <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.75} aria-hidden />
                Para bodegueros · Gratis siempre
              </span>
              <h2 className="font-display text-[clamp(2.25rem,6vw,4.5rem)] font-black tracking-[-0.035em] text-white leading-[0.95]">
                Tu bodega online
                <br />
                <span className="text-[var(--accent)]">en 5 minutos.</span>
              </h2>
              <p className="mt-5 text-lg sm:text-xl text-white/80 max-w-xl leading-snug font-semibold">
                Miles de vecinos están buscando lo que vendés. Subí tus productos y empezá a
                recibir pedidos hoy mismo.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { icon: Zap, text: "Setup 5 min" },
                  { icon: ShieldCheck, text: "Sin tarjeta" },
                  { icon: Store, text: "100% gratis" },
                ].map((b) => (
                  <span
                    key={b.text}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-white border border-white/15"
                  >
                    <b.icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    {b.text}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 shrink-0">
              <Link
                href="/abrir-tienda"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-white px-8 py-4 text-base sm:text-lg font-black uppercase tracking-wider shadow-xl shadow-[var(--accent)]/40 hover:brightness-110 hover:gap-3 transition-all"
              >
                <Store className="h-5 w-5" strokeWidth={2.25} />
                Abrir mi tienda
                <ArrowUpRight
                  className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={2.75}
                  aria-hidden
                />
              </Link>
              <Link
                href="/abrir-tienda#planes"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-8 py-4 text-sm sm:text-base font-black uppercase tracking-wider text-white hover:bg-white/10 transition-colors"
              >
                Ver planes
              </Link>
              <p className="mt-2 text-xs font-black uppercase tracking-wider text-white/70 text-center">
                ✓ 200+ bodegueros ya venden
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ExplorarClient() {
  useEffect(() => {
    document.body.setAttribute("data-marketplace-explorar", "true");
    return () => {
      document.body.removeAttribute("data-marketplace-explorar");
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="marketplace_explorar" />

      {/* Bienvenida personalizada */}
      <WelcomeStrip />

      {/* ══════════════════════════════════════════════════════════════════
          1) HERO ÚNICO — identidad + search + chips + stats + atajos.
          ══════════════════════════════════════════════════════════════════ */}
      <ExplorarErrorBoundary section="hero-search">
        <ExplorarHeroSearch />
      </ExplorarErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════
          2) HUB DE NAVEGACIÓN: 8 portales a cada sección.
          ══════════════════════════════════════════════════════════════════ */}
      <ExplorarErrorBoundary section="section-portals">
        <ExplorarSectionPortals />
      </ExplorarErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════
          2) TRUST STRIP: 4 stats con personalidad.
          ══════════════════════════════════════════════════════════════════ */}
      <ExplorarErrorBoundary section="trust-strip">
        <RevealOnScroll>
          <ExplorarTrustStrip />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════
          3) PREVIEW 1: Bodegas trending.
          ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-[var(--surface-sunken)] py-6 sm:py-10">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-6">
          <ExplorarErrorBoundary section="bodegas-preview">
            <RevealOnScroll>
              <PreviewSectionBox
                eyebrow="Lo que viene volando"
                title="Las bodegas más buscadas"
                subtitle="Vecinos como vos las están eligiendo esta semana"
                ctaHref="/marketplace"
                ctaLabel="Ver todas las bodegas"
              >
                <BodegasTrendingRow />
              </PreviewSectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          4) CÓMO FUNCIONA: 3 pasos con conector.
          ══════════════════════════════════════════════════════════════════ */}
      <ExplorarErrorBoundary section="how-it-works">
        <RevealOnScroll>
          <ExplorarHowItWorks />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════
          5) PREVIEW 2: Ofertas + Categorías.
          ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-[var(--surface-sunken)] py-6 sm:py-10">
        <div className="mx-auto max-w-[1600px] space-y-4 sm:space-y-5 px-3 sm:px-4 lg:px-6">
          <ExplorarErrorBoundary section="ofertas-preview">
            <RevealOnScroll>
              <PreviewSectionBox
                eyebrow="Solo por hoy"
                title="Ofertas que duran horas"
                subtitle="Si lo viste y te gustó, apuralo — los precios vuelan"
                ctaHref="/marketplace/ofertas"
                ctaLabel="Ver todas las ofertas"
              >
                <DealsOfTheDayStrip />
              </PreviewSectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="categorias-preview">
            <RevealOnScroll>
              <PreviewSectionBox
                eyebrow="Tu mercado completo"
                title="Filtrá por lo que buscás"
                subtitle="Desde una gaseosa hasta el almuerzo del domingo"
                ctaHref="/tiendas"
                ctaLabel="Explorar catálogo"
              >
                <ExplorarCategoriasGrid />
              </PreviewSectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          6) TESTIMONIOS: 3 reseñas wall of love.
          ══════════════════════════════════════════════════════════════════ */}
      <ExplorarErrorBoundary section="testimonials">
        <RevealOnScroll>
          <ExplorarTestimonials />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      {/* ══════════════════════════════════════════════════════════════════
          7) CTA FINAL: bodegueros — gradient accent full bleed.
          ══════════════════════════════════════════════════════════════════ */}
      <ExplorarErrorBoundary section="final-cta">
        <RevealOnScroll>
          <FinalCTA />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      <ExplorarBackToTop />
    </div>
  );
}
