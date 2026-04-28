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
import MarketplaceStoresView from "@/components/marketplace/MarketplaceStoresView";
import { deriveActiveZones } from "@/lib/marketplace-zones";
import {
  useMarketplaceGeo,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";
import RecommendationsStrip from "@/components/marketplace/explorar/RecommendationsStrip";
import ExplorarTracker from "@/components/marketplace/explorar/ExplorarTracker";
import MarketplaceFilters, {
  type MarketplaceFiltersState,
} from "@/components/marketplace/MarketplaceFilters";
import { Boxes, Package, CupSoda, Sparkles, Leaf, MoreHorizontal } from "lucide-react";
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
import TiendasPromoCards from "@/components/marketplace/TiendasPromoCards";
import TiendasMainCategoriesGrid from "@/components/marketplace/TiendasMainCategoriesGrid";
import TiendasHeroAds from "@/components/marketplace/TiendasHeroAds";
import TiendasSectionHeader from "@/components/marketplace/TiendasSectionHeader";
import MisPedidosFavoritosStrip from "@/components/marketplace/MisPedidosFavoritosStrip";
import RepetirUltimoPedido from "@/components/marketplace/RepetirUltimoPedido";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
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

// Mapa icono por categoría de producto — coherencia visual con la row de Zona
const PRODUCT_CATEGORY_ICONS: Record<string, typeof Boxes> = {
  todos: Boxes,
  abarrotes: Package,
  bebidas: CupSoda,
  limpieza: Sparkles,
  frescos: Leaf,
  otros: MoreHorizontal,
};

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

  // ── Subcategorías dinámicas (alimentadas desde superadmin) ──
  interface SubCategoryOption {
    id: string;
    categoryId: string;
    label: string;
    description: string;
    imageUrl: string | null;
    linkedStoreSlugs: string[];
  }
  const [subcategories, setSubcategories] = useState<SubCategoryOption[]>([]);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(
    () => searchParams.get("subcat") ?? null,
  );

  // Fetch subcategorías cuando cambia la categoría principal
  useEffect(() => {
    const ctrl = new AbortController();
    const url =
      category === "todos"
        ? "/api/marketplace/subcategories"
        : `/api/marketplace/subcategories?category=${encodeURIComponent(category)}`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { subcategories: [] }))
      .then((j) => {
        const subs = (j.subcategories ?? []) as SubCategoryOption[];
        setSubcategories(subs);
        // Si la subcategoría seleccionada ya no existe en este filtro, limpiarla
        if (subCategoryId && !subs.some((s) => s.id === subCategoryId)) {
          setSubCategoryId(null);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSubcategories([]);
      });
    return () => ctrl.abort();
  }, [category, subCategoryId]);

  const activeSubcategory = subCategoryId
    ? subcategories.find((s) => s.id === subCategoryId) ?? null
    : null;
  const linkedStoreSlugsForSub = activeSubcategory?.linkedStoreSlugs ?? null;

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
    if (subCategoryId) params.set("subcat", subCategoryId);
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    router.replace(next, { scroll: false });
  }, [search, category, zone, sortKey, activeChips, viewMode, subCategoryId, pathname, router, initialZone]);

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

  // Back-nav recovery — cuando el usuario navega a una tienda (/t/[slug]) y
  // vuelve atrás, Next.js puede restaurar el árbol cliente con state stale
  // (stores=[] y loading=false porque la fetch fue abortada por el unmount
  // anterior). Cubrimos 3 caminos:
  //  1. popstate: back/forward del browser dentro de la SPA
  //  2. pageshow persisted=true: bfcache del browser (mobile Safari/Firefox)
  //  3. visibilitychange: usuario vuelve a la pestaña tras dormir el equipo
  // En todos los casos: si stores está vacío, forzamos refresh + retry.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const retry = () => {
      setLoading(false);
      setRetryKey((k) => k + 1);
      // router.refresh limpia el cache del segment del App Router, lo que
      // garantiza que cualquier dato cacheado server-side también se renueve.
      try { router.refresh(); } catch {}
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) retry();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && stores.length === 0 && !loading) {
        retry();
      }
    };
    window.addEventListener("popstate", retry);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("popstate", retry);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Mount-time recovery — si llegamos al render con stores vacío y loading
  // false (state stuck de un mount anterior), disparamos retry inmediato.
  useEffect(() => {
    if (stores.length === 0 && !loading && !error) {
      setRetryKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety net — si tras 4.5s no hay stores ni error declarado, asumimos
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

  // ── Zonas del filtro: SOLO las que tienen tiendas reales (no inventamos) ──
  // Si stores aún no cargó, mostramos sólo el item "Todas las zonas".
  const zonesForFilter = deriveActiveZones(
    stores.map((s) => ({ zone: (s as { zone?: string }).zone })),
  );

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

  // Filtrado por subcategoría (cuando tiene tiendas vinculadas)
  const finalStores = (() => {
    if (!subCategoryId || !linkedStoreSlugsForSub || linkedStoreSlugsForSub.length === 0) {
      return sortedStores;
    }
    const slugSet = new Set(linkedStoreSlugsForSub);
    return sortedStores.filter((s) => slugSet.has(s.slug));
  })();

  const hasFilters =
    category !== "todos" ||
    zone ||
    geoActive ||
    activeChips.size > 0 ||
    search.trim().length > 0 ||
    sortKey !== "relevance" ||
    subCategoryId !== null;

  // ── TS-47 breadcrumb: zona como label legible ──
  const zonaLabel = zone
    ? zonesForFilter.find((z) => z.id === zone)?.label
    : undefined;

  const navMode = useMarketplaceNavMode();
  const isTiendasOnly = navMode === "tiendas-only";

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="tiendas_directorio" />

      {/* ── TS-47 breadcrumb visible + JSON-LD ──────────────────────────────
           Oculto en modo `tiendas-only` — el link "Inicio" llevaría
           fuera del contexto de tienda y confundiría al usuario. */}
      {!isTiendasOnly && <TiendasBreadcrumb zonaLabel={zonaLabel} />}

      {/* ── Header compacto: ubicación + buscador inline ─────────────────
           Reemplaza el hero editorial gigante. Estilo PedidosYa: data-density
           > storytelling. La marca se siente vía paleta + tipografía, no
           vía H1 magazine. */}
      <section className="border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <MapPin className="h-4 w-4" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)] leading-none">
                  Tu ubicación
                </p>
                <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5 truncate">
                  Pucallpa · Ucayali
                </p>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <SearchAutocomplete
                onSearch={setSearch}
                placeholder="¿Qué buscás hoy? Bodega, farmacia, restaurante…"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Banner rotante de promos (gestionado desde superadmin) ─────
           Aparece solo cuando NO hay búsqueda activa para no competir
           con el hero de resultados. */}
      {search.trim().length === 0 && <TiendasHeroAds />}

      {/* ── Hero de resultados de búsqueda — solo cuando hay query activa ─
           Da prioridad visual a la tienda buscada antes de las secciones
           promocionales. Especialmente útil en modo tiendas-only. */}
      {search.trim().length > 0 && stores.length > 0 && (
        <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-5 sm:p-6">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)] mb-1">
                  Resultados para tu búsqueda
                </p>
                <h2 className="text-xl sm:text-2xl font-black tracking-[-0.015em] text-[var(--text-primary)]">
                  &quot;{search.trim()}&quot;{" "}
                  <span className="text-[var(--text-tertiary)] font-bold text-base">
                    · {stores.length} {stores.length === 1 ? "tienda" : "tiendas"}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
              >
                Limpiar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stores.slice(0, 3).map((s) => (
                <Link
                  key={s.id}
                  href={`/tienda/${s.slug}`}
                  className="group flex items-center gap-3 rounded-xl bg-[var(--surface-canvas)] border border-[var(--rule-soft)] p-3 hover:border-[var(--accent)] hover:shadow-md transition-all"
                >
                  <div
                    className="h-14 w-14 shrink-0 rounded-xl overflow-hidden flex items-center justify-center bg-[var(--accent-soft)]"
                  >
                    {s.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.logo}
                        alt={s.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Store
                        className="h-6 w-6 text-[var(--accent)]"
                        strokeWidth={1.75}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {s.name}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">
                      {(s as { zone?: string }).zone ?? s.category ?? "Pucallpa"}
                    </p>
                  </div>
                  <ArrowUpRight
                    className="h-4 w-4 text-[var(--accent)] shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    strokeWidth={2.25}
                  />
                </Link>
              ))}
            </div>
            {stores.length > 3 && (
              <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                Hay {stores.length - 3} resultados más en el listado de abajo.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── 2 cards promocionales con paleta Buleje ──────────────────── */}
      {search.trim().length === 0 && <TiendasPromoCards />}

      {/* ── Mis tiendas favoritas — solo activa con 5+ pedidos en 5+ tiendas ── */}
      <MisTiendasFavoritasStrip />

      {/* ── Tus tiendas frecuentes ──────────────────────────────────── */}
      <TusTiendasStrip />

      {/* ── Hero "Repetir último pedido" — solo si hay historial ───────── */}
      {search.trim().length === 0 && <RepetirUltimoPedido />}

      {/* ── Pedidos favoritos del cliente (localStorage) ──────────────── */}
      <MisPedidosFavoritosStrip />

      {/* ── Recomendadas / destacadas (carrusel) ─────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12">
        <TiendasSectionHeader
          eyebrow="Más pedidas"
          title="Las que tus vecinos eligen"
        />
        <RecommendationsStrip />
      </section>

      {/* ── Grid de Categorías principales (cajas grandes con imagen) ─
           Click filtra el grid de "Todas las tiendas" más abajo. */}
      <TiendasMainCategoriesGrid selected={category} onSelect={setCategory} />

      {/* ── Filtros + Grid — directo, sin hero pesado ─────────────────── */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12 pb-10">
        <div className="mb-3">
          <TiendasSectionHeader
            eyebrow="Todas las tiendas"
            title="Filtrá y elegí"
          />
          {!isTiendasOnly && (
            <div className="mt-1">
              <QuickFilterChips activeChips={activeChips} onToggle={handleChipToggle} />
            </div>
          )}
        </div>

        {/* Filtros: Tipo de producto + Zona en cajitas grandes
             (mismo formato visual). La categoría de tienda ya vive
             en la grid principal de Categorías arriba. */}
        <div className="space-y-3 mb-4">
          {/* Subcategoría = cajitas grandes con imagen (gestionadas desde superadmin) */}
          {subcategories.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">
                Subcategoría
              </p>
              <div
                role="group"
                aria-label="Filtrar por subcategoría"
                className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1"
              >
                {/* Botón "Todas" */}
                <button
                  onClick={() => setSubCategoryId(null)}
                  aria-pressed={subCategoryId === null}
                  className={cn(
                    "shrink-0 inline-flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all px-3 py-2.5 min-w-[88px]",
                    subCategoryId === null
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                  )}
                >
                  <span
                    className={cn(
                      "h-9 w-9 rounded-lg flex items-center justify-center",
                      subCategoryId === null
                        ? "bg-[var(--accent)] text-white"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                    )}
                  >
                    <Boxes className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-bold leading-tight text-center",
                      subCategoryId === null
                        ? "text-[var(--accent)]"
                        : "text-[var(--text-primary)]",
                    )}
                  >
                    Todas
                  </span>
                </button>

                {subcategories.map((s) => {
                  const active = subCategoryId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSubCategoryId(active ? null : s.id)}
                      aria-pressed={active}
                      title={s.description || s.label}
                      className={cn(
                        "shrink-0 inline-flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all px-3 py-2.5 min-w-[88px]",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                      )}
                    >
                      <span
                        className={cn(
                          "h-9 w-9 rounded-lg overflow-hidden flex items-center justify-center",
                          active
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                        )}
                      >
                        {s.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.imageUrl}
                            alt={s.label}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Boxes className="h-4 w-4" strokeWidth={2} aria-hidden />
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-bold leading-tight text-center max-w-[120px] truncate",
                          active
                            ? "text-[var(--accent)]"
                            : "text-[var(--text-primary)]",
                        )}
                      >
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Zonas = cajitas chicas */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">
              Filtrar por zona
            </p>
            <div
              role="group"
              aria-label="Filtrar por zona"
              className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1"
            >
              {zonesForFilter.map((z) => {
                const active = zone === z.id;
                return (
                  <button
                    key={z.id || "todas"}
                    onClick={() => setZone(z.id)}
                    aria-pressed={active}
                    className={cn(
                      "shrink-0 inline-flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all px-3 py-2.5 min-w-[88px]",
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                    )}
                  >
                    <span
                      className={cn(
                        "h-9 w-9 rounded-lg flex items-center justify-center text-[10px] font-black tracking-tight",
                        active ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                      )}
                    >
                      <MapPin className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-bold leading-tight text-center",
                        active ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
                      )}
                    >
                      {z.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Fila de acciones inline · rediseñada (mas grande, DS tokens) ──
               Toolbar superior tipo PedidosYa: chips grandes, mejor jerarquía
               visual y separación clara entre filtros / vista / acción de
               limpiar. Usa surface-raised + ruler base para aterrizar contra
               el canvas. */}
          <div
            role="toolbar"
            aria-label="Filtros y vista de tiendas"
            className="flex items-center gap-3 flex-wrap rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm"
          >
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <MarketplaceFilters
                filters={productFilters}
                userCoords={userCoords}
                geoLoading={geoLoading}
                onChange={handleFiltersChange}
                onRequestGeo={handleGeoSort}
                hideProductCategory
              />

              <span aria-hidden className="hidden sm:inline-block h-7 w-px bg-[var(--rule-soft)]" />

              <StoresSortSelector value={sortKey} onChange={setSortKey} />
            </div>

            <div
              role="group"
              aria-label="Cambiar entre vista lista y mapa"
              className="inline-flex items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-1 shrink-0"
            >
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-all",
                  viewMode === "list"
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <List className="h-4 w-4" strokeWidth={2} aria-hidden />
                Lista
              </button>
              <button
                type="button"
                onClick={() => setViewMode("map")}
                aria-pressed={viewMode === "map"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-all",
                  viewMode === "map"
                    ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <MapIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                Mapa
              </button>
            </div>

            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("todos");
                  setZone("");
                  setSubCategoryId(null);
                  setGeoActive(false);
                  setUserCoords(null);
                  setProductFilters(DEFAULT_FILTERS);
                  setActiveChips(new Set());
                  setSortKey("relevance");
                }}
                aria-label="Limpiar todos los filtros activos"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-1.5 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-all shrink-0"
              >
                Limpiar todo
              </button>
            )}
          </div>
        </div>

        {/* Listado de tiendas */}
        {viewMode === "map" ? (
          <TiendasMap stores={finalStores} />
        ) : (
          <MarketplaceStoresView
            stores={stores}
            loading={loading}
            error={error}
            search={search}
            category={category}
            zone={zone}
            geoActive={geoActive}
            filteredStores={finalStores}
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

      {/* ── CTA bodegueros — compacto, banda single-row ───────────────── */}
      <section className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="max-w-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)] mb-1.5">
                Para bodegueros
              </p>
              <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
                ¿Tenés una tienda? <span className="text-[var(--accent)]">Sumate gratis.</span>
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Publicá productos, recibí pedidos y llegá a miles de clientes en Pucallpa.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 shrink-0">
              <Link
                href="/abrir-tienda"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-5 py-2.5 text-sm font-bold hover:gap-2.5 hover:shadow-md transition-all"
              >
                <Store className="h-4 w-4" strokeWidth={1.75} />
                Registrar tienda
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} />
              </Link>
              <Link
                href="/abrir-tienda#planes"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
              >
                Ver planes
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer vive en el layout `/tiendas/layout.tsx` (persistente). */}
    </div>
  );
}
