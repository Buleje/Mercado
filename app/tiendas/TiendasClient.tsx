"use client";

/**
 * TiendasClient — Directorio de tiendas Buleje.
 *
 * Movido desde /marketplace (ronda A):
 *   - MarketplaceStoresView (listado + filtros de tienda)
 *   - RecommendationsStrip (tiendas destacadas — ahora sección inline)
 *   - SearchAutocomplete (contexto tiendas)
 *
 * Pendiente ronda B:
 *   - Nav secundaria con chips de categoría de tienda
 *   - Integrar mapa Leaflet para zona visual
 */

import { useState, useCallback } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { Store, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import SearchAutocomplete from "@/components/marketplace/SearchAutocomplete";
import MarketplaceStoresView, {
  CATEGORIES,
  ZONES,
} from "@/components/marketplace/MarketplaceStoresView";
import {
  useMarketplaceGeo,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";
import { getStoreCategoryIcon } from "@/components/marketplace/_category-icons";
import RecommendationsStrip from "@/components/marketplace/explorar/RecommendationsStrip";
import { useEffect } from "react";
import MarketplaceFilters, {
  type MarketplaceFiltersState,
} from "@/components/marketplace/MarketplaceFilters";
import QuickFilterChips, {
  type QuickChipId,
} from "@/components/marketplace/QuickFilterChips";

/* ── Constants ─────────────────────────────────────────────────────────────── */

const MAX_PRICE_LIMIT = 500;

const DEFAULT_FILTERS: MarketplaceFiltersState = {
  minPrice: 0,
  maxPrice: MAX_PRICE_LIMIT,
  productCategory: null,
  sortBy: "relevance",
  nearbyEnabled: false,
};

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function TiendasClient() {
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todos");
  const [zone, setZone] = useState("");
  const [productFilters, setProductFilters] =
    useState<MarketplaceFiltersState>(DEFAULT_FILTERS);

  // ── Quick-filter chips ──
  const [activeChips, setActiveChips] = useState<Set<QuickChipId>>(new Set());

  const handleChipToggle = useCallback((chipId: QuickChipId) => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(chipId)) next.delete(chipId);
      else next.add(chipId);
      return next;
    });
  }, []);

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

  const handleFiltersChange = useCallback(
    (patch: Partial<MarketplaceFiltersState>) => {
      setProductFilters((prev) => ({ ...prev, ...patch }));
      if (patch.nearbyEnabled === false) {
        setGeoActive(false);
        setUserCoords(null);
      }
    },
    [setGeoActive, setUserCoords],
  );

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
      setError("No pudimos cargar las tiendas. Intentá de nuevo.");
    }
    setLoading(false);
  }, [category, zone, search]);

  useEffect(() => {
    const timer = setTimeout(fetchStores, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchStores, search, category, zone]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-[var(--surface-sunken)] border-b border-[var(--rule-soft)] pb-8 pt-10 sm:pt-14 sm:pb-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <m.span
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Pucallpa · Ucayali
          </m.span>

          <m.h1
            className="font-display text-3xl sm:text-5xl font-semibold text-[var(--text-primary)] leading-[1.05] tracking-[-0.02em] mb-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
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
            className="text-[var(--text-secondary)] text-sm sm:text-base max-w-xl mx-auto mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            Bodegas, minimarkets, carnicerías y más. Encontrá lo que buscás cerca tuyo con delivery rápido.
          </m.p>

          {/* Search */}
          <m.div
            className="max-w-xl mx-auto"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <SearchAutocomplete
              onSearch={setSearch}
              placeholder="Buscar tienda, bodega, minimarket..."
            />
          </m.div>

          {/* Stats */}
          <m.div
            className="mt-5 flex items-center justify-center gap-6 text-sm text-[var(--text-tertiary)] flex-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <span className="inline-flex items-center gap-1.5">
              <Store className="h-4 w-4 text-primary" aria-hidden="true" />
              <strong className="text-[var(--text-primary)]">{loading ? "..." : stores.length}</strong> tiendas
            </span>
            <span>Delivery en 25 min</span>
            <span>Yape · Efectivo</span>
          </m.div>

          {/* Quick-filter chips — ronda B los mueve a nav secundaria */}
          <m.div
            className="mt-5 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <QuickFilterChips activeChips={activeChips} onToggle={handleChipToggle} />
          </m.div>
        </div>
      </section>

      {/* ── Tiendas destacadas strip ── */}
      <div className="py-8 sm:py-10">
        <RecommendationsStrip />
      </div>

      {/* ── Filtros + Grid ── */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Sticky filter cluster */}
        <div className="sticky top-[60px] z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 glass rounded-2xl mb-3">
          {/* Category pills */}
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

          {/* Zona + Filtros */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              aria-label="Filtrar por zona"
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-semibold outline-none transition-colors",
                zone
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary/40",
              )}
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>

            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0 hidden sm:block" />

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
        </div>

        {/* Listado de tiendas */}
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
      </section>

      {/* ── CTA para bodegueros ── */}
      <section className="bg-[var(--surface-sunken)] border-t border-[var(--rule-soft)] py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] mb-3">
            ¿Tienes una tienda?{" "}
            <span className="text-primary">Únete gratis</span>
          </h2>
          <p className="text-[var(--text-secondary)] text-sm sm:text-base mb-6 max-w-lg mx-auto">
            Publica tus productos, recibí pedidos y llegá a miles de clientes en Pucallpa. Sin costo de inscripción.
          </p>
          <Link
            href="/registro"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:-translate-y-0.5"
          >
            <Store className="h-5 w-5" aria-hidden="true" />
            Registrá tu tienda gratis
          </Link>
        </div>
      </section>
    </div>
  );
}
