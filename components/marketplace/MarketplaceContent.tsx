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
import SectionDivider from "@/components/marketplace/home/SectionDivider";
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";
import MyFidelidadCard from "@/components/marketplace/MyFidelidadCard";

// Audit P10 (sprint perf): below-fold sections diferidas para reducir
// el initial bundle (138 → ~60 chunks meta). Cada `dynamic({ ssr: false })`
// se descarga solo cuando React monta el componente — el usuario las ve
// tras el hero, después del paint inicial.
const MarketplaceCatalogViewSection = dynamic(
  () => import("@/components/marketplace/MarketplaceCatalogViewSection"),
  { ssr: false },
);
const TiendasDestacadas = dynamic(
  () => import("@/components/marketplace/home/TiendasDestacadas"),
  { ssr: false },
);
const MarketplaceStories = dynamic(
  () => import("@/components/marketplace/MarketplaceStories"),
  { ssr: false },
);
const TrendingTodayWidget = dynamic(
  () => import("@/components/marketplace/TrendingTodayWidget"),
  { ssr: false },
);
const MarketplaceFreeShippingBar = dynamic(
  () => import("@/components/marketplace/MarketplaceFreeShippingBar"),
  { ssr: false },
);
const MarketplaceJungleProducts = dynamic(
  () => import("@/components/marketplace/MarketplaceJungleProducts"),
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
const LiveActivityFeed = dynamic(
  () => import("@/components/marketplace/home/LiveActivityFeed"),
  { ssr: false },
);
const AhorraMasMegaSection = dynamic(
  () => import("@/components/marketplace/home/AhorraMasMegaSection"),
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
const VenderMiniCTA = dynamic(
  () => import("@/components/marketplace/home/VenderMiniCTA"),
  { ssr: false },
);
const LiveOrderCounter = dynamic(
  () => import("@/components/marketplace/LiveOrderCounter"),
  { ssr: false },
);

// Removidos (ronda A) — ahora en /tiendas o ronda B nav secundaria:
// import MarketplaceFilters, { type MarketplaceFiltersState } from "@/components/marketplace/MarketplaceFilters";
// import MarketplaceStoresView, { CATEGORIES, ZONES } from "@/components/marketplace/MarketplaceStoresView";
// import QuickFilterChips, { type QuickChipId } from "@/components/marketplace/QuickFilterChips";
// import { getStoreCategoryIcon } from "@/components/marketplace/_category-icons";
// import { cn } from "@/lib/utils";

/* ── Constants ─────────────────────────────────────────────────────────────── */

// MAX_PRICE_LIMIT reservado para ronda B (product filter bar)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _MAX_PRICE_LIMIT = 500;

/**
 * SHOW_SECONDARY_HOME_SECTIONS — toggle de densidad del home.
 *
 * Feynman: con `false`, el cliente ve las secciones CORE (ofertas del día,
 * recomendaciones, top de hoy, tiendas). Las secciones secundarias (feed
 * real-time, mega ahorra, asistente, vender, flash duplicado) se mueven a
 * /descubri accesible con un CTA al final. Evita que el cliente se pierda
 * en 17+ secciones apiladas.
 *
 * Cambiar a `true` si el negocio quiere ir a full-feature display.
 */
const SHOW_SECONDARY_HOME_SECTIONS = false;

/* ── Props ──────────────────────────────────────────────────────────────────── */

// initialStores removido (ronda A) — ya no se pre-fetcha el listado de tiendas
// en el marketplace home. El catálogo de productos lo maneja MarketplaceCatalogViewSection.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface MarketplaceContentProps {}

/* ── MarketplaceContent (orchestrator) ─────────────────────────────────────── */

export default function MarketplaceContent(_props: MarketplaceContentProps = {}) {
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
          className="fixed left-1/2 top-4 z-[9999] -translate-x-1/2 rounded-xl bg-[var(--data-success-600)] px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-900/20"
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

      {/* Panel de fidelidad — solo visible para clientes con sesión.
          Render nulo si no hay customer, sin placeholder vacío. */}
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4">
        <div className="w-full lg:max-w-sm">
          <MyFidelidadCard />
        </div>
      </div>

      {/* LiveActivityStrip y LiveStats eliminados (2026-04-20) — pedido del
          negocio: reducir ruido visual y compactar el home de bodegas. */}

      {/* ══════════════════════════════════════════════════════════════════
          SECCIONES ENCAPSULADAS — cada una en una caja con borde sobre
          fondo sunken. Espaciado compacto + contraste mosaico ML.
          ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-[var(--surface-sunken)] py-3 sm:py-4">
        <div className="mx-auto max-w-[1600px] space-y-3 sm:space-y-4 px-3 sm:px-4 lg:px-6">
          <BodegasSectionBox><TiendasDestacadas /></BodegasSectionBox>
          <BodegasSectionBox><MarketplaceStories /></BodegasSectionBox>
          <BodegasSectionBox><OfertasDelDiaHero /></BodegasSectionBox>
          {SHOW_SECONDARY_HOME_SECTIONS && (
            <BodegasSectionBox><LiveActivityFeed /></BodegasSectionBox>
          )}
          <BodegasSectionBox><TrendingTodayWidget /></BodegasSectionBox>
          <BodegasSectionBox><MarketplaceJungleProducts /></BodegasSectionBox>
          <BodegasSectionBox><OfertasFlashSection /></BodegasSectionBox>
          <BodegasSectionBox>
            <MarketplaceCatalogViewSection searchQuery={search || undefined} />
          </BodegasSectionBox>
          {SHOW_SECONDARY_HOME_SECTIONS && (
            <BodegasSectionBox><AhorraMasMegaSection /></BodegasSectionBox>
          )}
          <BodegasSectionBox><MarketplaceRecipesWidget /></BodegasSectionBox>
          {isVisible("comparar-productos") && (
            <BodegasSectionBox><ComparedProductsSection /></BodegasSectionBox>
          )}
          {isVisible("bodega-al-mes") && (
            <BodegasSectionBox><SubscribeAndSaveSection /></BodegasSectionBox>
          )}
          {isVisible("gift-cards") && (
            <BodegasSectionBox><GiftCardsBanner /></BodegasSectionBox>
          )}
          {isVisible("asistente-ia") && (
            <BodegasSectionBox><AsistenteHomeBanner /></BodegasSectionBox>
          )}
          <BodegasSectionBox><MarketplaceRecentViewed /></BodegasSectionBox>
          {SHOW_SECONDARY_HOME_SECTIONS && (
            <BodegasSectionBox><VenderMiniCTA /></BodegasSectionBox>
          )}
        </div>
      </div>

      {/* ── CTA a /marketplace/explorar — compensa las secciones secundarias ocultas
              (antes apuntaba a /descubri que no existe — fix Visual QA P0-3) ── */}
      {!SHOW_SECONDARY_HOME_SECTIONS && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)] mb-3">
            ¿Quieres más? Recorré categorías, ocasiones y bodegas en Pucallpa.
          </p>
          <Link
            href="/marketplace/explorar"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Explorar todo el marketplace
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </Link>
        </section>
      )}

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
          <h2 className="text-[clamp(2.5rem,7vw,5rem)] font-black tracking-[-0.04em] text-[var(--text-primary)] leading-[0.92]">
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
function BodegasSectionBox({ children }: { children: React.ReactNode }) {
  return (
    <RevealOnScroll>
      <div
        className={[
          "overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
          "[&_section]:!max-w-none [&_section]:!mx-0 [&_section]:!px-4",
          "sm:[&_section]:!px-5 [&_section]:!py-4 sm:[&_section]:!py-5",
        ].join(" ")}
      >
        {children}
      </div>
    </RevealOnScroll>
  );
}
