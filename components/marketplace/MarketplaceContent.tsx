"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useNavVisibility } from "@/hooks/use-nav-visibility";
import { useSearchParams } from "next/navigation";
import { Store, ArrowUpRight } from "@buleje/design-system/icons";
import Link from "next/link";
import { m } from "framer-motion";
import { deserializeCart } from "@/lib/marketplace/cart-sharing";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import PromoBannerCarousel from "@/components/marketplace/PromoBannerCarousel";
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";
import MyFidelidadCard from "@/components/marketplace/MyFidelidadCard";
// SEO/SSR (2026-05-24): estas 2 secciones de mayor valor comercial se importan
// ESTÁTICAMENTE (no dynamic ssr:false) y reciben datos del servidor por props,
// para que su contenido (tiendas, productos, precios) salga en el HTML inicial
// y Google lo indexe. El resto sigue diferido client-side.
import TiendasDestacadas from "@/components/marketplace/home/TiendasDestacadas";
import MarketplaceBestsellersStrip from "@/components/marketplace/home/MarketplaceBestsellersStrip";

// Audit P10 (sprint perf): below-fold sections diferidas para reducir
// el initial bundle (138 → ~60 chunks meta). Cada `dynamic({ ssr: false })`
// se descarga solo cuando React monta el componente — el usuario las ve
// tras el hero, después del paint inicial.
const MarketplaceCatalogViewSection = dynamic(
  () => import("@/components/marketplace/MarketplaceCatalogViewSection"),
  { ssr: false },
);
const MarketplaceRecipesWidget = dynamic(
  () => import("@/components/marketplace/MarketplaceRecipesWidget"),
  { ssr: false },
);
const MarketplaceRecentViewed = dynamic(
  () => import("@/components/marketplace/MarketplaceRecentViewed"),
  { ssr: false },
);
const SubscribeAndSaveSection = dynamic(
  () => import("@/components/marketplace/SubscribeAndSaveSection"),
  { ssr: false },
);
const GiftCardsBanner = dynamic(
  () => import("@/components/marketplace/gift-cards/GiftCardsBanner"),
  { ssr: false },
);
const MarketplaceWelcomeCoupon = dynamic(
  () => import("@/components/marketplace/MarketplaceWelcomeCoupon"),
  { ssr: false },
);

// Home narrative modules — todos below-fold
const OfertasDelDiaHero = dynamic(
  () => import("@/components/marketplace/home/OfertasDelDiaHero"),
  { ssr: false },
);
const OfertasFlashSection = dynamic(
  () => import("@/components/marketplace/home/OfertasFlashSection"),
  { ssr: false },
);
const ComparedProductsSection = dynamic(
  () => import("@/components/marketplace/home/ComparedProductsSection"),
  { ssr: false },
);
const AsistenteHomeBanner = dynamic(
  () => import("@/components/marketplace/home/AsistenteHomeBanner"),
  { ssr: false },
);
const LiveOrderCounter = dynamic(
  () => import("@/components/marketplace/LiveOrderCounter"),
  { ssr: false },
);

// MarketplaceBestsellersStrip ahora se importa estáticamente arriba (SSR + SEO).

// REMOVIDOS (Brandon, mayo 2026 — pedido: solo data real, nada hardcodeado):
//   - MarketplaceCategoriesNav  → tenia const CATEGORIES hardcodeado
//   - MarketplaceBrandsStrip    → tenia const BRANDS hardcodeado
//   - MarketplacePriceRangesStrip → tenia const RANGES hardcodeado
//   - MarketplaceStories        → tenia const STORIES + STORY_PRESENTATIONS hardcoded
//   - LiveActivityFeed          → eventos de actividad inventados
//   - MarketplaceJungleProducts → FALLBACK_ITEMS hardcoded ante DB vacia
//   - TrendingTodayWidget       → mezclaba real + mock
//   - AhorraMasMegaSection      → secciones secundarias hardcodeadas
//   - VenderMiniCTA             → CTA editorial duplicado del CTA bottom

// Removidos (ronda A) — ahora en /tiendas o ronda B nav secundaria:
// import MarketplaceFilters, { type MarketplaceFiltersState } from "@/components/marketplace/MarketplaceFilters";
// import MarketplaceStoresView, { CATEGORIES, ZONES } from "@/components/marketplace/MarketplaceStoresView";
// import QuickFilterChips, { type QuickChipId } from "@/components/marketplace/QuickFilterChips";
// import { getStoreCategoryIcon } from "@/components/marketplace/_category-icons";
// import { cn } from "@/lib/utils";

/* ── Constants ─────────────────────────────────────────────────────────────── */

// MAX_PRICE_LIMIT reservado para ronda B (product filter bar)
 
const _MAX_PRICE_LIMIT = 500;

/* ── Props ──────────────────────────────────────────────────────────────────── */

// SEO/SSR: page.tsx (server) pre-fetcha tiendas destacadas + más vendidos y los
// pasa por props para que esas 2 secciones rendericen su contenido en el HTML
// inicial (crawlable por Google). Los tipos se derivan de cada componente.
interface MarketplaceContentProps {
  initialStores?: NonNullable<React.ComponentProps<typeof TiendasDestacadas>>["initialStores"];
  initialBestsellers?: NonNullable<React.ComponentProps<typeof MarketplaceBestsellersStrip>>["initialItems"];
}

/* ── MarketplaceContent (orchestrator) ─────────────────────────────────────── */

export default function MarketplaceContent({
  initialStores,
  initialBestsellers,
}: MarketplaceContentProps = {}) {
  const searchParams = useSearchParams();
  const { addItem } = useMarketplaceCart();
  const cartImportDone = useRef(false);
  const [sharedCartToast, setSharedCartToast] = useState<string | null>(null);
  const search = searchParams.get("buscar") ?? "";
  // Visibilidad de secciones del home — controlada desde superadmin/stores → Navegación
  const sectionVisibility = useNavVisibility("marketplace-sections");
  const isVisible = (id: string) => sectionVisibility[id] !== false;

  // ── Import shared cart from ?cart= param ──
  useEffect(() => {
    if (cartImportDone.current) return;
    const token = searchParams.get("cart");
    if (!token) return;

    cartImportDone.current = true;

    const items = deserializeCart(token);
    if (items.length === 0) return;

    for (const shared of items) {
      addItem({
        storeId: shared.s,
        storeName: shared.s,
        storeSlug: shared.s,
        storeProductId: `${shared.s}-${shared.p}`,
        productId: shared.p,
        name: `Producto #${shared.p}`,
        price: 0,
        quantity: shared.q,
        image: null,
        unit: null,
      });
    }

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("cart");
      window.history.replaceState({}, "", url.toString());

      setSharedCartToast(`Carrito importado: ${items.length} ${items.length === 1 ? "producto" : "productos"}`);
      setTimeout(() => setSharedCartToast(null), 4000);
    } catch { /* SSR guard */ }
  }, [searchParams, addItem]);

  return (
    <FlyToCartProvider>
    <div className="relative">
      {/* Toast: carrito compartido importado */}
      {sharedCartToast && (
        <m.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-4 z-[9999] -translate-x-1/2 rounded-xl bg-[var(--data-success-600)] px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-md/20"
        >
          {sharedCartToast}
        </m.div>
      )}

      {/* FreeShippingBar eliminada del home — ahora vive en MarketplaceSecondaryNav
          como indicador compacto (evita que tape la barra de categorias). */}

      {/* ── Hero eliminado (2026-04-20) — ya tenemos el banner rotativo abajo.
            WelcomeStrip, BentoHero (Express/Selva/Pagar/Bienvenida),
            CategoriasQuickAccess y OfertasEditorial MOVIDOS a /explorar
            para armar el layout tipo Mercado Libre pedido. */}

      {/* Banner promocional rotativo (slot="bodegas" editable desde superadmin) */}
      <PromoBannerCarousel slot="bodegas" />

      {/* Panel de fidelidad — solo visible para clientes con sesión. */}
      <div className="mx-auto max-w-[1760px] px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4">
        <div className="w-full lg:max-w-sm">
          <MyFidelidadCard />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECCIONES — TODAS PEGAN A DATA REAL DEL PROYECTO.
          Si la DB esta vacia (sin productos / sin ofertas / sin recetas),
          la seccion se oculta sola (cada componente hace early-return null).
          NO hay categorias/marcas/productos inventados.
          ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-[var(--surface-sunken)] py-4 sm:py-6">
        <div className="mx-auto max-w-[1760px] space-y-4 sm:space-y-6 px-3 sm:px-4 lg:px-6">
          {/* ── Above-fold (montaje inmediato) ── */}
          {/* Tiendas reales publicadas — SSR con data del servidor (SEO) */}
          <BodegasSectionBox><TiendasDestacadas initialStores={initialStores} /></BodegasSectionBox>

          {/* Top mas vendidos — SSR con data del servidor (SEO) */}
          <BodegasSectionBox><MarketplaceBestsellersStrip initialItems={initialBestsellers} /></BodegasSectionBox>

          {/* ── Below-fold (montaje diferido al acercar el scroll) ── */}
          {/* Ofertas del dia — desde Promotion DB */}
          <BodegasSectionBox defer><OfertasDelDiaHero /></BodegasSectionBox>

          {/* Ofertas flash — desde Promotion con tiempo limitado */}
          <BodegasSectionBox defer><OfertasFlashSection /></BodegasSectionBox>

          {/* Catalogo cross-store — productos reales */}
          <BodegasSectionBox defer>
            <MarketplaceCatalogViewSection searchQuery={search || undefined} />
          </BodegasSectionBox>

          {/* Recetas publicas con ingredientes resueltos cross-marketplace */}
          <BodegasSectionBox defer><MarketplaceRecipesWidget /></BodegasSectionBox>

          {/* Productos comparados — desde localStorage del cliente */}
          {isVisible("comparar-productos") && (
            <BodegasSectionBox defer><ComparedProductsSection /></BodegasSectionBox>
          )}

          {/* Suscripcion Bodega al Mes — feature real */}
          {isVisible("bodega-al-mes") && (
            <BodegasSectionBox defer><SubscribeAndSaveSection /></BodegasSectionBox>
          )}

          {/* Gift cards — feature real */}
          {isVisible("gift-cards") && (
            <BodegasSectionBox defer><GiftCardsBanner /></BodegasSectionBox>
          )}

          {/* Asistente IA — feature real */}
          {isVisible("asistente-ia") && (
            <BodegasSectionBox defer><AsistenteHomeBanner /></BodegasSectionBox>
          )}

          {/* Vistos recientemente — desde localStorage del cliente */}
          <BodegasSectionBox defer><MarketplaceRecentViewed /></BodegasSectionBox>
        </div>
      </div>

      {/* CTA hacia /marketplace/explorar — solo si querés ver todo */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <Link
          href="/marketplace/explorar"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          Explorar todo el catalogo
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
        </Link>
      </section>

      {/* MK-62: live counter de pedidos como social proof city-level */}
      <div className="border-t border-[var(--rule-soft)]">
        <LiveOrderCounter variant="footer" />
      </div>

      {/* ── CTA editorial: Register Your Store ─────────────────────────── */}
      <section className="relative overflow-hidden py-24 sm:py-32 bg-[var(--surface-sunken)] border-t border-[var(--rule-soft)]">
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
            Para bodegueros
          </p>
          <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-extrabold tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
            ¿Tienes una tienda?{" "}
            <br />
            <span className="italic font-serif text-[var(--accent)]">
              Súmate al marketplace.
            </span>
          </h2>
          <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
            Publica tus productos, recibe pedidos automáticamente y llegá a
            miles de clientes. Sin costo de inscripción.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Link
              href="/abrir-tienda"
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg hover:bg-[var(--accent)] hover:gap-3 transition-all"
            >
              <Store className="h-4 w-4" strokeWidth={1.75} />
              Registra tu tienda gratis
              <ArrowUpRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2.25}
              />
            </Link>
            <Link
              href="/abrir-tienda#planes"
              className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--rule-base)] px-8 py-4 text-base font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            >
              Ver planes
            </Link>
          </div>
        </div>
      </section>

      {/* Footer vive en app/marketplace/layout.tsx (persistente). */}

      {/* MiniCart floating eliminado (2026-04-20) — redundante con el
          CartBadge del navbar que ya muestra total + contador. */}
      <MarketplaceWelcomeCoupon />
    </div>
    </FlyToCartProvider>
  );
}

// MarketplaceEditorialHero eliminado (2026-04-20) — el banner rotativo
// de arriba ya cumple el rol de "sobre qué trata esta página".

/**
 * BodegasSectionBox — wrapper compartido para que cada strip del home de
 * bodegas se vea como una tarjeta (igual que Mercado Libre): borde, bg
 * raised sobre wrapper sunken (contraste). Anula el padding/max-width
 * interno de cada strip para evitar doble padding.
 *
 * Visual QA P2 fix 2026-04-30: envuelto en RevealOnScroll para que cada
 * strip aparezca con fade+slide al entrar en viewport (sensación premium,
 * ~700ms ease-out, respeta prefers-reduced-motion).
 */
function BodegasSectionBox({
  children,
  defer = false,
}: {
  children: React.ReactNode;
  /** Difiere el montaje hasta acercarse al viewport (perf below-fold). */
  defer?: boolean;
}) {
  return (
    <RevealOnScroll
      defer={defer}
      // Pre-monta ~500px antes de entrar (el fetch arranca antes de verse).
      rootMargin={defer ? "500px 0px 500px 0px" : undefined}
      // Reserva alto mientras no montó → sin layout shift al aparecer.
      minHeightClass={defer ? "min-h-[260px]" : undefined}
    >
      <div
        className={[
          "overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
          "[&_section]:!max-w-none [&_section]:!mx-0 [&_section]:!px-4",
          "sm:[&_section]:!px-6 [&_section]:!py-5 sm:[&_section]:!py-6",
        ].join(" ")}
      >
        {children}
      </div>
    </RevealOnScroll>
  );
}
