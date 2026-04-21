"use client";

/**
 * ExplorarClient — Orchestrator de la pagina /marketplace/explorar.
 *
 * Stack canonico (top → bottom) — Sprint 1-5 completos:
 *   1.  PromoBannerCarousel (banner top rotativo)
 *   2.  ExplorarHeroSearch (search XL + chips + trust)
 *   3.  DealsOfTheDayStrip (countdown global + carrusel)
 *   4.  RecentlyViewedStrip (lee localStorage — solo si hay items)
 *   5.  ExplorarAmazonBoxes (6 cajas tematicas)
 *   6.  BuyAgainStrip (lee phone cookie — solo customer logueado)
 *   7.  EditorialFeature (receta destacada + ingredientes)
 *   8.  TopRatedBento (bento 1+3 productos top calificados)
 *   9.  NeighborsBoughtStrip (recommendations o top-today fallback)
 *  10.  BodegasTrendingRow (3 cards bodegas trending)
 *  11.  ExplorarRelacionados (2 carruseles relacionados/considerar)
 *  12.  ExplorarCategoriasGrid (grid completo todas las categorias)
 *  13.  NewArrivalsRow (carrusel productos nuevos)
 *  14.  FinalCTA (segmentado vendor)
 *
 * Cada seccion va envuelta en ExplorarErrorBoundary para que un fallo
 * de fetch o render no rompa el resto. RevealOnScroll agrega fade-in
 * al entrar en viewport (excepto secciones above-the-fold).
 *
 * BackToTop FAB aparece despues de 800px scroll.
 */

import Link from "next/link";
import { useEffect } from "react";
import { ArrowUpRight, Store } from "@buleje/design-system/icons";
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import WelcomeStrip from "@/components/marketplace/home/WelcomeStrip";
import ExplorarTileGrid, { FillBanner } from "./ExplorarTileGrid";
import ExplorarErrorBoundary from "./ExplorarErrorBoundary";
import ExplorarBackToTop from "./ExplorarBackToTop";
import ExplorarTracker from "./ExplorarTracker";
import ExplorarAmazonBoxes from "./ExplorarAmazonBoxes";
import ExplorarRelacionados from "./ExplorarRelacionados";
import ExplorarCategoriasGrid from "./ExplorarCategoriasGrid";
import RecentlyViewedStrip from "./RecentlyViewedStrip";
import BuyAgainStrip from "./BuyAgainStrip";
import NeighborsBoughtStrip from "./NeighborsBoughtStrip";
import DealsOfTheDayStrip from "./DealsOfTheDayStrip";
import TopRatedBento from "./TopRatedBento";
import NewArrivalsRow from "./NewArrivalsRow";
import BodegasTrendingRow from "./BodegasTrendingRow";
import EditorialFeature from "./EditorialFeature";

/**
 * SectionBox — wrapper que envuelve cada strip de explorar en una caja
 * con borde + bg + rounded, estilo Mercado Libre. El strip mantiene su
 * propio header interno (titulo + link "ver todos").
 *
 * Los strips internos usan `max-w-[1600px] mx-auto px-*` propio; se anula
 * con `[&_section]:!px-0 [&_section]:!max-w-none [&_section]:!mx-0`
 * para que el padding venga de la caja (no doble).
 */
function SectionBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
        "[&_section]:!max-w-none [&_section]:!mx-0 [&_section]:!px-4",
        "sm:[&_section]:!px-5 [&_section]:!py-4 sm:[&_section]:!py-5",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-sunken)] border-t border-[var(--rule-soft)]">
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
          Para bodegueros
        </p>
        <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
          Abrí tu tienda,
          <br />
          <span className="italic font-serif text-[var(--accent)]">
            vendé a todo Pucallpa.
          </span>
        </h2>
        <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
          Miles de vecinos ya están buscando lo que vendés. Poné tu bodega
          online en{" "}
          <span className="text-[var(--text-primary)] font-bold">5 minutos</span>
          , sin código y sin permanencia.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link
            href="/abrir-tienda"
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg hover:bg-[var(--accent)] hover:gap-3 transition-all"
          >
            <Store className="h-4 w-4" strokeWidth={1.75} />
            Abrir mi tienda gratis
            <ArrowUpRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              strokeWidth={2.25}
              aria-hidden="true"
            />
          </Link>
          <Link
            href="/abrir-tienda#planes"
            className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-8 py-4 text-base font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            Ver planes
          </Link>
        </div>
        <p className="mt-6 text-sm text-[var(--text-tertiary)]">
          Sin tarjeta · Sin contrato · Cancelás cuando quieras
        </p>
      </div>
    </section>
  );
}

export default function ExplorarClient() {
  // Body data-attribute para aplicar tipografía mejorada solo en /explorar.
  // Se limpia al desmontar (navegando a otra página).
  useEffect(() => {
    document.body.setAttribute("data-marketplace-explorar", "true");
    return () => {
      document.body.removeAttribute("data-marketplace-explorar");
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="marketplace_explorar" />

      {/* ══════════════════════════════════════════════════════════════════
          TOP EN CAJAS ESTILO MERCADO LIBRE / AMAZON — grid 12 cols con
          banner + bento + categorías + ofertas + banner side empaquetados
          como piezas de un mismo mosaico (ver ExplorarTileGrid).
          ══════════════════════════════════════════════════════════════════ */}

      {/* Bienvenida personalizada (solo clientes logueados, silencioso si no) */}
      <WelcomeStrip />

      {/* Grid tile — banner · 4 bento · categorías · ofertas · banner side */}
      <ExplorarTileGrid />

      {/* ══════════════════════════════════════════════════════════════════
          SECCIONES ENCAPSULADAS EN CAJAS CON BORDE — estilo Mercado Libre.
          Cada strip va dentro de un wrapper con border + bg + padding
          compartido para que se vean como tarjetas apiladas, pegadas.
          ══════════════════════════════════════════════════════════════════ */}

      <div className="bg-[var(--surface-sunken)] py-3 sm:py-4">
        <div className="mx-auto max-w-[1600px] space-y-3 sm:space-y-4 px-3 sm:px-4 lg:px-6">

          <ExplorarErrorBoundary section="deals-of-the-day">
            <SectionBox><DealsOfTheDayStrip /></SectionBox>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="recently-viewed">
            <SectionBox><RecentlyViewedStrip /></SectionBox>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="amazon-boxes">
            <RevealOnScroll>
              <SectionBox><ExplorarAmazonBoxes /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          {/* Banner debajo de "¿Dónde querés empezar?" — admin configurable.
              Usa FillBanner (no PromoBannerCarousel) para llenar la altura
              completa sin recortes. Altura 260-300 px. */}
          <ExplorarErrorBoundary section="promo-below-boxes">
            <RevealOnScroll>
              <div className="h-[260px] sm:h-[300px]">
                <FillBanner slot="explorar-bottom" />
              </div>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="buy-again">
            <RevealOnScroll>
              <SectionBox><BuyAgainStrip /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="editorial-feature">
            <RevealOnScroll>
              <SectionBox><EditorialFeature /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="top-rated-bento">
            <RevealOnScroll>
              <SectionBox><TopRatedBento /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="neighbors-bought">
            <RevealOnScroll>
              <SectionBox><NeighborsBoughtStrip /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="bodegas-trending">
            <RevealOnScroll>
              <SectionBox><BodegasTrendingRow /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="relacionados">
            <RevealOnScroll>
              <SectionBox><ExplorarRelacionados /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="categorias-grid">
            <RevealOnScroll>
              <SectionBox><ExplorarCategoriasGrid /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>

          <ExplorarErrorBoundary section="new-arrivals">
            <RevealOnScroll>
              <SectionBox><NewArrivalsRow /></SectionBox>
            </RevealOnScroll>
          </ExplorarErrorBoundary>
        </div>
      </div>

      <ExplorarErrorBoundary section="final-cta">
        <RevealOnScroll>
          <FinalCTA />
        </RevealOnScroll>
      </ExplorarErrorBoundary>

      {/* Footer vive en app/marketplace/layout.tsx (persistente). */}

      <ExplorarBackToTop />
    </div>
  );
}
