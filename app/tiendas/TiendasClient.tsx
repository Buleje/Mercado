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

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Store, MapPin, ArrowUpRight } from "@buleje/design-system/icons";
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
import ExplorarTracker from "@/components/marketplace/explorar/ExplorarTracker";
import RevealOnScroll from "@/components/marketplace/home/RevealOnScroll";
import MarketplaceFilters, {
  type MarketplaceFiltersState,
} from "@/components/marketplace/MarketplaceFilters";
import QuickFilterChips, {
  type QuickChipId,
} from "@/components/marketplace/QuickFilterChips";
import PromoBannerCarousel from "@/components/marketplace/PromoBannerCarousel";

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
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="tiendas_directorio" />

      {/* ── Banner promocional reemplaza al hero ───────────────────────── */}
      <PromoBannerCarousel slot="bodegas" />

      {/* Barra compacta: search + quick chips (sin hero editorial) */}
      <section className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <div className="max-w-xl">
            <SearchAutocomplete
              onSearch={setSearch}
              placeholder="Buscar tienda, bodega, minimarket..."
            />
          </div>
          <QuickFilterChips
            activeChips={activeChips}
            onToggle={handleChipToggle}
          />
        </div>
      </section>

      {/* ── Destacadas — header editorial + strip ─────────────────────── */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Destacadas
            </p>
            <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Las que más
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                piden tus vecinos.
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Curado por volumen de pedidos, calificación y cercanía a tu zona.
          </p>
        </div>
      </section>
      <RevealOnScroll>
        <div className="py-6 sm:py-8">
          <RecommendationsStrip />
        </div>
      </RevealOnScroll>

      {/* ── Explorá — header editorial antes de los filtros ───────────── */}
      <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-6">
              <span
                aria-hidden
                className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
              />
              Explorá
            </p>
            <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95]">
              Filtrá por lo que
              <br />
              <span className="italic font-serif text-[var(--accent)]">
                te interesa.
              </span>
            </h2>
          </div>
          <p className="lg:max-w-sm text-lg text-[var(--text-secondary)] leading-relaxed">
            Categoría, zona, precio y distancia — combiná para encontrar la tienda ideal.
          </p>
        </div>
      </section>

      {/* ── Filtros + Grid ── */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Sticky filter cluster — editorial (tab underline active) */}
        <div className="sticky top-[60px] z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-[var(--surface-canvas)]/90 backdrop-blur border-b border-[var(--rule-soft)] mb-3">
          {/* Category pills — underline-active estilo editorial */}
          <div
            role="group"
            aria-label="Filtrar por categoría de tienda"
            className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
          >
            {CATEGORIES.map((cat) => {
              const active = category === cat.id;
              const CatIcon = getStoreCategoryIcon(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  aria-pressed={active}
                  className={cn(
                    "relative inline-flex items-center gap-2 px-4 py-3 text-sm font-bold whitespace-nowrap transition-colors shrink-0",
                    active
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <CatIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {cat.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--accent)]"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Zona + Filtros */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              aria-label="Filtrar por zona"
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs font-bold tabular-nums outline-none transition-colors",
                zone
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/40"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-soft)] hover:border-[var(--accent)]/40",
              )}
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>

            <div className="h-5 w-px bg-[var(--rule-soft)] shrink-0 hidden sm:block" />

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
                className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
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

      {/* ── CTA editorial para bodegueros ───────────────────────────────── */}
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
            ¿Tenés una tienda?
            <br />
            <span className="italic font-serif text-[var(--accent)]">
              Sumate gratis.
            </span>
          </h2>
          <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
            Publicá tus productos, recibí pedidos y llegá a miles de clientes
            en Pucallpa. Sin costo de inscripción.
          </p>
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Link
              href="/abrir-tienda"
              className="group inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-8 py-4 text-base font-bold shadow-lg hover:bg-[var(--accent)] hover:gap-3 transition-all"
            >
              <Store className="h-4 w-4" strokeWidth={1.75} />
              Registrá tu tienda gratis
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

      {/* Footer vive en el layout `/tiendas/layout.tsx` (persistente). */}
    </div>
  );
}
