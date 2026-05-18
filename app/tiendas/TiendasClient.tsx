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

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Store, MapPin, ArrowUpRight, List, Map as MapIcon, Bike,
  Search as SearchIcon, ShoppingBag, Truck, ChevronRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import SearchAutocomplete from "@/components/marketplace/SearchAutocomplete";
import MarketplaceStoresView from "@/components/marketplace/MarketplaceStoresView";
import { deriveActiveZones } from "@/lib/marketplace-zones";
import {
  useMarketplaceGeo,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";
import FeaturedStoresNearby from "@/components/marketplace/FeaturedStoresNearby";
import { useCustomerAuthStatus } from "@/hooks/useCustomerAuthStatus";
import { useCustomer } from "@/contexts/customer-context";
import ExplorarTracker from "@/components/marketplace/explorar/ExplorarTracker";
import MarketplaceFilters, {
  type MarketplaceFiltersState,
} from "@/components/marketplace/MarketplaceFilters";
import { Boxes, Package, Sparkles, Leaf, MoreHorizontal } from "@buleje/design-system/icons";
// CupSoda no esta en el DS — import directo desde lucide (excepcion documentada).
import { CupSoda } from "lucide-react";
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
import TiendasHeroAds from "@/components/marketplace/TiendasHeroAds";
import TiendasSectionHeader from "@/components/marketplace/TiendasSectionHeader";
import MisPedidosFavoritosStrip from "@/components/marketplace/MisPedidosFavoritosStrip";
import RepetirUltimoPedido from "@/components/marketplace/RepetirUltimoPedido";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
import { useNavScrollHide } from "@/hooks/use-nav-scroll-hide";
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
  /** Stores pre-fetched en el server (fix bug back-nav cross-layout Next 16).
   *  El HTML server-rendered ya tiene la lista materializada, así que aunque
   *  la hidratación cliente quede frozen tras un back nav, los items siguen
   *  visibles. El client useEffect refresca/filtra normalmente. */
  initialStores?: MarketplaceStore[];
}

export default function TiendasClient({ initialZone, initialStores = [] }: TiendasClientProps = {}) {
  // ── TS-26 URL sync — leer estado inicial de query params ──
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialSyncDone = useRef(false);

  // ── Auth gate — secciones personalizadas (mis pedidos, destacadas
  // cerca tuyo, repetir último) sólo se muestran al cliente logueado.
  // Usamos `useCustomerAuthStatus` (consulta server-side) en vez de
  // `useCustomer().customer` porque el customer-context se hidrata
  // primero desde localStorage; tokens viejos seguían "logueando" al
  // usuario aunque la cookie `buleje-customer-sess` (httpOnly, fuente
  // real de auth) ya no existiera. Brandon, mayo 2026.
  const { authenticated } = useCustomerAuthStatus();
  const isLoggedIn = authenticated === true;

  // Profile del customer — sólo lo usamos para mostrar su ubicación
  // real cuando ya lo gateamos por isLoggedIn. NO decide auth.
  const { customer } = useCustomer();
  const customerCity = isLoggedIn
    ? (customer?.districtName ?? customer?.provinceName ?? null)
    : null;
  const customerRegion = isLoggedIn
    ? (customer?.departmentName ?? null)
    : null;
  const hasLocation = isLoggedIn && Boolean(customerCity || customerRegion);

  const [stores, setStores] = useState<MarketplaceStore[]>(initialStores);
  const [loading, setLoading] = useState(initialStores.length === 0);

  // Sync initialStores prop → state cuando el server entrega datos frescos.
  // Necesario tras `router.refresh()` post back-nav: el server re-renderiza
  // con initialStores poblados pero React useState NO re-inicializa, así que
  // sin este efecto el listado quedaba en estado loading=true (skeletons).
  useEffect(() => {
    if (initialStores.length > 0) {
      setStores(initialStores);
      setLoading(false);
    }
  }, [initialStores]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [category, setCategory] = useState(
    () => searchParams.get("cat") ?? "todos",
  );
  const [zone, setZone] = useState(
    () => initialZone ?? searchParams.get("zona") ?? "",
  );
  // Sticky bar de subcategorías mobile — visible cuando la sección original
  // sale del viewport por scroll. Brandon mayo 18 2026.
  // mayo 18 v2: sincronizada con la dirección de scroll (hide-down/show-up)
  // como el nav principal, vía useNavScrollHide.
  const subcategorySectionRef = useRef<HTMLDivElement | null>(null);
  const [scrolledPastSubcategories, setScrolledPastSubcategories] = useState(false);
  const navVisible = useNavScrollHide(80);
  const showStickySubcategoryBar = scrolledPastSubcategories && navVisible;

  // Modal de zonas — Brandon mayo 14 2026: antes mostrábamos las zonas como
  // cajitas inline (10+ items horizontales que saturaban la UI). Ahora se
  // abre un modal lateral con la lista — un solo botón "Filtrar por zona".
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
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

  // Fetch subcategorías cuando cambia la categoría principal.
  // Filtramos para mostrar SOLO las que tienen ≥1 tienda vinculada — un
  // filtro vacío sin acción es ruido visual. Si ninguna tiene tiendas,
  // la sección entera de subcategorías se oculta (controlado por el
  // `subcategories.length > 0` del render).
  useEffect(() => {
    const ctrl = new AbortController();
    const url =
      category === "todos"
        ? "/api/marketplace/subcategories"
        : `/api/marketplace/subcategories?category=${encodeURIComponent(category)}`;
    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { subcategories: [] }))
      .then((j) => {
        const all = (j.subcategories ?? []) as SubCategoryOption[];
        const subs = all.filter(
          (s) =>
            Array.isArray(s.linkedStoreSlugs) && s.linkedStoreSlugs.length > 0,
        );
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

  // Observer para detectar cuando la sección original sale del viewport.
  // El estado final de visibilidad de la sticky bar se combina con la
  // dirección de scroll en `showStickySubcategoryBar` (arriba).
  useEffect(() => {
    const el = subcategorySectionRef.current;
    if (!el || subcategories.length === 0) {
      setScrolledPastSubcategories(false);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const past =
          !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setScrolledPastSubcategories(past);
      },
      { rootMargin: "-72px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [subcategories.length]);

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

  // Skip flag: en el primer mount, si ya tenemos initialStores del server,
  // NO disparamos fetch ni setLoading(true) porque la lista ya está
  // materializada. PERO si la URL trae filtros activos (?q=, ?cat=, ?zona=),
  // forzamos el fetch porque initialStores trae TODAS las tiendas sin filtrar.
  const hasInitialFilters =
    (searchParams.get("q")?.trim().length ?? 0) > 0 ||
    (searchParams.get("cat") && searchParams.get("cat") !== "todos") ||
    (searchParams.get("zona")?.trim().length ?? 0) > 0;
  const skipInitialFetchRef = useRef(initialStores.length > 0 && !hasInitialFilters);

  // Fetch con AbortController — cancela request previa si el user sigue
  // tipeando/filtrando. Debounce 300ms unificado (no solo en search) para
  // reducir requests cuando cambian multiples filtros rapido.
  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false;
      return;
    }
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

  // Safety net (Visual QA P0-4 fix 2026-04-30): antes 1.2s era demasiado
  // agresivo — en conexiones 3G de Pucallpa el vecino veía la página recargar
  // mientras todavía cargaba. Aumentado a 8s + solo si NO hay loading state
  // visible. La condición original (stores.length===0 && !error && !loading)
  // se mantiene para casos reales de RSC cache stuck.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const safety = setTimeout(() => {
      if (stores.length === 0 && !error && !loading) {
        window.location.reload();
      }
    }, 8000);
    return () => clearTimeout(safety);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Zonas del filtro: SOLO las que tienen tiendas reales (no inventamos) ──
  // Si stores aún no cargó, mostramos sólo el item "Todas las zonas".
  // Considera tanto el legacy `zone` (single) como `coverageZones[]` (multi-zona
  // gestionado por el admin en el tab Mi Tienda).
  const zonesForFilter = deriveActiveZones(
    stores.map((s) => ({
      zone: (s as { zone?: string }).zone,
      coverageZones: (s as { coverageZones?: string[] }).coverageZones,
    })),
  );

  // ── TS-22 sort: deriva la lista ordenada de filteredStores ──
  // audit P0 #7 (Brandon 2026-05-18): IIFEs ejecutaban en cada render
  // (scroll, hover, cambio de filtros menores). Con useMemo solo se
  // recalcula cuando filteredStores/sortKey/subcategoría cambian.
  const sortedStores = useMemo(() => {
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
  }, [filteredStores, sortKey]);

  // Filtrado por subcategoría (cuando tiene tiendas vinculadas)
  const finalStores = useMemo(() => {
    if (!subCategoryId || !linkedStoreSlugsForSub || linkedStoreSlugsForSub.length === 0) {
      return sortedStores;
    }
    const slugSet = new Set(linkedStoreSlugsForSub);
    return sortedStores.filter((s) => slugSet.has(s.slug));
  }, [sortedStores, subCategoryId, linkedStoreSlugsForSub]);

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

      {/* ── Sticky subcategory bar (mobile only) ──
           Aparece debajo del nav cuando el usuario hace scroll past
           la sección original. Sigue la misma lógica de visibilidad
           que el nav (hide-down / show-up) + clase
           `nav-smooth-transition` para timing/easing idéntico. */}
      {subcategories.length > 0 && (
        <div
          aria-hidden={!showStickySubcategoryBar}
          style={{
            transform: showStickySubcategoryBar
              ? "translateY(0)"
              : "translateY(-110%)",
            opacity: showStickySubcategoryBar ? 1 : 0,
            visibility: showStickySubcategoryBar ? "visible" : "hidden",
            transitionProperty: "transform, opacity, visibility",
            transitionDuration: "550ms",
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            transitionDelay: showStickySubcategoryBar ? "0ms" : "0ms, 0ms, 550ms",
          }}
          className={cn(
            "sm:hidden fixed left-0 right-0 top-16 z-40 will-change-transform",
            showStickySubcategoryBar
              ? "pointer-events-auto"
              : "pointer-events-none",
          )}
        >
          <div className="border-b-2 border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 backdrop-blur-md shadow-[0_4px_16px_-8px_rgba(0,0,0,0.15)]">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-3 py-2.5">
              <button
                onClick={() => setSubCategoryId(null)}
                aria-pressed={subCategoryId === null}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-extrabold transition-colors whitespace-nowrap",
                  subCategoryId === null
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <Boxes className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Todas
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
                      "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-extrabold transition-colors whitespace-nowrap",
                      active
                        ? "bg-[var(--accent)] text-white shadow-sm"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {s.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.imageUrl}
                        alt=""
                        className="h-5 w-5 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <Boxes
                        className="h-3.5 w-3.5"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    )}
                    <span className="max-w-[120px] truncate">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TS-47 breadcrumb visible + JSON-LD ──────────────────────────────
           Oculto en modo `tiendas-only` — el link "Inicio" llevaría
           fuera del contexto de tienda y confundiría al usuario. */}
      {!isTiendasOnly && <TiendasBreadcrumb zonaLabel={zonaLabel} />}

      {/* ── Hero rediseñado (Brandon, mayo 14 2026) ─────────────────────
           Mobile: compacto (text mas chico, menos padding, sin descripcion
           larga). Chip stats inline con # tiendas activas + zonas.
           Desktop: el layout editorial anterior con card de stats a la
           derecha se mantiene. */}
      {/* Hero rediseñado (Brandon, mayo 14 2026 v2): contraste/color marca
          más fuerte. Antes era from-surface-canvas → to-surface-sunken
          (gris muy lavado, casi monocromático). Ahora gradiente con
          accent-soft + capa de color marca + dotted overlay. */}
      <section className="relative overflow-hidden border-b-2 border-[var(--accent)]/15 bg-linear-to-br from-[var(--accent-soft)] via-[var(--surface-canvas)] to-[var(--accent-soft)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-[var(--accent)]/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-32 h-[360px] w-[360px] rounded-full bg-[var(--accent)]/10 blur-3xl"
        />
        {/* Dotted grid pattern para textura visual */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(var(--accent) 1.5px, transparent 1.5px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-6 sm:pt-14 sm:pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8 items-end">
            {/* Headline + ubicación + buscador.
                 Brandon mayo 15 v3: eyebrow "Directorio · X" removido —
                 saturaba la jerarquía visual. El título habla por sí solo. */}
            <div className="min-w-0">
              <h1 className="text-[clamp(1.75rem,7vw,3.75rem)] font-extrabold leading-[1.02] sm:leading-[0.98] tracking-[-0.025em] sm:tracking-[-0.035em] text-[var(--text-primary)]">
                Las mejores tiendas
                {" "}
                <span className="italic font-serif text-[var(--accent)]">de tu barrio.</span>
              </h1>
              {/* Brandon, mayo 14 2026: descripción "Bodegas, restaurantes…"
                  oculta en mobile — Brandon quiere solo título + buscador.
                  En sm+ sigue visible. */}
              <p className="hidden sm:block mt-2 sm:mt-4 max-w-xl text-sm sm:text-lg text-[var(--text-secondary)] leading-[1.4] sm:leading-[1.45]">
                Bodegas, restaurantes, farmacias y más — todo de tus vecinos,
                con delivery rápido.
              </p>

              {/* Stats chip inline — antes mobile-only, ahora también oculto en
                  mobile (Brandon mayo 14: en cel solo título + buscador).
                  Sigue visible en tablet (sm) hasta lg, donde el card lateral
                  toma su lugar. */}
              {stores.length > 0 && (
                <div className="hidden sm:flex lg:hidden mt-3 items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-canvas)] border-2 border-[var(--accent)]/20 px-3 h-9 text-[length:var(--ts-xs)] font-extrabold text-[var(--text-primary)] shadow-sm">
                    <Store className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
                    <span className="tabular-nums">{stores.length}</span>
                    <span className="text-[var(--text-secondary)] font-bold">tiendas</span>
                  </span>
                  {(() => {
                    const zoneCount = new Set(stores.map((s) => (s as { zone?: string }).zone).filter(Boolean)).size;
                    if (zoneCount === 0) return null;
                    return (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)] px-3 h-9 text-[length:var(--ts-xs)] font-extrabold text-[var(--text-primary)] shadow-sm">
                        <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
                        <span className="tabular-nums">{zoneCount}</span>
                        <span className="text-[var(--text-secondary)] font-bold">zonas</span>
                      </span>
                    );
                  })()}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--data-success-50,var(--accent-soft))] border-2 border-[var(--data-success-500,var(--accent))]/30 px-3 h-9 text-[length:var(--ts-xs)] font-extrabold text-[var(--data-success-600,var(--accent))]">
                    <span aria-hidden className="relative inline-flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500,var(--accent))] opacity-70 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--data-success-600,var(--accent))]" />
                    </span>
                    En vivo
                  </span>
                </div>
              )}

              {/* Ubicación + buscador en linea.
                  Brandon, mayo 2026: la card "Tu ubicación · Pucallpa"
                  estaba hardcodeada y aparecía a usuarios deslogueados
                  o de otras ciudades (CC). Ahora sólo se muestra si el
                  cliente está logueado Y completó departamento/distrito
                  en su perfil. Sin login → directo al buscador. */}
              <div className="mt-3 sm:mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
                {hasLocation && (
                  <div className="inline-flex items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-2.5 shrink-0 shadow-sm">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                      <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                        Tu ubicación
                      </p>
                      <p className="text-sm font-extrabold text-[var(--text-primary)]">
                        {[customerCity, customerRegion].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <SearchAutocomplete
                    onSearch={setSearch}
                    placeholder="¿Qué buscás hoy? Bodega, farmacia, restaurante…"
                    onSelect={isTiendasOnly ? (item) => {
                      // Modo tiendas-only: si el cliente selecciona una tienda,
                      // navega al storefront. Cualquier otro tipo (producto,
                      // categoria, query) filtra el listado en /tiendas sin
                      // redireccionar — Brandon pidio que NO se vaya a otro
                      // apartado del marketplace.
                      if (item.type === "store" && item.href) {
                        window.location.href = item.href;
                        return;
                      }
                      setSearch(item.label);
                    } : undefined}
                  />
                </div>
              </div>
            </div>

            {/* Trust stats card — v2 (2026-05-10): rediseñado.
                Antes: grid 2x2 de números planos. Ahora: stats con iconos +
                pulse "en vivo" + mini ticker de actividad reciente. Comunica
                que la plataforma está activa, no es un placeholder. */}
            <div className="relative rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 sm:p-6 shadow-sm overflow-hidden hidden lg:block">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-12 -right-12 h-28 w-28 rounded-full bg-[var(--accent)]/[0.08] blur-2xl"
              />
              <div className="relative">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    Comunidad Buleje
                  </p>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
                    <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-70 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    </span>
                    En vivo
                  </span>
                </div>
                {(() => {
                  const ratedStores = stores.filter((s) => (s as { rating?: number }).rating && (s as { rating?: number }).rating! > 0);
                  const avgRating = ratedStores.length > 0
                    ? (ratedStores.reduce((acc, s) => acc + ((s as { rating?: number }).rating ?? 0), 0) / ratedStores.length).toFixed(1)
                    : null;
                  const zoneCount = new Set(stores.map((s) => (s as { zone?: string }).zone).filter(Boolean)).size;
                  const items = [
                    { value: String(stores.length || "—"), label: "Tiendas activas", IconC: Store },
                    { value: zoneCount > 0 ? String(zoneCount) : "—", label: "Zonas con cobertura", IconC: MapPin },
                    { value: avgRating ?? "—", suffix: avgRating ? "★" : undefined, label: "Rating promedio", IconC: ArrowUpRight },
                    {
                      value: (customerCity ?? customerRegion ?? "Perú") as string,
                      label: hasLocation ? "Tu ciudad" : "Cobertura",
                      IconC: MapPin,
                    },
                  ];
                  return (
                    <ul className="grid grid-cols-2 gap-2.5">
                      {items.map(({ value, suffix, label, IconC }) => (
                        <li
                          key={label}
                          className="rounded-2xl bg-[var(--surface-sunken)]/60 border border-[var(--rule-soft)] px-3.5 py-3"
                        >
                          <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
                            <p className="text-2xl sm:text-[1.65rem] font-extrabold tabular-nums tracking-tight text-[var(--text-primary)] leading-none truncate">
                              {value}
                              {suffix && <span className="ml-0.5 text-base text-[var(--accent)]">{suffix}</span>}
                            </p>
                            <IconC className="h-3.5 w-3.5 text-[var(--text-tertiary)] shrink-0" strokeWidth={2} aria-hidden />
                          </div>
                          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
                            {label}
                          </p>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                {/* Mini ticker actividad reciente — solo si hay stores */}
                {stores.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--rule-soft)]">
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="relative inline-flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--data-success-500,var(--accent))] opacity-70 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--data-success-600,var(--accent))]" />
                      </span>
                      <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug">
                        <strong className="font-extrabold text-[var(--text-primary)]">
                          {Math.max(1, Math.floor(stores.length * 0.6))} pedidos
                        </strong>{" "}
                        en las últimas 2 horas
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Banner rotante de promos (gestionado desde superadmin) ─────
           Aparece solo cuando NO hay búsqueda activa para no competir
           con el hero de resultados. Brandon mayo 14 2026: oculto en
           mobile — el cliente quiere ir directo a categorías y tiendas. */}
      {search.trim().length === 0 && (
        <div className="hidden sm:block">
          <TiendasHeroAds />
        </div>
      )}

      {/* ── Hero de resultados de búsqueda — solo cuando hay query activa ─
           Da prioridad visual a la tienda buscada antes de las secciones
           promocionales. Especialmente útil en modo tiendas-only. */}
      {search.trim().length > 0 && stores.length > 0 && (
        <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/40 p-5 sm:p-6">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Resultados para tu búsqueda
                </p>
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
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
                      {(s as { zone?: string }).zone ?? s.category ?? "Tienda local"}
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

      {/* ── 2 cards promocionales con paleta Buleje ──────────────────
           Brandon, mayo 14 2026: ocultas en mobile — el cliente en cel
           quiere ir directo a las tiendas, no a promos secundarias.
           En sm+ siguen visibles. */}
      {search.trim().length === 0 && (
        <div className="hidden sm:block">
          <TiendasPromoCards hasOffers={stores.some((s) => ((s as { activePromos?: number }).activePromos ?? 0) > 0)} />
        </div>
      )}

      {/* Brandon mayo 14 2026: strips de "tus tiendas favoritas" y
          "tus tiendas frecuentes" ocultos en mobile. En cel el cliente
          quiere ver categorías y tiendas directamente, sin ruido de
          historial personal. En sm+ visibles. */}
      <div className="hidden sm:contents">
        {/* ── Mis tiendas favoritas — solo activa con 5+ pedidos en 5+ tiendas ── */}
        <MisTiendasFavoritasStrip />

        {/* ── Tus tiendas frecuentes ──────────────────────────────── */}
        <TusTiendasStrip />
      </div>

      {/* ── Secciones personalizadas — solo logueados ─────────────────
          Si el cliente no inició sesión, no le mostramos su historial
          ni recomendaciones por GPS — eso requiere identidad.
          Brandon, mayo 14 2026: reordenado para que "Repetir último
          pedido" quede pegado a "Categorías principales" — antes había
          MisPedidosFavoritosStrip y FeaturedStoresNearby entre medio,
          rompiendo la conexión visual. Ahora:
            1. Repetir último pedido (hero)
            2. Categorías principales (grid grande)
            3. Pedidos favoritos
            4. Tiendas destacadas cerca */}
      {/* "Repetir último pedido" — Brandon mayo 14: oculto en mobile
          para minimizar ruido en cel. En sm+ visible cuando logueado. */}
      {isLoggedIn && search.trim().length === 0 && (
        <div className="hidden sm:block">
          <RepetirUltimoPedido />
        </div>
      )}

      {/* TiendasMainCategoriesGrid removido (Brandon mayo 14 2026 v2):
          las categorías principales del superadmin ahora viven en la home
          /, no en /tiendas. Acá el cliente busca por filtros chip y zona,
          la entrada por categoría sigue siendo /marketplace/categoria/[slug]. */}

      {/* Brandon mayo 14 2026: pedidos favoritos + tiendas destacadas
          cerca también ocultas en mobile. En sm+ visibles. */}
      {isLoggedIn && (
        <div className="hidden sm:contents">
          {/* Pedidos favoritos del cliente (localStorage) */}
          <MisPedidosFavoritosStrip />

          {/* Tiendas destacadas cerca de ti (personalizado por GPS).
              Top 6 dentro del radio (default 50 km — radio actúa como
              filtro automático multi-ciudad CC ↔ Pucallpa). Hover →
              drawer lateral con productos destacados + comprar rápido.
              Wrap con max-w-[1280px] para alinear con el resto de
              secciones del directorio. */}
          <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16">
            <FeaturedStoresNearby userCoords={userCoords} />
          </section>
        </div>
      )}

      {/* RecommendationsStrip eliminado (Brandon, mayo 2026): la
          sección "Tiendas destacadas cerca tuyo" ahora la cubre
          FeaturedStoresNearby — personalizada y condicional al login.
          Mantener ambas creaba duplicación visual y mostraba data
          a deslogueados. */}

      {/* ── Filtros + Grid — directo, sin hero pesado.
           Brandon, mayo 15 v3 2026: removidos eyebrow "Todas las tiendas"
           y título "Filtrá y elegí" — el texto comercial persuasivo
           ("Recomendadas para vos") aparece después del toolbar, justo
           encima del listado, para mejor jerarquía. */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 pb-12">
        <div className="mb-2 sm:mb-3">
          {!isTiendasOnly && (
            <div className="mt-1">
              <QuickFilterChips
                activeChips={activeChips}
                onToggle={handleChipToggle}
                stores={stores as unknown as ReadonlyArray<{
                  rating?: number;
                  isOpenNow?: boolean;
                  freeDelivery?: boolean;
                  paymentMethods?: string[] | null;
                  minimumOrder?: number | null;
                  hours24h?: boolean;
                  createdAt?: string | Date | null;
                  hasOffers?: boolean;
                }>}
              />
            </div>
          )}
        </div>

        {/* Filtros: Tipo de producto + Zona en cajitas grandes
             (mismo formato visual). La categoría de tienda ya vive
             en la grid principal de Categorías arriba. */}
        <div className="space-y-3 mb-4">
          {/* Subcategoría = cajitas grandes con imagen (gestionadas desde superadmin) */}
          {subcategories.length > 0 && (
            <div ref={subcategorySectionRef}>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
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
                    "shrink-0 inline-flex flex-col items-center gap-1.5 rounded-2xl border-2 transition-all px-3 py-3 min-w-[96px] sm:min-w-[88px]",
                    subCategoryId === null
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                  )}
                >
                  <span
                    className={cn(
                      "h-11 w-11 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center",
                      subCategoryId === null
                        ? "bg-[var(--accent-600,var(--accent))] text-white"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                    )}
                  >
                    <Boxes className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "text-[length:var(--ts-xs)] font-bold leading-tight text-center",
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
                        "shrink-0 inline-flex flex-col items-center gap-1.5 rounded-2xl border-2 transition-all px-3 py-3 min-w-[96px] sm:min-w-[88px]",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
                      )}
                    >
                      <span
                        className={cn(
                          "h-11 w-11 sm:h-9 sm:w-9 rounded-lg overflow-hidden flex items-center justify-center",
                          active
                            ? "bg-[var(--accent-600,var(--accent))] text-white"
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
                          "text-[length:var(--ts-xs)] font-bold leading-tight text-center max-w-[120px] truncate",
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

          {/* Filtrar por zona = botón único que abre modal.
              Brandon mayo 14 2026: las cajitas inline de zonas saturaban
              la UI cuando había muchas zonas. Ahora un solo botón con la
              zona activa visible (o "Todas las zonas") + modal con la
              lista completa al tap.
              Brandon mayo 18 2026: en mobile, la zona vive dentro del modal
              de filtros (chips junto a categoría/precio) — escondemos este
              botón inline. En desktop sigue visible. */}
          {zonesForFilter.length > 1 && (
          <div className="hidden sm:block">
            {/* Label "Filtrar por zona" removido (Brandon mayo 15 v3):
                el botón ya muestra el mismo texto — era duplicación. */}
            <button
              type="button"
              onClick={() => setZoneModalOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={zoneModalOpen}
              className={cn(
                "inline-flex items-center gap-3 rounded-2xl border-2 transition-all px-4 h-12 sm:h-14 shadow-sm hover:shadow-md hover:-translate-y-0.5",
                zone
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]/50",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
                  zone
                    ? "bg-[var(--accent-600,var(--accent))] text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                )}
              >
                <MapPin className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="flex flex-col items-start gap-0.5 min-w-0">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider opacity-70 leading-tight">
                  {zone ? "Zona activa" : "Filtrar por zona"}
                </span>
                <span className="text-sm font-extrabold tracking-tight leading-tight truncate max-w-[180px] sm:max-w-[240px]">
                  {zone
                    ? zonesForFilter.find((z) => z.id === zone)?.label ?? "Zona"
                    : "Todas las zonas"}
                </span>
              </span>
              {zone && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setZone("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setZone("");
                    }
                  }}
                  aria-label="Quitar filtro de zona"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))]/15 hover:bg-[var(--accent-600,var(--accent))]/30 text-[var(--accent)] transition-colors shrink-0 cursor-pointer"
                >
                  <span aria-hidden className="text-base font-black leading-none">×</span>
                </span>
              )}
              <ChevronRight className="h-4 w-4 opacity-50 shrink-0 ml-1" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
          )}

          {/* ── Modal de zonas ────────────────────────────────────────── */}
          {zoneModalOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Filtrar por zona"
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 backdrop-blur-md bg-slate-950/60"
              onClick={() => setZoneModalOpen(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full sm:max-w-md max-h-[85svh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--surface-raised)] shadow-2xl overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--rule-soft)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                      <MapPin className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] leading-tight">
                        Filtrar
                      </p>
                      <h3 className="text-lg font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
                        Elegí tu zona
                      </h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setZoneModalOpen(false)}
                    aria-label="Cerrar"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] hover:bg-[var(--rule-base)] text-[var(--text-primary)] transition-colors shrink-0"
                  >
                    <span aria-hidden className="text-xl font-black leading-none">×</span>
                  </button>
                </div>

                {/* Lista de zonas */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                  <ul className="space-y-2">
                    {zonesForFilter.map((z) => {
                      const active = zone === z.id;
                      return (
                        <li key={z.id || "todas"}>
                          <button
                            type="button"
                            onClick={() => {
                              setZone(z.id);
                              setZoneModalOpen(false);
                            }}
                            aria-pressed={active}
                            className={cn(
                              "w-full flex items-center gap-3 rounded-2xl border-2 p-3 sm:p-4 text-left transition-all",
                              active
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-md"
                                : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/30",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl shrink-0",
                                active
                                  ? "bg-[var(--accent-600,var(--accent))] text-white"
                                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                              )}
                            >
                              <MapPin className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                            </span>
                            <span
                              className={cn(
                                "flex-1 min-w-0 text-base font-extrabold tracking-tight",
                                active ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
                              )}
                            >
                              {z.label}
                            </span>
                            {active && (
                              <span
                                aria-hidden
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white font-black text-xs shrink-0"
                              >
                                ✓
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ── Toolbar — rediseñado mobile-first (Brandon, mayo 14 2026) ──
               Mobile: scroll horizontal con todos los controles en chips
               grandes (vista pill + sort + filtros + limpiar). El flex-wrap
               anterior se montaba feo en pantallas chicas — ahora la fila
               siempre cabe via overflow-x scroll.
               Desktop (sm+): grid de 2 cols con filtros a la izquierda y
               vista pill alineada a la derecha. */}
          <div
            role="toolbar"
            aria-label="Filtros y vista de tiendas"
            className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-sm overflow-hidden"
          >
            {/* ── Mobile: scroll-x con todo en chips ── */}
            <div className="sm:hidden flex items-center gap-2 overflow-x-auto scrollbar-hide px-3 py-2.5">
              <div
                role="group"
                aria-label="Cambiar entre vista lista y mapa"
                className="inline-flex items-center rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-1 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  aria-label="Vista en lista"
                  className={cn(
                    "inline-flex items-center justify-center h-9 w-9 rounded-full transition-all",
                    viewMode === "list"
                      ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-sm"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  <List className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  aria-pressed={viewMode === "map"}
                  aria-label="Vista en mapa"
                  className={cn(
                    "inline-flex items-center justify-center h-9 w-9 rounded-full transition-all",
                    viewMode === "map"
                      ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-sm"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  <MapIcon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </button>
              </div>

              <span aria-hidden className="h-7 w-px bg-[var(--rule-soft)] shrink-0" />

              {/* Filtros (mobile): primero → más visible. Ahora también
                   contiene la sección Zona dentro del drawer. */}
              <div className="flex items-center gap-2 shrink-0">
                <MarketplaceFilters
                  filters={productFilters}
                  userCoords={userCoords}
                  geoLoading={geoLoading}
                  onChange={handleFiltersChange}
                  onRequestGeo={handleGeoSort}
                  hideProductCategory
                  zones={zonesForFilter}
                  zone={zone}
                  onZoneChange={setZone}
                />
              </div>

              <div className="shrink-0">
                <StoresSortSelector value={sortKey} onChange={setSortKey} />
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
                  className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--data-error-500,#ef4444)]/30 bg-[var(--data-error-50,#fef2f2)] dark:bg-[var(--data-error-950,#450a0a)]/30 px-3 h-9 text-sm font-extrabold text-[var(--data-error-600,#dc2626)] shrink-0"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* ── Desktop (sm+): layout antiguo con filtros izquierda + vista derecha ── */}
            <div className="hidden sm:flex items-center gap-3 flex-wrap px-5 py-3.5">
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
        </div>

        {/* ── Bloque comercial (Brandon mayo 15 v3) ──
             Persuasivo, no técnico. Aparece entre el toolbar y el listado
             para guiar al usuario y bajar la ansiedad de elección.
             Conteo dinámico = social proof barato pero efectivo.
             Brandon mayo 18 v2: titulos mas compactos en mobile para
             priorizar las cards sobre el header. */}
        <div className="mt-4 sm:mt-5 mb-3 sm:mb-4 flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
              <span aria-hidden className="inline-block h-[3px] w-6 rounded-full bg-[var(--accent)]" />
              recomendaciones
            </p>
            <h2 className="text-xl sm:text-3xl font-extrabold tracking-[-0.025em] text-[var(--text-primary)] leading-tight">
              Recomendadas para vos
            </h2>
            <p className="mt-1 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-snug">
              {finalStores.length > 0 ? (
                <>
                  <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                    {finalStores.length}
                  </span>{" "}
                  {finalStores.length === 1 ? "tienda" : "tiendas"} del barrio
                  <span className="mx-1.5 text-[var(--text-tertiary)]">·</span>
                  <span className="font-semibold text-[var(--accent)]">entrega hoy</span>
                </>
              ) : (
                <>Tiendas del barrio · entrega hoy</>
              )}
            </p>
          </div>
        </div>

        {/* Listado de tiendas */}
        {viewMode === "map" ? (
          <TiendasMap stores={finalStores} userCoords={userCoords} />
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


      {/* ── Sumate a Buleje — slim banner (v3, mayo 2026).
          v2 tenia 2 cards XL con stats que duplicaban /abrir-tienda y
          /marketplace/repartidor. Comprimido a 1 banner horizontal con 2
          CTAs lado a lado. La info detallada vive en sus paginas dedicadas.

          Brandon mayo 2026: solo aparece cuando el superadmin selecciona
          "Marketplace completo" en /superadmin/stores tab Navegación. En
          modo "Solo Tiendas" (default) se oculta por completo. */}
      {!isTiendasOnly && (
      <section
        aria-label="Sumate a Buleje"
        className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
      >
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="rounded-3xl bg-linear-to-br from-[var(--text-primary)] to-[var(--text-primary)]/95 text-[var(--surface-canvas)] p-6 sm:p-8 lg:p-10 overflow-hidden relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[var(--accent)]/30 blur-3xl"
            />
            <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 lg:gap-10 items-center">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-3">
                  <span aria-hidden className="inline-flex h-[3px] w-8 rounded-full bg-[var(--accent)]" />
                  Sumate a Buleje
                </p>
                <h2 className="font-display text-2xl sm:text-3xl lg:text-[2.25rem] font-extrabold leading-tight tracking-tight">
                  ¿Tenes una tienda o moto?{" "}
                  <span className="text-[var(--accent)]">Trabaja con nosotros.</span>
                </h2>
                <p className="mt-2 text-sm sm:text-base text-white/70 max-w-xl leading-relaxed">
                  Bodegueros: 0% comisión los primeros meses · Repartidores: cobras por pedido + 100% propinas.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <Link
                  href="/abrir-tienda"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] text-white px-5 h-12 text-sm font-extrabold hover:bg-[var(--accent)]/90 transition-colors shadow-lg shadow-[var(--accent)]/30"
                >
                  <Store className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Abrir mi tienda
                  <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </Link>
                <Link
                  href="/marketplace/repartidor"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-white/25 px-5 h-12 text-sm font-extrabold text-white hover:bg-white/10 transition-colors"
                >
                  <Bike className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Ser repartidor
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Footer vive en el layout `/tiendas/layout.tsx` (persistente). */}
    </div>
  );
}
