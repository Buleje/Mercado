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

  const hasFilters =
    category !== "todos" || zone || geoActive || activeChips.size > 0 || search.trim().length > 0;

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="tiendas_directorio" />

      {/* ── Hero editorial compacto — reemplaza el banner promocional ─── */}
      <section className="relative overflow-hidden border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 h-[400px] w-[400px] rounded-full bg-[var(--accent)]/[0.06] blur-3xl"
        />
        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-14 sm:pt-20 pb-10">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-5">
            <span
              aria-hidden
              className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
            />
            <MapPin className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Directorio · Pucallpa
          </p>
          <h1 className="text-[clamp(2.25rem,6vw,4.25rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.95] max-w-4xl">
            Las bodegas del barrio,
            <br />
            <span className="italic font-serif text-[var(--accent)]">
              al alcance de un clic.
            </span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-[1.45] max-w-2xl">
            Bodegas, minimarkets, farmacias y más — filtrá por zona, categoría o cercanía,
            y recibí en {" "}
            <span className="text-[var(--text-primary)] font-bold">25 min</span>.
          </p>

          {/* Search + chips — parte del hero, no sección aparte */}
          <div className="mt-8 max-w-2xl">
            <SearchAutocomplete
              onSearch={setSearch}
              placeholder="Buscar bodega, minimarket, farmacia..."
            />
          </div>
          <div className="mt-4">
            <QuickFilterChips activeChips={activeChips} onToggle={handleChipToggle} />
          </div>
        </div>
      </section>

      {/* ── Destacadas — solo si hay recomendaciones ──────────────────── */}
      <RevealOnScroll>
        <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16">
          <div className="flex items-end justify-between gap-6 mb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-2">
                Destacadas
              </p>
              <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
                Las que más piden tus vecinos
              </h2>
            </div>
            <p className="hidden sm:block text-sm text-[var(--text-tertiary)] max-w-xs text-right">
              Curado por volumen de pedidos y cercanía.
            </p>
          </div>
          <RecommendationsStrip />
        </section>
      </RevealOnScroll>

      {/* ── Filtros + Grid — sin 2do header editorial, directo al browse ── */}
      <section className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-12">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-2">
            Todas las tiendas
          </p>
          <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
            Filtrá y elegí la que más te convenga
          </h2>
        </div>

        {/* Sticky filter cluster — categoria pills + zona + filtros en 1 fila */}
        <div className="sticky top-[60px] z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-[var(--surface-canvas)]/95 backdrop-blur border-y border-[var(--rule-soft)] mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div
              role="group"
              aria-label="Filtrar por categoría de tienda"
              className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0"
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
                      "relative inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors shrink-0",
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

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                aria-label="Filtrar por zona"
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-bold tabular-nums outline-none transition-colors",
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

              <MarketplaceFilters
                filters={productFilters}
                userCoords={userCoords}
                geoLoading={geoLoading}
                onChange={handleFiltersChange}
                onRequestGeo={handleGeoSort}
              />

              {hasFilters && (
                <button
                  onClick={() => {
                    setSearch("");
                    setCategory("todos");
                    setZone("");
                    setGeoActive(false);
                    setUserCoords(null);
                    setProductFilters(DEFAULT_FILTERS);
                    setActiveChips(new Set());
                  }}
                  aria-label="Limpiar todos los filtros activos"
                  className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors px-2"
                >
                  Limpiar
                </button>
              )}
            </div>
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
            ¿Tienes una tienda?
            <br />
            <span className="italic font-serif text-[var(--accent)]">
              Sumate gratis.
            </span>
          </h2>
          <p className="mt-8 text-xl sm:text-2xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-[1.4]">
            Publica tus productos, recibe pedidos y llegá a miles de clientes
            en Pucallpa. Sin costo de inscripción.
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

      {/* Footer vive en el layout `/tiendas/layout.tsx` (persistente). */}
    </div>
  );
}
