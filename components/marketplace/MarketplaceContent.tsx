"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Store,
  TrendingUp,
  Clock,
  LocateFixed,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { m } from "framer-motion";
import MarketplaceFilters, {
  type MarketplaceFiltersState,
} from "@/components/marketplace/MarketplaceFilters";
import SearchAutocomplete from "@/components/marketplace/SearchAutocomplete";
import MarketplaceStoresView, {
  CATEGORIES,
  ZONES,
} from "@/components/marketplace/MarketplaceStoresView";
import MarketplaceCatalogViewSection from "@/components/marketplace/MarketplaceCatalogViewSection";
import {
  useMarketplaceGeo,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";
import { deserializeCart } from "@/lib/marketplace/cart-sharing";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCustomer } from "@/contexts/customer-context";
import ReorderButton from "@/components/marketplace/ReorderButton";
import QuickFilterChips, {
  type QuickChipId,
} from "@/components/marketplace/QuickFilterChips";
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
import { LiveNowWidget } from "@/components/marketplace/en-vivo/LiveNowWidget";
import MarketplaceWelcomeCoupon from "@/components/marketplace/MarketplaceWelcomeCoupon";
import FlyToCartProvider from "@/components/marketplace/FlyToCart";
import { getStoreCategoryIcon } from "@/components/marketplace/_category-icons";
// ── Home narrative modules (ENRICH-6) ────────────────────────────────────────
import ParaVosSection from "@/components/marketplace/home/ParaVosSection";
import OfertasFlashSection from "@/components/marketplace/home/OfertasFlashSection";
import LiveActivityFeed from "@/components/marketplace/home/LiveActivityFeed";
import AhorraMasMegaSection from "@/components/marketplace/home/AhorraMasMegaSection";
import ComparedProductsSection from "@/components/marketplace/home/ComparedProductsSection";
import AsistenteHomeBanner from "@/components/marketplace/home/AsistenteHomeBanner";
import VenderMiniCTA from "@/components/marketplace/home/VenderMiniCTA";

type ViewMode = "tiendas" | "catalogo";

/* ── Constants ─────────────────────────────────────────────────────────────── */

const MAX_PRICE_LIMIT = 500;

const DEFAULT_FILTERS: MarketplaceFiltersState = {
  minPrice: 0,
  maxPrice: MAX_PRICE_LIMIT,
  productCategory: null,
  sortBy: "relevance",
  nearbyEnabled: false,
};

/* ── Props ──────────────────────────────────────────────────────────────────── */

interface MarketplaceContentProps {
  /**
   * Stores pre-fetched en el servidor para eliminar el skeleton flash
   * del first paint. Si están presentes, se usan como estado inicial
   * y se skip-ea el primer fetch cliente.
   *
   * Solo deberían venir populados cuando NO hay filtros en la URL
   * (zona, categoria, buscar) — para esos casos el cliente hace fetch
   * fresh con los filtros correctos.
   */
  initialStores?: MarketplaceStore[];
}

/* ── MarketplaceContent (orchestrator) ─────────────────────────────────────── */

export default function MarketplaceContent({ initialStores }: MarketplaceContentProps = {}) {
  const searchParams = useSearchParams();
  const { addItem } = useMarketplaceCart();
  const cartImportDone = useRef(false);
  const [sharedCartToast, setSharedCartToast] = useState<string | null>(null);

  // ── Import shared cart from ?cart= param ──
  useEffect(() => {
    if (cartImportDone.current) return;
    const token = searchParams.get("cart");
    if (!token) return;

    cartImportDone.current = true;

    const items = deserializeCart(token);
    if (items.length === 0) return;

    // Fetch store details to build full CartItem shape
    // We only know productId + storeSlug + quantity — add minimal stubs;
    // the full product data loads when the user opens the product card.
    // For each unique storeSlug, we can import items directly into the cart.
    for (const shared of items) {
      addItem({
        storeId: shared.s,
        storeName: shared.s,         // stub — shown in cart until real name loads
        storeSlug: shared.s,
        storeProductId: `${shared.s}-${shared.p}`,
        productId: shared.p,
        name: `Producto #${shared.p}`,  // stub — updated when user sees cart
        price: 0,                        // preview only — totals computed server-side
        quantity: shared.q,
        image: null,
        unit: null,
      });
    }

    setSharedCartToast(`Carrito importado: ${items.length} ${items.length === 1 ? "producto" : "productos"}`);
    setTimeout(() => setSharedCartToast(null), 4000);

    // Remove ?cart= from URL to prevent re-import on refresh
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("cart");
      window.history.replaceState({}, "", url.toString());
    } catch { /* SSR guard */ }
  }, [searchParams, addItem]);

  const initialCategoria = searchParams.get("categoria") ?? "todos";
  // Map landing category slugs to marketplace category IDs
  const CATEGORIA_MAP: Record<string, string> = {
    // Product-type slugs → store categories
    abarrotes: "bodega", bebidas: "bodega", carnes: "carniceria",
    verduras: "fruteria", frutas: "fruteria", lacteos: "bodega",
    panaderia: "panaderia", limpieza: "bodega", higiene: "bodega",
    snacks: "bodega", embutidos: "carniceria", congelados: "bodega",
    // Landing page slugs → marketplace category IDs
    bodegas: "bodega", restaurantes: "restaurante",
    "frutas-verduras": "fruteria", mascotas: "bodega",
  };
  const mappedCategory = CATEGORIA_MAP[initialCategoria] ?? (CATEGORIES.some(c => c.id === initialCategoria) ? initialCategoria : "todos");

  const [stores, setStores] = useState<MarketplaceStore[]>(initialStores ?? []);
  const [loading, setLoading] = useState(!initialStores || initialStores.length === 0);
  // Si llegaron initialStores, skip-eamos el primer fetch cliente
  // (solo se hace fetch al cambiar filtros).
  const [initialFetchDone, setInitialFetchDone] = useState(!!initialStores && initialStores.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("buscar") ?? "");
  const [category, setCategory] = useState(mappedCategory);
  const [zone, setZone] = useState("");
  const [productFilters, setProductFilters] = useState<MarketplaceFiltersState>(DEFAULT_FILTERS);

  // ── Quick-filter chips ──
  const [activeChips, setActiveChips] = useState<Set<QuickChipId>>(new Set());

  const handleChipToggle = useCallback((chipId: QuickChipId) => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(chipId)) {
        next.delete(chipId);
      } else {
        next.add(chipId);
      }
      return next;
    });
  }, []);

  // ── New: view mode ──
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "tiendas";
    return (localStorage.getItem("marketplace-view-mode") as ViewMode) || "tiendas";
  });

  // Persist view mode preference
  useEffect(() => {
    try { localStorage.setItem("marketplace-view-mode", viewMode); } catch { /* silent */ }
  }, [viewMode]);

  // ── Geo hook ──
  const {
    geoLoading,
    geoActive,
    userCoords,
    filteredStores,
    handleGeoSort,
    setGeoActive,
    setUserCoords,
  } = useMarketplaceGeo(stores, setProductFilters);

  const handleFiltersChange = useCallback((patch: Partial<MarketplaceFiltersState>) => {
    setProductFilters((prev) => {
      const next = { ...prev, ...patch };
      // Si activamos nearbyEnabled desde el panel de filtros, pedir GPS
      if (patch.nearbyEnabled === true && !prev.nearbyEnabled) {
        return next; // la lógica GPS ya está en handleGeoSort
      }
      return next;
    });
    // Si el usuario activa nearbyEnabled desde MarketplaceFilters, sincronizar con geoActive
    if (patch.nearbyEnabled === false) {
      setGeoActive(false);
      setUserCoords(null);
    }
  }, [setGeoActive, setUserCoords]);

  const fetchStores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category !== "todos") params.set("category", category);
      if (zone) params.set("zone", zone);
      if (search.trim()) params.set("search", search.trim());
      params.set("limit", "50");

      const res = await fetch(`/api/marketplace/stores?${params}`);
      if (!res.ok) throw new Error("Error cargando tiendas");
      const json = await res.json();
      setStores(json.data ?? []);
    } catch {
      setError("No pudimos cargar las tiendas. Intenta de nuevo.");
    }
    setLoading(false);
  }, [category, zone, search]);

  useEffect(() => {
    // Si ya tenemos initialStores y no hay filtros, skip del primer fetch.
    const hasFilters = category !== "todos" || zone !== "" || search.trim() !== "";
    if (!initialFetchDone && !hasFilters) {
      setInitialFetchDone(true);
      return;
    }
    const timer = setTimeout(fetchStores, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchStores, search, category, zone, initialFetchDone]);

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

      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden bg-[var(--surface-sunken)] border-b border-[var(--rule-soft)] pb-6 pt-5 sm:pt-8 sm:pb-8">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-secondary/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Title — compact since search is in navbar now */}
          <div className="text-center mb-5">
            <m.h1
              className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-foreground leading-tight"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              Todas las tiendas,{" "}
              <span className="text-primary relative">
                un solo lugar
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
                  if (q.trim()) setViewMode("catalogo");
                }}
                placeholder="Busca productos, tiendas o categorías..."
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
              <strong className="text-gray-900 dark:text-foreground">{stores.length}</strong> tiendas
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

          {/* ── Quick Filter Chips ── */}
          <m.div
            className="mt-5 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <QuickFilterChips
              activeChips={activeChips}
              onToggle={handleChipToggle}
            />
          </m.div>

          {/* ── View Mode Toggle ── */}
          <m.div
            className="flex items-center justify-center mt-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div
              role="group"
              aria-label="Modo de vista"
              className="inline-flex items-center rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1 shadow-md shadow-gray-200/40 dark:shadow-none"
            >
              <button
                onClick={() => setViewMode("tiendas")}
                aria-pressed={viewMode === "tiendas"}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                  viewMode === "tiendas"
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
              >
                <Store className="h-4 w-4" aria-hidden="true" />
                Tiendas
              </button>
              <button
                onClick={() => setViewMode("catalogo")}
                aria-pressed={viewMode === "catalogo"}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                  viewMode === "catalogo"
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                Catálogo
              </button>
            </div>
          </m.div>
        </div>
      </section>

      {/* ── Para vos: smart recommendations post-hero (ENRICH-6 Ola 3) ── */}
      <ParaVosSection />

      {/* ══════════════════════════════════════════════════════════════════
          LO QUE ESTA PASANDO AHORA
          Narrativa de urgencia + prueba social en tiempo real.
          ══════════════════════════════════════════════════════════════════ */}

      {/* ── Buleje en Vivo: widget si hay transmisión activa ── */}
      <LiveNowWidget />

      {/* ── Ofertas flash con countdown ── */}
      <OfertasFlashSection />

      {/* ── Feed de actividad real-time (mock) ── */}
      <LiveActivityFeed />

      {/* ── Lo más pedido hoy (carrusel horizontal con ranking) ── */}
      <MarketplaceTopToday />

      {/* ── Productos de la selva (Pucallpa/Ucayali) ── */}
      <MarketplaceJungleProducts />

      {/* ── Filters + Grid ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Sticky filter cluster: se queda pegado arriba al scrollear (glassmorphism) */}
        <div className="sticky top-[60px] z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 glass rounded-2xl mb-3">
        {/* Category pills — arriba de todo */}
        <div
          role="group"
          aria-label="Filtrar por categoría de tienda"
          className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              aria-pressed={category === cat.id}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap border transition-all shrink-0",
                category === cat.id
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                  : "bg-white dark:bg-card text-gray-600 dark:text-muted border-gray-200 dark:border-card-border hover:border-gray-400",
              )}
            >
              {(() => {
                const CatIcon = getStoreCategoryIcon(cat.id);
                return <CatIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />;
              })()}
              {cat.label}
            </button>
          ))}
        </div>

        {/* Zona + Filtros de producto — barra compacta */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {/* Zone selector */}
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            aria-label="Filtrar por zona"
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold outline-none transition-colors",
              zone
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary/40"
            )}
          >
            {ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>

          {/* Separador */}
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0 hidden sm:block" />

          {/* Product filters (sort, price, category, nearby) */}
          <MarketplaceFilters
            filters={productFilters}
            userCoords={userCoords}
            geoLoading={geoLoading}
            onChange={handleFiltersChange}
            onRequestGeo={handleGeoSort}
          />

          {(category !== "todos" || zone || geoActive) && (
            <button
              onClick={() => {
                setCategory("todos");
                setZone("");
                setGeoActive(false);
                setUserCoords(null);
                setProductFilters(DEFAULT_FILTERS);
              }}
              aria-label="Limpiar todos los filtros activos"
              className="text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors underline"
            >
              Limpiar todo
            </button>
          )}
        </div>
        </div> {/* ← end sticky filter cluster */}

        {/* ── Conditional View Rendering ── */}
        {viewMode === "catalogo" ? (
          <MarketplaceCatalogViewSection
            searchQuery={search || undefined}
            zone={zone || undefined}
            category={category !== "todos" ? category : undefined}
          />
        ) : (
          <MarketplaceStoresView
            stores={stores}
            loading={loading}
            error={error}
            search={search}
            category={category}
            zone={zone}
            geoActive={geoActive}
            filteredStores={filteredStores}
            activeChips={activeChips}
            onRetry={fetchStores}
            onClearAll={() => {
              setSearch("");
              setCategory("todos");
              setZone("");
              setGeoActive(false);
              setUserCoords(null);
            }}
          />
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          AHORRA MAS CON BULEJE
          Mega-section triple: Socio + Bodega al Mes + Cupones.
          ══════════════════════════════════════════════════════════════════ */}
      <AhorraMasMegaSection />

      {/* ── Recetas de la selva (widget con ingredientes al carrito) ── */}
      <MarketplaceRecipesWidget />

      {/* ── Productos populares en el comparador (cross-sell) ── */}
      <ComparedProductsSection />

      {/* ── Bodega al Mes: productos suscribibles con 5% descuento ── */}
      <SubscribeAndSaveSection />

      {/* ── Gift Cards: regalá la bodega del barrio ── */}
      <GiftCardsBanner />

      {/* ── Preguntale al asistente (cross-sell a /asistente) ── */}
      <AsistenteHomeBanner />

      {/* ── Productos vistos recientemente (local storage) ── */}
      <MarketplaceRecentViewed />

      {/* ── Vende en Buleje (B2B mini CTA) ── */}
      <VenderMiniCTA />

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
