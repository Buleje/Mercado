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

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Store, MapPin, ArrowUpRight, List, Map as MapIcon } from "@buleje/design-system/icons";
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
import StoresSortSelector, {
  loadStoredSort,
  type StoresSortKey,
} from "@/components/marketplace/StoresSortSelector";
import TusTiendasStrip from "@/components/marketplace/TusTiendasStrip";
import MisTiendasFavoritasStrip from "@/components/marketplace/MisTiendasFavoritasStrip";
import TiendasBreadcrumb from "@/components/marketplace/TiendasBreadcrumb";
import dynamic from "next/dynamic";

const TiendasMap = dynamic(() => import("@/components/marketplace/TiendasMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[60vh] min-h-[400px] rounded-xl border border-dashed border-[var(--rule-soft)] flex items-center justify-center text-sm text-[var(--text-tertiary)]">
      Cargando mapa…
    </div>
  ),
});

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

interface TiendasClientProps {
  /** Zona prefijada por la ruta SSG `/tiendas/[zona]`. Override de query params. */
  initialZone?: string;
}

export default function TiendasClient({ initialZone }: TiendasClientProps = {}) {
  // ── TS-26 URL sync — leer estado inicial de query params ──
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialSyncDone = useRef(false);

  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [category, setCategory] = useState(
    () => searchParams.get("cat") ?? "todos",
  );
  const [zone, setZone] = useState(
    () => initialZone ?? searchParams.get("zona") ?? "",
  );
  const [productFilters, setProductFilters] =
    useState<MarketplaceFiltersState>(DEFAULT_FILTERS);

  // ── Quick-filter chips ──
  const [activeChips, setActiveChips] = useState<Set<QuickChipId>>(() => {
    const raw = searchParams.get("chips");
    if (!raw) return new Set();
    return new Set(
      raw.split(",").filter(Boolean) as QuickChipId[],
    );
  });

  const handleChipToggle = useCallback((chipId: QuickChipId) => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(chipId)) next.delete(chipId);
      else next.add(chipId);
      return next;
    });
  }, []);

  // ── TS-04 vista lista/mapa ──
  const [viewMode, setViewMode] = useState<"list" | "map">(() => {
    const v = searchParams.get("view");
    return v === "map" ? "map" : "list";
  });

  // ── TS-22 Sort selector (con persistencia) ──
  const [sortKey, setSortKey] = useState<StoresSortKey>(() => {
    const fromUrl = searchParams.get("sort");
    if (fromUrl) return fromUrl as StoresSortKey;
    return "relevance";
  });
  useEffect(() => {
    // Hidratar desde localStorage solo si la URL no trae sort
    if (!searchParams.get("sort")) {
      setSortKey(loadStoredSort());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TS-26 URL sync — escribir back cuando cambia el estado ──
  useEffect(() => {
    if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      return;
    }
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (category !== "todos") params.set("cat", category);
    // En /tiendas/[zona] no duplicamos zona en la query — viene del path.
    if (zone && zone !== initialZone) params.set("zona", zone);
    if (sortKey !== "relevance") params.set("sort", sortKey);
    if (activeChips.size > 0) params.set("chips", [...activeChips].join(","));
    if (viewMode === "map") params.set("view", "map");
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    router.replace(next, { scroll: false });
  }, [search, category, zone, sortKey, activeChips, viewMode, pathname, router, initialZone]);

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

  // Retry counter — bump para re-ejecutar el useEffect del fetch
  const [retryKey, setRetryKey] = useState(0);

  // Fetch con AbortController — cancela request previa si el user sigue
  // tipeando/filtrando. Debounce 300ms unificado (no solo en search) para
  // reducir requests cuando cambian multiples filtros rapido.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (category !== "todos") params.set("category", category);
        if (zone) params.set("zone", zone);
        if (search.trim()) params.set("search", search.trim());
        params.set("limit", "50");

        const res = await fetch(`/api/marketplace/stores?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Error cargando tiendas");
        const json = await res.json();
        if (!controller.signal.aborted) {
          setStores(json.data ?? []);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("No pudimos cargar las tiendas. Intentá de nuevo.");
        }
        // Importante: NO retornamos en AbortError — caemos al setLoading(false)
        // de abajo (sin el guard) para que el state no se quede stuck en
        // loading=true cuando el browser nos vuelve a renderizar.
      }
      // Reset loading siempre — si el component fue unmount, el setState es
      // no-op silencioso (React 18+); si fue preservado por router cache,
      // queremos liberar el flag para que el retry-on-mount funcione.
      setLoading(false);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, category, zone, retryKey]);

  const fetchStores = useCallback(() => setRetryKey((k) => k + 1), []);

  // Back-nav recovery — Next.js puede rehidratar el client component con
  // state previo (loading=true, stores=[]) si la fetch anterior fue abortada
  // por el cleanup del unmount. popstate/pageshow cubren back-nav del browser.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const retry = () => {
      setLoading(false);
      setRetryKey((k) => k + 1);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) retry();
    };
    window.addEventListener("popstate", retry);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", retry);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // Safety net — si tras 4s no hay stores ni error declarado, asumimos
  // rehidratación con state stuck y forzamos full page reload. Peor caso
  // UX puntual pero el cliente NUNCA ve un skeleton infinito.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const safety = setTimeout(() => {
      if (stores.length === 0 && !error && !loading) {
        window.location.reload();
      }
    }, 4500);
    return () => clearTimeout(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TS-22 sort: deriva la lista ordenada de filteredStores ──
  const sortedStores = (() => {
    if (sortKey === "relevance") return filteredStores;
    const arr = [...filteredStores];
    switch (sortKey) {
      case "delivery":
        arr.sort(
          (a, b) =>
            ((a as { deliveryMinutes?: number }).deliveryMinutes ?? 99) -
            ((b as { deliveryMinutes?: number }).deliveryMinutes ?? 99),
        );
        break;
      case "rating":
        arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case "distance":
        arr.sort(
          (a, b) =>
            ((a as { distanceKm?: number }).distanceKm ?? 999) -
            ((b as { distanceKm?: number }).distanceKm ?? 999),
        );
        break;
      case "newest":
        arr.sort((a, b) => {
          const aT = (a as { createdAt?: string | Date }).createdAt;
          const bT = (b as { createdAt?: string | Date }).createdAt;
          return new Date(bT ?? 0).getTime() - new Date(aT ?? 0).getTime();
        });
        break;
    }
    return arr;
  })();

  const hasFilters =
    category !== "todos" ||
    zone ||
    geoActive ||
    activeChips.size > 0 ||
    search.trim().length > 0 ||
    sortKey !== "relevance";

  // ── TS-47 breadcrumb: zona como label legible ──
  const zonaLabel = zone
    ? ZONES.find((z) => z.id === zone)?.label
    : undefined;

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="tiendas_directorio" />

      {/* ── TS-47 breadcrumb visible + JSON-LD ──────────────────────────── */}
      <TiendasBreadcrumb zonaLabel={zonaLabel} />

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

      {/* ── Mis tiendas favoritas — solo activa con 5+ pedidos en 5+ tiendas ── */}
      <MisTiendasFavoritasStrip />

      {/* ── TS-16 Tus tiendas frecuentes ──────────────────────────────── */}
      <TusTiendasStrip />

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

              <StoresSortSelector value={sortKey} onChange={setSortKey} />

              {/* TS-04 toggle vista lista/mapa */}
              <div
                role="group"
                aria-label="Cambiar entre vista lista y mapa"
                className="inline-flex items-center rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-0.5"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  aria-label="Vista lista"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
                    viewMode === "list"
                      ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <List className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Lista
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  aria-pressed={viewMode === "map"}
                  aria-label="Vista mapa"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors",
                    viewMode === "map"
                      ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <MapIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Mapa
                </button>
              </div>

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
                    setSortKey("relevance");
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
        {viewMode === "map" ? (
          <TiendasMap stores={sortedStores} />
        ) : (
          <MarketplaceStoresView
            stores={stores}
            loading={loading}
            error={error}
            search={search}
            category={category}
            zone={zone}
            geoActive={geoActive}
            filteredStores={sortedStores}
            activeChips={activeChips}
            onRetry={fetchStores}
            onClearAll={() => {
              setSearch("");
              setCategory("todos");
              setZone("");
              setGeoActive(false);
              setUserCoords(null);
              setSortKey("relevance");
            }}
          />
        )}
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
