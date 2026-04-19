"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Store,
  TrendingUp,
  Clock,
  LocateFixed,
} from "lucide-react";
import Link from "next/link";
import { m } from "framer-motion";
import SearchAutocomplete from "@/components/marketplace/SearchAutocomplete";
import MarketplaceCatalogViewSection from "@/components/marketplace/MarketplaceCatalogViewSection";
import {
  useMarketplaceGeo,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";
import { deserializeCart } from "@/lib/marketplace/cart-sharing";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
// useCustomer y ReorderButton removidos (ronda A) — sin uso en catálogo puro
import MarketplaceHeroBanner from "@/components/marketplace/MarketplaceHeroBanner";
import { LiveSocialProofBanner } from "@/components/marketing/LiveSocialProofBanner";
import MarketplaceStories from "@/components/marketplace/MarketplaceStories";
import MarketplaceTopToday from "@/components/marketplace/MarketplaceTopToday";
import MarketplaceFreeShippingBar from "@/components/marketplace/MarketplaceFreeShippingBar";
import MarketplaceMiniCart from "@/components/marketplace/MarketplaceMiniCart";
import MarketplaceJungleProducts from "@/components/marketplace/MarketplaceJungleProducts";
import MarketplaceRecipesWidget from "@/components/marketplace/MarketplaceRecipesWidget";
import MarketplaceRecentViewed from "@/components/marketplace/MarketplaceRecentViewed";
import SubscribeAndSaveSection from "@/components/marketplace/SubscribeAndSaveSection";
import GiftCardsBanner from "@/components/marketplace/gift-cards/GiftCardsBanner";
// LiveNowWidget removido (ronda A) — ver /marketplace/en-vivo
// import { LiveNowWidget } from "@/components/marketplace/en-vivo/LiveNowWidget";
import MarketplaceWelcomeCoupon from "@/components/marketplace/MarketplaceWelcomeCoupon";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";
// ── Home narrative modules (ENRICH-6) ────────────────────────────────────────
import ParaVosSection from "@/components/marketplace/home/ParaVosSection";
import OfertasDelDiaHero from "@/components/marketplace/home/OfertasDelDiaHero";
import OfertasFlashSection from "@/components/marketplace/home/OfertasFlashSection";
import LiveActivityFeed from "@/components/marketplace/home/LiveActivityFeed";
import AhorraMasMegaSection from "@/components/marketplace/home/AhorraMasMegaSection";
import ComparedProductsSection from "@/components/marketplace/home/ComparedProductsSection";
import AsistenteHomeBanner from "@/components/marketplace/home/AsistenteHomeBanner";
import VenderMiniCTA from "@/components/marketplace/home/VenderMiniCTA";

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
  const [search, setSearch] = useState(searchParams.get("buscar") ?? "");

  // ── Geo hook — solo para badge "Ordenado por cercanía" en stats row ──
  const [_stores] = useState<MarketplaceStore[]>([]);
  const { geoActive } = useMarketplaceGeo(_stores, () => {});

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

    setSharedCartToast(`Carrito importado: ${items.length} ${items.length === 1 ? "producto" : "productos"}`);
    setTimeout(() => setSharedCartToast(null), 4000);

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("cart");
      window.history.replaceState({}, "", url.toString());
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
          className="fixed left-1/2 top-4 z-[9999] -translate-x-1/2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-900/20"
        >
          {sharedCartToast}
        </m.div>
      )}

      {/* ── Free shipping progress bar (sticky, aparece cuando hay items en carrito) ── */}
      <MarketplaceFreeShippingBar />

      {/* ── Hero banner rotativo (Pucallpa · delivery · selva · cupón) ── */}
      <MarketplaceHeroBanner />

      {/* ── Stories tipo Instagram — accesos rápidos ── */}
      <MarketplaceStories />

      {/* ── Hero Section ── noise-texture-bg da feel "papel impreso" */}
      <section className="relative overflow-hidden noise-texture-bg bg-[var(--surface-sunken)] border-b border-[var(--rule-soft)] pb-6 pt-5 sm:pt-8 sm:pb-8">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-secondary/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Title — compact since search is in navbar now */}
          <div className="text-center mb-5">
            <m.h1
              className="font-display text-3xl sm:text-5xl md:text-6xl font-semibold text-[var(--text-primary)] leading-[1.05] tracking-[-0.02em]"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              Todo el catálogo{" "}
              <span className="text-primary relative">
                de Pucallpa
                <svg
                  aria-hidden="true"
                  className="absolute -bottom-1 left-0 w-full h-2 text-primary/30"
                  viewBox="0 0 100 12"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M0 8 Q25 0 50 6 Q75 12 100 4"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </m.h1>

            <m.p
              className="text-gray-500 dark:text-muted mt-2 text-sm sm:text-base max-w-xl mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              Pedí a bodegas cerca tuyo. Delivery en 25 min.
              Pagás con Yape o efectivo al recibir.
            </m.p>

            {/* Social proof real desde DB — Cialdini Social Proof */}
            <m.div
              className="mt-3 flex justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <LiveSocialProofBanner variant="light" />
            </m.div>

            {/* Search bar — SearchAutocomplete con sugerencias IA + did you mean */}
            <m.div
              className="mt-5 max-w-xl mx-auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <SearchAutocomplete
                onSearch={(q) => {
                  setSearch(q);
                }}
                placeholder="Busca productos, categorías..."
              />
            </m.div>
          </div>

          {/* Stats row */}
          <m.div
            className="flex items-center justify-center gap-4 sm:gap-8 text-sm text-gray-500 dark:text-muted flex-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Store className="h-4 w-4 text-primary" aria-hidden="true" />
              Miles de productos en Pucallpa
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              Abierto 24/7
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              Delivery rápido
            </span>
            {geoActive && (
              <span className="inline-flex items-center gap-1.5 text-primary font-semibold" aria-live="polite">
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
                Ordenado por cercanía
              </span>
            )}
          </m.div>

          {/* QuickFilterChips y ViewMode Toggle removidos (ronda A).
              Van a nav secundaria en ronda B. */}
        </div>
      </section>

      {/* ── Ofertas del dia: ProductCardHero (Ola 7) — 2 featured above-the-fold ── */}
      <OfertasDelDiaHero />

      {/* ── Para vos: smart recommendations post-hero (ENRICH-6 Ola 3) ── */}
      <ParaVosSection />

      {/* ══════════════════════════════════════════════════════════════════
          LO QUE ESTA PASANDO AHORA
          Narrativa de urgencia + prueba social en tiempo real.
          ══════════════════════════════════════════════════════════════════ */}

      {/* LiveNowWidget removido (ronda A) — ver /marketplace/en-vivo */}

      {/* ── Ofertas flash con countdown (secundaria — redundante con OfertasDelDia) ── */}
      {SHOW_SECONDARY_HOME_SECTIONS && <OfertasFlashSection />}

      {/* ── Feed de actividad real-time (secundaria — ruido visual) ── */}
      {SHOW_SECONDARY_HOME_SECTIONS && <LiveActivityFeed />}

      {/* ── Lo más pedido hoy (carrusel horizontal con ranking) ── */}
      <MarketplaceTopToday />

      {/* ── Productos de la selva (Pucallpa/Ucayali) ── */}
      <MarketplaceJungleProducts />

      {/* ── Catálogo de productos ──
          Category chips de tiendas, zone selector y MarketplaceStoresView
          removidos (ronda A) — tiendas migradas a /tiendas.
          Ronda B montará el secondary nav con chips de categoría de producto. */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <MarketplaceCatalogViewSection
          searchQuery={search || undefined}
        />
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          AHORRA MAS CON BULEJE — mega-section secundaria, condicional
          ══════════════════════════════════════════════════════════════════ */}
      {SHOW_SECONDARY_HOME_SECTIONS && <AhorraMasMegaSection />}

      {/* ── Recetas de la selva (widget con ingredientes al carrito) ── */}
      <MarketplaceRecipesWidget />

      {/* ── Productos populares en el comparador (cross-sell) ── */}
      <ComparedProductsSection />

      {/* ── Bodega al Mes: productos suscribibles con 5% descuento ── */}
      <SubscribeAndSaveSection />

      {/* ── Gift Cards: regalá la bodega del barrio ── */}
      <GiftCardsBanner />

      {/* ── Preguntale al asistente (secundaria — cross-sell) ── */}
      {SHOW_SECONDARY_HOME_SECTIONS && <AsistenteHomeBanner />}

      {/* ── Productos vistos recientemente (local storage) ── */}
      <MarketplaceRecentViewed />

      {/* ── Vende en Buleje (secundaria — redundante con CTA Register abajo) ── */}
      {SHOW_SECONDARY_HOME_SECTIONS && <VenderMiniCTA />}

      {/* ── CTA a /descubri — compensa las secciones secundarias ocultas ── */}
      {!SHOW_SECONDARY_HOME_SECTIONS && (
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)] mb-3">
            ¿Querés más? Explorá lo que hay en el ecosistema Buleje.
          </p>
          <Link
            href="/descubri"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Descubrí más
          </Link>
        </section>
      )}

      {/* ── CTA: Register Your Store ── */}
      <section className="bg-[var(--surface-sunken)] border-y border-[var(--rule-soft)] py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-foreground mb-3">
            ¿Tienes una tienda?{" "}
            <span className="text-primary">Únete al marketplace</span>
          </h2>
          <p className="text-gray-500 dark:text-muted text-sm sm:text-base mb-6 max-w-lg mx-auto">
            Publica tus productos, recibe pedidos automáticamente y llega a
            miles de clientes. Sin costo de inscripción.
          </p>
          <Link
            href="/registro"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
          >
            <Store className="h-5 w-5" />
            Registra tu tienda gratis
          </Link>
        </div>
      </section>

      {/* ── Floating: mini-cart sticky + welcome coupon ── */}
      <MarketplaceMiniCart />
      <MarketplaceWelcomeCoupon />
    </div>
    </FlyToCartProvider>
  );
}
