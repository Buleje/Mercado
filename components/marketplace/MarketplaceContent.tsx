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
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";
import MyFidelidadCard from "@/components/marketplace/MyFidelidadCard";
import MarketplaceQuickReorder from "@/components/marketplace/MarketplaceQuickReorder";
import SaludoHorario from "@/components/marketplace/home/SaludoHorario";
import { CatalogFilterProvider, useCatalogFilter } from "@/components/marketplace/catalog-filter-context";
import MarketplaceLeftRail from "@/components/marketplace/MarketplaceLeftRail";
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
// Rail DERECHO (publicidad) — client-only, fetch de banners. Below-fold-ish.
const MarketplaceRightRail = dynamic(
  () => import("@/components/marketplace/MarketplaceRightRail"),
  { ssr: false },
);
// Widget "Tienda de la semana" (votación) — zona del saludo. Client-only.
const TiendaSemanaWidget = dynamic(
  () => import("@/components/marketplace/TiendaSemanaWidget"),
  { ssr: false },
);
// Descubrimiento + conversión (alto impacto, código existente cableado al feed):
//   · PersonalizedRecommendations → "Para ti" IA (gated en historial del customer)
// NearbyStoresFeedSection ("Cerca de ti" GPS) REMOVIDO por pedido de Brandon
// (2026-06-05), junto con TiendasDestacadas.
const PersonalizedRecommendations = dynamic(
  () => import("@/components/marketplace/PersonalizedRecommendations"),
  { ssr: false },
);
// Ronda "adictivo + navegable" (2026-06-05): engagement loops + navegación.
//   · CelebrationLayer          → confetti global en acciones reales
//   · RachaDiariaWidget         → racha de visitas (hábito) + cupón al hito
//   · MarketplaceSectionNav     → scrollspy sticky de secciones
//   · MarketplaceCommandLauncher→ buscador universal ⌘K (tiendas/cat/secciones)
const CelebrationLayer = dynamic(
  () => import("@/components/marketplace/CelebrationLayer"),
  { ssr: false },
);
const RachaDiariaWidget = dynamic(
  () => import("@/components/marketplace/RachaDiariaWidget"),
  { ssr: false },
);
const MarketplaceSectionNav = dynamic(
  () => import("@/components/marketplace/MarketplaceSectionNav"),
  { ssr: false },
);
const MarketplaceCommandLauncher = dynamic(
  () => import("@/components/marketplace/MarketplaceCommandLauncher"),
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
      {/* Capa global de confetti — escucha buleje:celebrate (acciones reales) */}
      <CelebrationLayer />
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

      {/* ══════════════════════════════════════════════════════════════════
          LAYOUT 3-COLUMNAS TIPO FACEBOOK (solo /marketplace, 2026-06-05):
            · IZQUIERDA (sticky, lg+): categorías + filtros + atajos.
            · CENTRO: feed — saludo, fidelidad, secciones y catálogo.
            · DERECHA (sticky, xl+): publicidad (banners).
          Las secciones quedan alineadas entre sí y con el catálogo (misma
          columna). Rails ocultos en mobile (modo computadora).
          ══════════════════════════════════════════════════════════════════ */}
      <CatalogFilterProvider>
        <div className="bg-[var(--surface-sunken)] py-4 sm:py-6 min-h-[60vh]">
          <div className="mx-auto grid max-w-[1800px] grid-cols-1 items-start gap-5 px-3 sm:px-4 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-5 lg:px-6 xl:grid-cols-[220px_minmax(0,1fr)_290px]">

            {/* ── IZQUIERDA: categorías + filtros — FIJA (FB-style): el aside
                 mismo es sticky (con items-start del grid queda corto y se
                 pega); scroll interno si supera el viewport. Solo el centro
                 navega. ── */}
            <aside className="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filtros y categorías">
              <MarketplaceLeftRail />
            </aside>

            {/* ── CENTRO: feed (secciones + catálogo). Componente aparte para
                 poder LEER el filtro de categoría (contexto) y entrar en "modo
                 filtro" — oculta las secciones promo y deja solo el catálogo. ── */}
            <MarketplaceCenterFeed
              initialStores={initialStores}
              initialBestsellers={initialBestsellers}
              search={search || ""}
            />

            {/* ── DERECHA: publicidad (banners) — FIJA (FB-style). ── */}
            <aside className="hidden xl:block xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Publicidad">
              <MarketplaceRightRail zone={null} />
            </aside>

          </div>
        </div>
      </CatalogFilterProvider>

      {/* CTA hacia /marketplace/explorar — solo si querés ver todo */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <Link
          href="/marketplace/explorar"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          Explorar todo el catálogo
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

/** "pollo-brasa" → "Pollo brasa" */
function prettyCategoryLabel(id: string): string {
  const s = id.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * MarketplaceCenterFeed — columna CENTRAL. Lee el filtro de categoría
 * (CatalogFilterContext) para alternar entre:
 *   · Feed normal (sin filtro): todas las secciones + catálogo.
 *   · Modo filtro (categoría != "todos"): oculta las secciones promo (Cerca
 *     tuyo, Más vendidos, etc.) y deja SOLO el catálogo filtrado, con una
 *     barra de "filtros aplicados" debajo de la zona de fidelidad.
 */
function MarketplaceCenterFeed({
  initialStores,
  initialBestsellers,
  search,
}: {
  initialStores?: MarketplaceContentProps["initialStores"];
  initialBestsellers?: MarketplaceContentProps["initialBestsellers"];
  search: string;
}) {
  const filter = useCatalogFilter();
  const sectionVisibility = useNavVisibility("marketplace-sections");
  const isVisible = (id: string) => sectionVisibility[id] !== false;
  const activeCategory = filter?.category ?? "todos";
  const isFiltered = activeCategory !== "todos";

  // Anclas de secciones para el scrollspy + el buscador ⌘K. Solo las que se
  // renderizan (cerca-de-ti es gated). Los ids coinciden con anchorId abajo.
  const feedSections = [
    { id: "mp-vendidos", label: "Más vendidos" },
    { id: "mp-ofertas", label: "Ofertas" },
    { id: "mp-catalogo", label: "Catálogo" },
    { id: "mp-recetas", label: "Recetas" },
  ];

  return (
    <div id="mp-feed" className="min-w-0 space-y-4 scroll-mt-20 sm:space-y-5">
      {/* Saludo + "pulse strip" (Brandon 2026-06-06): racha + tienda de la
          semana + fidelidad en UNA fila de mini-cards uniformes (h-16) —
          ocupan ~1/3 del alto que antes. Si alguna no renderiza (sin sesión /
          <2 tiendas), las otras se estiran (flex, los null no dejan hueco). */}
      <SaludoHorario />
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-stretch">
        <RachaDiariaWidget className="lg:flex-1 lg:min-w-0" />
        <TiendaSemanaWidget initialStores={initialStores} className="lg:flex-1 lg:min-w-0" />
        <MyFidelidadCard compact className="lg:flex-1 lg:min-w-0" />
      </div>
      <MarketplaceQuickReorder />

      {/* Buscador universal ⌘K — montado SIEMPRE (atajo global, también en modo
          filtro). Renderiza la barra-lanzador + el modal palette. */}
      <MarketplaceCommandLauncher stores={initialStores} sections={feedSections} />

      {isFiltered ? (
        <>
          {/* Barra de filtros aplicados — debajo de la zona de fidelidad */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
            <span className="text-sm font-bold text-[var(--text-primary)]">Filtrando por</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] py-1 pl-3 pr-1.5 text-sm font-bold text-[var(--accent)]">
              {prettyCategoryLabel(activeCategory)}
              <button
                type="button"
                onClick={() => filter?.setCategory("todos")}
                aria-label="Quitar filtro"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/25"
              >
                <span aria-hidden className="-mt-px text-base leading-none">×</span>
              </button>
            </span>
            <button
              type="button"
              onClick={() => filter?.setCategory("todos")}
              className="ml-auto text-sm font-semibold text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
            >
              Limpiar filtros
            </button>
          </div>

          {/* SOLO el catálogo filtrado (las secciones promo se ocultan) */}
          <BodegasSectionBox defer>
            <MarketplaceCatalogViewSection searchQuery={search || undefined} />
          </BodegasSectionBox>
        </>
      ) : (
        <>
          {/* Scrollspy sticky de secciones — navegable (solo modo no-filtro) */}
          <MarketplaceSectionNav sections={feedSections} />
          {/* "Bodegas que no puedes perderte / Cerca tuyo / mejores 3 tiendas"
              (TiendasDestacadas) REMOVIDO por pedido de Brandon 2026-06-05.
              El import se conserva por el tipo de `initialStores` en props. */}
          {/* "Cerca de ti" (GPS opt-in) REMOVIDO por pedido de Brandon 2026-06-05. */}
          {/* Top más vendidos — SSR (SEO) */}
          <BodegasSectionBox anchorId="mp-vendidos"><MarketplaceBestsellersStrip initialItems={initialBestsellers} /></BodegasSectionBox>
          {/* Para ti — recomendaciones IA personalizadas (se auto-oculta sin historial) */}
          {isVisible("para-ti") && (
            <BodegasSectionBox defer flush><PersonalizedRecommendations /></BodegasSectionBox>
          )}
          {/* NB: MarketplaceTopToday ("Lo más pedido hoy") se evaluó y descartó del
              feed — es redundante con "Más vendidos" (MarketplaceBestsellersStrip,
              ya arriba) y su grid de 6 cols queda apretado en la columna central.
              El social-proof de ranking ya lo cubre Bestsellers. */}
          {/* Ofertas del día / flash */}
          <BodegasSectionBox anchorId="mp-ofertas" defer><OfertasDelDiaHero /></BodegasSectionBox>
          <BodegasSectionBox defer><OfertasFlashSection /></BodegasSectionBox>
          {/* Catálogo cross-store (filtrable desde el rail izquierdo) */}
          <BodegasSectionBox anchorId="mp-catalogo" defer>
            <MarketplaceCatalogViewSection searchQuery={search || undefined} />
          </BodegasSectionBox>
          <BodegasSectionBox anchorId="mp-recetas" defer><MarketplaceRecipesWidget /></BodegasSectionBox>
          {isVisible("comparar-productos") && (
            <BodegasSectionBox defer><ComparedProductsSection /></BodegasSectionBox>
          )}
          {isVisible("bodega-al-mes") && (
            <BodegasSectionBox defer><SubscribeAndSaveSection /></BodegasSectionBox>
          )}
          {isVisible("gift-cards") && (
            <BodegasSectionBox defer><GiftCardsBanner /></BodegasSectionBox>
          )}
          {isVisible("asistente-ia") && (
            <BodegasSectionBox defer><AsistenteHomeBanner /></BodegasSectionBox>
          )}
          <BodegasSectionBox defer><MarketplaceRecentViewed /></BodegasSectionBox>
        </>
      )}
    </div>
  );
}

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
  flush = false,
  anchorId,
}: {
  children: React.ReactNode;
  /** Difiere el montaje hasta acercarse al viewport (perf below-fold). */
  defer?: boolean;
  /** Sin card con `overflow-hidden` — necesario para sidebars `position:sticky`
   *  (un ancestro overflow-hidden rompe el sticky). Lo usa el catálogo. */
  flush?: boolean;
  /** id de ancla para el scrollspy + buscador ⌘K. scroll-mt compensa el nav. */
  anchorId?: string;
}) {
  const inner = (
    <RevealOnScroll
      defer={defer}
      // Pre-monta ~500px antes de entrar (el fetch arranca antes de verse).
      rootMargin={defer ? "500px 0px 500px 0px" : undefined}
      // Reserva alto mientras no montó → sin layout shift al aparecer.
      minHeightClass={defer ? "min-h-[260px]" : undefined}
    >
      {flush ? (
        children
      ) : (
        <div
          className={[
            "overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
            "[&_section]:!max-w-none [&_section]:!mx-0 [&_section]:!px-4",
            "sm:[&_section]:!px-6 [&_section]:!py-5 sm:[&_section]:!py-6",
          ].join(" ")}
        >
          {children}
        </div>
      )}
    </RevealOnScroll>
  );

  // Con ancla: envoltura con id + scroll-mt para que el scrollspy/⌘K aterricen
  // debajo del nav sticky sin tapar el encabezado de la sección.
  return anchorId ? (
    <div id={anchorId} className="scroll-mt-[7rem]">
      {inner}
    </div>
  ) : (
    inner
  );
}
