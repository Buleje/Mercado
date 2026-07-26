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
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
// Brandon 2026-05-18 v3: iconos List, Map (toggle removido), Truck/Wallet/Gift
// (KPIs hero removidos) ya no se usan en este archivo.
import {
  Store,
  MapPin,
  ArrowUpRight,
  Bike,
  Wallet,
  Search as SearchIcon,
  ShoppingBag,
  ChevronRight,
  X,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatCategoryLabel } from "@/lib/format-category";
import { BRAND_GEO } from "@/lib/geo";
// Brandon 2026-05-18 + audit-sprint 2026-05-20:
// SearchAutocomplete + MarketplaceStoresView declarados como dynamic() abajo
// (después del `import dynamic from "next/dynamic"`) para reducir initial
// bundle y permitir streaming del listing.
import MarketplaceStoresView, {
  passesChips,
  type StoreChipFields,
} from "@/components/marketplace/MarketplaceStoresView";
import SubcategoryChips from "@/components/marketplace/tiendas/SubcategoryChips";
import QuickFilterToggle from "@/components/marketplace/tiendas/QuickFilterToggle";
import BackToTopButton from "@/components/marketplace/BackToTopButton";
import { useTiendasUrlSync } from "./use-tiendas-url-sync";
import { deriveActiveZones } from "@/lib/marketplace-zones";
import {
  useMarketplaceGeo,
  type MarketplaceStore,
} from "@/components/marketplace/useMarketplaceGeo";
// FeaturedStoresNearby movido a dynamic() abajo (Brandon 2026-05-20 perf mobile).
import { useCustomerAuthStatus } from "@/hooks/useCustomerAuthStatus";
import { useCustomer } from "@/contexts/customer-context";
// Brandon 2026-05-21 v3 perf — ExplorarTracker es un tracker de analytics
// (PostHog/Vercel). NO afecta el render visible; bajamos a dynamic + ssr:false
// para sacarlo del bundle inicial. Si no carga, el peor caso es que un evento
// de analytics se pierde; el usuario nunca lo nota.
const ExplorarTracker = dynamic(() => import("@/components/marketplace/explorar/ExplorarTracker"), {
  ssr: false,
});
// Brandon 2026-05-18 perf P0 #2: MarketplaceFilters es 691 LOC y se monta
// dos veces (mobile + desktop). Lazy-load del componente; el type sigue siendo
// import estático para no romper el tipado de DEFAULT_FILTERS.
import type { MarketplaceFiltersState } from "@/components/marketplace/MarketplaceFilters";
import {
  Boxes,
  Package,
  Sparkles,
  Leaf,
  MoreHorizontal,
  Star,
  SlidersHorizontal,
  Clock,
  List,
  Map as MapIcon,
  UtensilsCrossed,
  ShoppingBasket,
  Wrench,
  Smartphone,
  Pill,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { MARKETPLACE_VERTICALS, verticalForStoreCategory } from "@/lib/marketplace/verticals";

// Icono por vertical — single-source con lib/marketplace/verticals.
const VERTICAL_ICONS: Record<string, LucideIcon> = {
  comida: UtensilsCrossed,
  bodega: ShoppingBasket,
  ferreteria: Wrench,
  electro: Smartphone,
  farmacia: Pill,
};
// CupSoda no esta en el DS — import directo desde lucide (excepcion documentada).
import { CupSoda } from "lucide-react";
// Brandon 2026-05-21 v3: removido import default de QuickFilterChips (chips
// legacy "Abierto ahora / 4.5 o más / Sin mínimo" eliminados del render).
// El type sigue siendo necesario para el state `activeChips` que alimenta
// el toggle "⭐ 4+" inline y el URL sync.
import type { QuickChipId } from "@/components/marketplace/QuickFilterChips";
import StoresSortSelector, {
  loadStoredSort,
  STORES_SORT_OPTIONS,
  type StoresSortKey,
} from "@/components/marketplace/StoresSortSelector";
// Brandon 2026-05-20 perf mobile: TusTiendasStrip, MisTiendasFavoritasStrip,
// TiendasPromoCards, MisPedidosFavoritosStrip, RepetirUltimoPedido, FeaturedStoresNearby
// son TODOS desktop-only (hidden sm:*). Antes se importaban estáticos y se
// montaban en el árbol React aunque CSS los escondiera → JS bundle + hooks
// (fetch, geo, customer-orders) corrían en mobile sin propósito. Ahora dynamic
// con ssr:false + gate por useMediaQuery → mobile no descarga ni ejecuta nada.
import TiendasSectionHeader from "@/components/marketplace/TiendasSectionHeader";
import TiendasLocationBar from "@/components/marketplace/TiendasLocationBar";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
// `dynamic` ya está importado al top — usado por ExplorarTracker, MarketplaceFilters,
// SearchAutocomplete y los strips desktop-only (Tiendas*Strip).

// Brandon 2026-06-02: toggle Lista/Mapa RE-AGREGADO. TiendasMap (Leaflet) lazy
// — ssr:false (usa window/document). Placeholder con altura para evitar CLS.
const TiendasMap = dynamic(() => import("@/components/marketplace/TiendasMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[520px] w-full animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
  ),
});

// Brandon 2026-05-18 perf P0 #2: MarketplaceFilters (691 LOC) lazy.
// El placeholder ocupa el slot visual hasta que el chunk carga, así no hay
// jump de layout en mobile/desktop. ssr:false porque el componente usa
// localStorage + window.matchMedia y no aporta SEO.
const MarketplaceFilters = dynamic(() => import("@/components/marketplace/MarketplaceFilters"), {
  ssr: false,
  // Brandon 2026-05-21 perf FOUC: placeholder con la misma altura/forma del
  // botón "Filtros" real (h-9 rounded-full chip) — NO text, NO loader visible.
  // Si el chunk carga en <80ms (warm bundle) el usuario nunca ve este
  // placeholder. Si tarda, ocupa el mismo slot visual evitando layout shift.
  loading: () => (
    <div
      aria-hidden
      className="inline-flex h-9 w-24 shrink-0 items-center justify-center rounded-full bg-[var(--surface-sunken)] animate-pulse"
    />
  ),
});

// Brandon 2026-05-18 perf P1 #6: SearchAutocomplete oculto en mobile (hero
// sm+ only); el navbar mobile tiene su propio search pill. ssr:false +
// placeholder con la misma altura/borde para evitar layout shift.
const SearchAutocomplete = dynamic(() => import("@/components/marketplace/SearchAutocomplete"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]"
    />
  ),
});

// TiendasHeroAds (banner de promos) REMOVIDO de /tiendas — Brandon 2026-06-08
// (opción A). El mismo banner vive en /marketplace; en el directorio estorbaba.

// Brandon 2026-05-20 perf mobile: componentes que viven solo en sm+ (eran
// `hidden sm:block` o `hidden sm:contents`). Convertidos a dynamic con
// ssr:false: mobile no descarga el JS, no hidrata, no corre hooks (fetch,
// useCustomerOrders, geolocation). Gateados además por useMediaQuery abajo.
const TiendasPromoCards = dynamic(() => import("@/components/marketplace/TiendasPromoCards"), {
  ssr: false,
  loading: () => null,
});
const MisTiendasFavoritasStrip = dynamic(
  () => import("@/components/marketplace/MisTiendasFavoritasStrip"),
  { ssr: false, loading: () => null },
);
const TusTiendasStrip = dynamic(() => import("@/components/marketplace/TusTiendasStrip"), {
  ssr: false,
  loading: () => null,
});
const RepetirUltimoPedido = dynamic(() => import("@/components/marketplace/RepetirUltimoPedido"), {
  ssr: false,
  loading: () => null,
});
const InvitaVecinoCard = dynamic(() => import("@/components/marketplace/InvitaVecinoCard"), {
  ssr: false,
  loading: () => null,
});
const MisPedidosFavoritosStrip = dynamic(
  () => import("@/components/marketplace/MisPedidosFavoritosStrip"),
  { ssr: false, loading: () => null },
);
// FeaturedStoresNearby ("tiendas destacadas cerca / mejores 3") REMOVIDO
// (Brandon 2026-06-05). El dynamic import se eliminó con su sección.
// Brandon 2026-05-20 v8: MarketplaceStoresView ESTÁTICO (revertido).
// Antes era `dynamic({ssr:false})` pero el chunk quedaba colgado tras
// back-nav (skeleton perpetuo, no resolvía el dynamic loader). Trade-off
// aceptado: +25-35KB initial bundle a cambio de back-nav que funciona.
// Ver `import MarketplaceStoresView ...` arriba.

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
  /** Categoría prefijada por la ruta SSG `/tiendas/categoria/[categoria]`.
   *  Override de query params (siembra el filtro de categoría para SEO). */
  initialCategory?: string;
  /** Stores pre-fetched en el server (fix bug back-nav cross-layout Next 16).
   *  El HTML server-rendered ya tiene la lista materializada, así que aunque
   *  la hidratación cliente quede frozen tras un back nav, los items siguen
   *  visibles. El client useEffect refresca/filtra normalmente. */
  initialStores?: MarketplaceStore[];
  /** Productos por slug para las cards Premium (beneficio superadmin). */
  premiumProducts?: Record<
    string,
    import("@/components/marketplace/PremiumStoreCard").PremiumProduct[]
  >;
}

export default function TiendasClient({
  initialZone,
  initialCategory,
  initialStores = [],
  premiumProducts = {},
}: TiendasClientProps = {}) {
  // ── TS-26 URL sync — leer estado inicial de query params ──
  const searchParams = useSearchParams();
  const router = useRouter();
  // pathname + initialSyncDone (URL write-back) viven ahora en useTiendasUrlSync.

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
  const customerRegion = isLoggedIn ? (customer?.departmentName ?? null) : null;
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
    () => initialCategory ?? searchParams.get("cat") ?? "todos",
  );
  const [zone, setZone] = useState(() => initialZone ?? searchParams.get("zona") ?? "");
  // Sticky bar de subcategorías mobile — visible cuando la sección original
  // sale del viewport por scroll. Brandon mayo 18 2026.
  // mayo 18 v2: sincronizada con la dirección de scroll (hide-down/show-up)
  // como el nav principal, vía useNavScrollHide.
  const subcategorySectionRef = useRef<HTMLDivElement | null>(null);
  const [scrolledPastSubcategories, setScrolledPastSubcategories] = useState(false);

  // Modal de zonas — Brandon mayo 14 2026: antes mostrábamos las zonas como
  // cajitas inline (10+ items horizontales que saturaban la UI). Ahora se
  // abre un modal lateral con la lista — un solo botón "Filtrar por zona".
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [productFilters, setProductFilters] = useState<MarketplaceFiltersState>(DEFAULT_FILTERS);

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

  // Categoría PRINCIPAL (vertical: comida/bodega/ferretería/…). Filtro de más
  // alto nivel que la subcategoría (Brandon 2026-07-06). null = todas.
  const [vertical, setVertical] = useState<string | null>(null);

  // Brandon 2026-05-18 perf P2 #13: el listener solo se monta cuando hay
  // subcategorías visibles. Sin chips → no hay sticky bar → no scroll listener.
  // Declarado DESPUÉS del state `subcategories` (orden léxico de hooks).
  const hasSubcategoryChips = subcategories.length > 0;
  // Brandon 2026-05-27: el navbar ahora es FIJO siempre (no se esconde al
  // bajar). La sticky subnav de subcategorías debe aparecer apenas el usuario
  // pasa la sección original — independiente de la dirección de scroll. Antes
  // dependía de `navVisible` (show-up only), por lo que al BAJAR (cuando más se
  // necesita) quedaba oculta. Ahora basta con haber scrolleado más allá.
  const showStickySubcategoryBar = scrolledPastSubcategories;

  // Fetch subcategorías cuando cambia la categoría principal.
  // Filtramos para mostrar SOLO las que tienen ≥1 tienda vinculada — un
  // filtro vacío sin acción es ruido visual. Si ninguna tiene tiendas,
  // la sección entera de subcategorías se oculta (controlado por el
  // `subcategories.length > 0` del render).
  //
  // Brandon 2026-05-18 perf P0 #3: el effect tenía `subCategoryId` en deps,
  // disparando un re-fetch del endpoint cada vez que el usuario seleccionaba
  // un chip de subcategoría. Ahora la lectura va por ref → fetch solo cuando
  // cambia la categoría principal.
  const subCategoryIdRef = useRef(subCategoryId);
  useEffect(() => {
    subCategoryIdRef.current = subCategoryId;
  }, [subCategoryId]);

  useEffect(() => {
    // Flag `cancelled` en vez de AbortController: evita el stale-overwrite al
    // cambiar de categoría SIN generar el ruido "Uncaught AbortError" que React
    // 19 + Fast Refresh loguea al abortar fetches en el cleanup.
    let cancelled = false;
    const url =
      category === "todos"
        ? "/api/marketplace/subcategories"
        : `/api/marketplace/subcategories?category=${encodeURIComponent(category)}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : { subcategories: [] }))
      .then((j) => {
        if (cancelled) return;
        const all = (j.subcategories ?? []) as SubCategoryOption[];
        const subs = all.filter(
          (s) => Array.isArray(s.linkedStoreSlugs) && s.linkedStoreSlugs.length > 0,
        );
        setSubcategories(subs);
        // Si la subcategoría seleccionada ya no existe en este filtro, limpiarla
        const currentSub = subCategoryIdRef.current;
        if (currentSub && !subs.some((s) => s.id === currentSub)) {
          setSubCategoryId(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSubcategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const activeSubcategory = subCategoryId
    ? (subcategories.find((s) => s.id === subCategoryId) ?? null)
    : null;
  const linkedStoreSlugsForSub = activeSubcategory?.linkedStoreSlugs ?? null;

  // Encadenar categoría → subcategoría (Brandon 2026-07-06): al elegir una
  // categoría (vertical: Comida/Bodega/…), las subcategorías visibles se acotan
  // a las de ESE mundo — client-side, sin refetch. `categoryId` de la subcat es
  // el rubro de tienda (restaurante/bodega…); verticalForStoreCategory lo mapea.
  const visibleSubcategories = vertical
    ? subcategories.filter((s) => verticalForStoreCategory(s.categoryId) === vertical)
    : subcategories;

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
        const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
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
    return new Set(raw.split(",").filter(Boolean) as QuickChipId[]);
  });

  const handleChipToggle = useCallback((chipId: QuickChipId) => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(chipId)) next.delete(chipId);
      else next.add(chipId);
      return next;
    });
  }, []);

  // Brandon 2026-06-02: toggle Lista/Mapa re-agregado. "list" por default.
  const [viewMode, setViewMode] = useState<"list" | "map">("list");

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

  // ── TS-26 URL sync — escribir back al cambiar el estado (hook dedicado) ──
  useTiendasUrlSync({
    search,
    category,
    zone,
    sortKey,
    activeChips,
    subCategoryId,
    initialZone,
    initialCategory,
  });

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

  // Fiado Digital — solo mostramos el filtro "Acepta fiado" si al menos una
  // tienda del listado lo ofrece (evita un filtro que rinde vacío en ciudades
  // recién lanzadas). Mismo criterio que chipHasMatch de QuickFilterChips.
  const anyAcceptsFiado = useMemo(() => stores.some((s) => s.acceptsFiado === true), [stores]);

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

  // audit #5 (Brandon 2026-05-31): elegir un orden del dropdown toma el control
  // del listado → apagamos el geo-sort. Antes geoActive quedaba prendido y el
  // grid mostraba el sort elegido (ej. "Mejor rating") pero el aria-live seguía
  // anunciando "Ordenado por cercanía" (estado contradictorio). Si el cliente
  // quiere cercanía, tiene la opción "Más cerca" en el mismo dropdown.
  const handleSortChange = useCallback(
    (next: StoresSortKey) => {
      setSortKey(next);
      setGeoActive(false);
      setUserCoords(null);
    },
    [setGeoActive, setUserCoords],
  );

  // Reset global de filtros — compartido por el header del sidebar y el drawer.
  const resetAllFilters = useCallback(() => {
    setSearch("");
    setCategory("todos");
    setVertical(null);
    setZone("");
    setSubCategoryId(null);
    setGeoActive(false);
    setUserCoords(null);
    setProductFilters(DEFAULT_FILTERS);
    setActiveChips(new Set());
    setSortKey("relevance");
  }, [setGeoActive, setUserCoords]);

  // Nº de filtros activos — para el badge del header y el trigger del drawer.
  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (category !== "todos" ? 1 : 0) +
    (vertical ? 1 : 0) +
    (zone ? 1 : 0) +
    (subCategoryId ? 1 : 0) +
    (geoActive ? 1 : 0) +
    activeChips.size +
    (sortKey !== "relevance" ? 1 : 0) +
    (productFilters.minPrice > 0 || productFilters.maxPrice < MAX_PRICE_LIMIT ? 1 : 0);

  // Audit filtros (Brandon 2026-07-06): reemplaza el viejo `compactFilters` que
  // ESCONDÍA todos los filtros con ≤6 tiendas (choca con "usar mejor los
  // filtros"). Ahora la barra slim (orden + chips + zona + más filtros) está
  // SIEMPRE visible; el sidebar pesado (secciones apiladas) aparece solo cuando
  // hay muchas tiendas (>6), donde el filtrado importa de verdad.
  const manyStores = stores.length > 6;

  // Retry counter — bump para re-ejecutar el useEffect del fetch
  const [retryKey, setRetryKey] = useState(0);

  // Skip flag: en el primer mount, si ya tenemos initialStores del server,
  // NO disparamos fetch ni setLoading(true) porque la lista ya está
  // materializada. PERO si la URL trae filtros activos (q, cat, zona, chips,
  // sort, subcat), forzamos el fetch porque initialStores trae TODAS las
  // tiendas sin filtrar.
  //
  // Brandon 2026-05-21 perf FOUC: ampliado a chips/sort/subcat para cubrir
  // todos los entry points con filtros pre-aplicados.
  const hasInitialFilters =
    (searchParams.get("q")?.trim().length ?? 0) > 0 ||
    (searchParams.get("cat") && searchParams.get("cat") !== "todos") ||
    (searchParams.get("zona")?.trim().length ?? 0) > 0 ||
    (searchParams.get("chips")?.trim().length ?? 0) > 0 ||
    (searchParams.get("subcat")?.trim().length ?? 0) > 0 ||
    (searchParams.get("sort") && searchParams.get("sort") !== "default");
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
      // Brandon 2026-05-21 perf FOUC: stale-while-revalidate. Si ya hay
      // stores en pantalla, NO disparamos el shimmer del skeleton — solo
      // refetcheamos en background y reemplazamos cuando la respuesta llega.
      // Esto elimina el flash "grid completo → skeleton → grid completo"
      // post-hidratación cuando initialStores estaba poblado.
      const isSilentRefetch = stores.length > 0;
      if (!isSilentRefetch) setLoading(true);
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

  // Back-nav recovery — Brandon 2026-05-20 v7 fix duro:
  // El usuario reportó "al volver de /marketplace/[slug] a /tiendas la
  // página queda en blanco". Root cause: el bfcache del browser preserva
  // el snapshot del DOM frozen (sin React montado realmente), y los
  // hooks de pageshow/popstate intentan re-fetchear pero el árbol React
  // ya está dead — `setRetryKey` no dispara re-render porque el componente
  // está en estado bfcache (no committed).
  //
  // Solución: cuando `e.persisted === true` (signal explícito de bfcache),
  // hacemos `window.location.reload()` con guard anti-loop usando
  // sessionStorage (si ya recargamos hace <3s, NO recargamos de nuevo).
  // Para popstate (back dentro SPA) y visibilitychange, mantenemos retry
  // suave (no full reload).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const softRetry = () => {
      setLoading(false);
      setRetryKey((k) => k + 1);
      try {
        router.refresh();
      } catch {}
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      // bfcache detectado — reload duro con guard anti-loop
      const RELOAD_KEY = "bsm:tiendas:bfcache-reload";
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
        const now = Date.now();
        if (now - last < 3000) {
          // Ya recargamos hace <3s — usar soft retry para no entrar en loop
          softRetry();
          return;
        }
        sessionStorage.setItem(RELOAD_KEY, String(now));
        window.location.reload();
      } catch {
        softRetry();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && stores.length === 0 && !loading) {
        softRetry();
      }
    };
    window.addEventListener("popstate", softRetry);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("popstate", softRetry);
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

  // Safety net (Visual QA P0-4 fix 2026-04-30, re-fix Fase 2 audit profundo
  // 2026-05-18 P0 #26): antes hacía `window.location.reload()` a los 8s.
  // En 3G de Pucallpa con carga lenta, el reload reiniciaba el timer y
  // entraba en BUCLE INFINITO de reload — el cliente NUNCA veía las
  // tiendas. Ahora: retry vía setRetryKey UNA SOLA VEZ (refetch sin reload
  // de página) y solo si el state realmente está stuck. No reinicia el
  // timer porque el useEffect tiene [] dep array (solo se monta 1×).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const safety = setTimeout(() => {
      if (stores.length === 0 && !error && !loading) {
        // setRetryKey reintenta el fetch sin recargar la página completa.
        // Si tras esto sigue vacío, asumimos que no hay tiendas (estado
        // legítimo) y NO insistimos — evita loop.
        setRetryKey((k) => k + 1);
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
  const subcategoryFiltered = useMemo(() => {
    if (!subCategoryId || !linkedStoreSlugsForSub || linkedStoreSlugsForSub.length === 0) {
      return sortedStores;
    }
    const slugSet = new Set(linkedStoreSlugsForSub);
    return sortedStores.filter((s) => slugSet.has(s.slug));
  }, [sortedStores, subCategoryId, linkedStoreSlugsForSub]);

  // Brandon 2026-05-18: cerradas al final del grid. Las tiendas con
  // `isOpenNow === false` se mezclaban con las abiertas y frustraba al
  // cliente que veía "CERRADA AHORA" justo en la primera fila. Ahora se
  // priorizan las abiertas (sortBy aplicado) y las cerradas van al fondo.
  const finalStores = useMemo(() => {
    // audit #4 (Brandon 2026-05-31): aplicar los quick-filter chips ACÁ además
    // de dentro de MarketplaceStoresView. Antes el filtrado por chips vivía solo
    // en el grid → el contador del header ("· 3") usaba la lista sin chips y
    // quedaba desincronizado con "Mostrando 1 tienda" del grid. Ahora ambos
    // derivan del mismo set (el grid re-filtra idempotente). Misma fuente de
    // verdad para el contador y el listado.
    // Filtro por categoría PRINCIPAL (vertical) — el más alto de la jerarquía.
    const byVertical = vertical
      ? subcategoryFiltered.filter(
          (s) => verticalForStoreCategory((s as { category?: string }).category) === vertical,
        )
      : subcategoryFiltered;
    const base =
      activeChips.size === 0
        ? byVertical
        : byVertical.filter((s) =>
            passesChips(s as MarketplaceStore & Partial<StoreChipFields>, activeChips),
          );
    const opened: typeof base = [];
    const closed: typeof base = [];
    for (const s of base) {
      const isClosed = (s as { isOpenNow?: boolean }).isOpenNow === false;
      const onVacation = (s as { vacationMode?: boolean }).vacationMode === true;
      if (isClosed || onVacation) closed.push(s);
      else opened.push(s);
    }
    return [...opened, ...closed];
  }, [subcategoryFiltered, activeChips, vertical]);

  // Brandon 2026-05-18 perf P2 #10: antes `stores.some(...)` se evaluaba
  // inline en JSX (en cada render). Ahora memoizado contra `stores` solo.
  const hasActiveOffers = useMemo(
    () => stores.some((s) => ((s as { activePromos?: number }).activePromos ?? 0) > 0),
    [stores],
  );

  // Verticales presentes (categoría PRINCIPAL) — solo los que tienen tiendas,
  // en el orden de MARKETPLACE_VERTICALS. Alimentan el filtro de arriba.
  const presentVerticals = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stores) {
      const v = verticalForStoreCategory((s as { category?: string }).category);
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return MARKETPLACE_VERTICALS.filter((v) => counts.has(v.id)).map((v) => ({
      id: v.id,
      label: v.label,
      Icon: VERTICAL_ICONS[v.id] ?? Boxes,
      count: counts.get(v.id) ?? 0,
    }));
  }, [stores]);

  const hasFilters =
    category !== "todos" ||
    zone ||
    geoActive ||
    activeChips.size > 0 ||
    search.trim().length > 0 ||
    sortKey !== "relevance" ||
    subCategoryId !== null;

  // Chips de filtro activo (audit filtros #4) — feedback claro de qué está
  // filtrado + remoción por chip. Cada uno se pinta arriba del grid con una ×.
  const activeFilterPills: { key: string; label: string; remove: () => void }[] = [];
  if (search.trim()) {
    activeFilterPills.push({ key: "q", label: `"${search.trim()}"`, remove: () => setSearch("") });
  }
  if (vertical) {
    activeFilterPills.push({
      key: "vertical",
      label: MARKETPLACE_VERTICALS.find((v) => v.id === vertical)?.label ?? "Categoría",
      remove: () => setVertical(null),
    });
  }
  if (category !== "todos") {
    activeFilterPills.push({
      key: "cat",
      label: formatCategoryLabel(category),
      remove: () => setCategory("todos"),
    });
  }
  if (subCategoryId) {
    activeFilterPills.push({
      key: "sub",
      label: activeSubcategory?.label ?? "Subcategoría",
      remove: () => setSubCategoryId(null),
    });
  }
  if (zone) {
    activeFilterPills.push({
      key: "zone",
      label: zonesForFilter.find((z) => z.id === zone)?.label ?? "Zona",
      remove: () => setZone(""),
    });
  }
  if (geoActive) {
    activeFilterPills.push({
      key: "geo",
      label: "Cerca de mí",
      remove: () => {
        setGeoActive(false);
        setUserCoords(null);
      },
    });
  }
  if (activeChips.has("top_rated")) {
    activeFilterPills.push({ key: "top", label: "4+ estrellas", remove: () => handleChipToggle("top_rated") });
  }
  if (activeChips.has("open_now")) {
    activeFilterPills.push({ key: "open", label: "Abierto ahora", remove: () => handleChipToggle("open_now") });
  }
  if (activeChips.has("accepts_fiado")) {
    activeFilterPills.push({ key: "fiado", label: "Acepta fiado", remove: () => handleChipToggle("accepts_fiado") });
  }
  if (sortKey !== "relevance") {
    activeFilterPills.push({
      key: "sort",
      label: STORES_SORT_OPTIONS.find((o) => o.id === sortKey)?.label ?? "Orden",
      remove: () => setSortKey("relevance"),
    });
  }

  // Contador por chip (audit comodidad) — cuántas tiendas matchean cada filtro
  // rápido, para mostrarlo en el chip ("Abierto ahora (2)") antes de aplicarlo.
  const chipCounts = useMemo(
    () => ({
      top_rated: stores.filter((s) => (s.rating ?? 0) >= 4).length,
      open_now: stores.filter((s) => (s as { isOpenNow?: boolean }).isOpenNow !== false).length,
      accepts_fiado: stores.filter((s) => s.acceptsFiado === true).length,
    }),
    [stores],
  );

  const navMode = useMarketplaceNavMode();
  const isTiendasOnly = navMode === "tiendas-only";

  // Brandon 2026-05-20 v2 — fix flash desktop↔mobile:
  // El gate JS `useMediaQuery` (anterior) arrancaba en `false` durante SSR/primer
  // render. En desktop el árbol React renderiza primero "como mobile" → tras
  // hidratar useEffect mueve a desktop → re-render visible (flash). Brandon
  // reportó esto como "tengo que refrescar para que se aplique".
  // Fix: dejar Tailwind `hidden sm:block` (CSS @media puro, evaluado antes del
  // primer paint, sin JS roundtrip → sin flash). El bundle JS sigue ligero
  // porque los componentes son `dynamic({ssr:false})` — el chunk se descarga
  // bajo demanda; en mobile el contenedor display:none evita que ocupen
  // espacio pero el chunk sí baja (~50kb async, post-LCP). Trade-off
  // consciente: claridad UX > -50kb JS mobile.

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--surface-canvas)]">
      <ExplorarTracker pageName="tiendas_directorio" />
      <BackToTopButton />

      {/* ── Sticky subcategory bar (mobile only) ──
           Aparece debajo del nav cuando el usuario hace scroll past
           la sección original. Sigue la misma lógica de visibilidad
           que el nav (hide-down / show-up) + clase
           `nav-smooth-transition` para timing/easing idéntico. */}
      {visibleSubcategories.length > 0 && (
        <div
          aria-hidden={!showStickySubcategoryBar}
          style={{
            transform: showStickySubcategoryBar ? "translateY(0)" : "translateY(-110%)",
            opacity: showStickySubcategoryBar ? 1 : 0,
            visibility: showStickySubcategoryBar ? "visible" : "hidden",
            transitionProperty: "transform, opacity, visibility",
            transitionDuration: "550ms",
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            transitionDelay: showStickySubcategoryBar ? "0ms" : "0ms, 0ms, 550ms",
          }}
          className={cn(
            "sm:hidden fixed left-0 right-0 top-[52px] z-40 will-change-transform",
            showStickySubcategoryBar ? "pointer-events-auto" : "pointer-events-none",
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
                    ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <Boxes className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                Todas
              </button>
              <SubcategoryChips
                subcategories={visibleSubcategories}
                activeId={subCategoryId}
                onSelect={setSubCategoryId}
                variant="pill"
              />
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb visible "Inicio › Tiendas" REMOVIDO (Brandon 2026-06-08):
          ruido sobre los banners. El BreadcrumbList JSON-LD lo sigue emitiendo
          el server (tiendas/page.tsx) — SEO intacto, sin nav visible. */}

      {/* Brandon 2026-05-20 v6: HERO REMOVIDO de /tiendas.
          El cliente que llega aquí ya decidió comprar — no necesita más
          mensajes editoriales. Debe ver filtros + tiendas directo. La
          información comercial (h1 "Las mejores tiendas de tu barrio",
          stats, descripción) vive en home (/). */}

      {/* Cupón de bienvenida (CuponBienvenidaBar) REMOVIDO — Brandon 2026-07-06:
           el 10% ya aparece en la barra superior global (MarketplacePromoBar) y
           como card en la fila de promos del banner. Una franja full-width propia
           duplicaba el mensaje y robaba una fila entera. */}

      {/* Banner de promos REMOVIDO de /tiendas (Brandon 2026-06-08, opción A):
          el mismo banner ya vive en /marketplace; acá —directorio donde el
          cliente viene a ELEGIR tienda— solo empujaba filtros + tiendas abajo
          del fold. Las promos se descubren en /marketplace. */}

      {/* ── Hero de resultados de búsqueda — solo cuando hay query activa ─
           Da prioridad visual a la tienda buscada antes de las secciones
           promocionales. Especialmente útil en modo tiendas-only. */}
      {search.trim().length > 0 && stores.length > 0 && (
        <section className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="rounded-2xl border-2 border-[var(--accent)]/30 bg-primary/10/40 p-5 sm:p-6">
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
                  className="group flex items-center gap-3 rounded-xl bg-[var(--surface-canvas)] border border-[var(--rule-base)] p-3 hover:border-[var(--text-primary)]/40 transition-colors"
                >
                  <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden flex items-center justify-center bg-primary/10">
                    {s.logo ? (
                      // Brandon 2026-05-18 perf P2 #11: logos "Activas ahora"
                      // — next/image con sizes 56px, lazy decode automático.
                      <Image
                        src={s.logo}
                        alt={s.name}
                        width={56}
                        height={56}
                        sizes="56px"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Store className="h-6 w-6 text-[var(--accent)]" strokeWidth={1.75} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {s.name}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">
                      {(s as { zone?: string }).zone ??
                        (s.category ? formatCategoryLabel(s.category) : "Tienda local")}
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

            {/* A3 — búsqueda por PRODUCTO cross-tienda. El vecino busca
                "gaseosa", no "bodega": le ofrecemos saltar a la búsqueda de
                productos en TODAS las tiendas (que sí matchea por producto). */}
            <Link
              href={`/marketplace/buscar?q=${encodeURIComponent(search.trim())}`}
              className="mt-4 flex items-center gap-3 rounded-xl border-2 border-dashed border-[var(--accent)]/40 bg-[var(--surface-canvas)] p-3.5 transition-all hover:border-[var(--accent)] hover:bg-primary/10/40"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                <ShoppingBag className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-[var(--text-primary)]">
                  ¿Buscás un producto?
                </span>
                <span className="block text-xs font-semibold text-[var(--text-secondary)] truncate">
                  Ver &quot;{search.trim()}&quot; en productos de todas las tiendas
                </span>
              </span>
              <ArrowUpRight
                className="h-4.5 w-4.5 shrink-0 text-[var(--accent)]"
                strokeWidth={2.25}
                aria-hidden
              />
            </Link>
          </div>
        </section>
      )}

      {/* ── 2 cards promocionales con paleta Buleje ──────────────────
           Brandon, mayo 14 2026: ocultas en mobile — el cliente en cel
           quiere ir directo a las tiendas, no a promos secundarias.
           En sm+ siguen visibles. */}
      {/* Brandon 2026-05-18 v3: ocultar el card de promos si NO hay ofertas
          activas en ningún tenant (no mostrar un componente vacío que invita
          a una sección sin contenido). Antes pasábamos `hasOffers={...}` pero
          TiendasPromoCards igual renderizaba el contenedor. */}
      {search.trim().length === 0 && hasActiveOffers && (
        <div className="hidden sm:block">
          <TiendasPromoCards hasOffers={hasActiveOffers} />
        </div>
      )}

      {/* Brandon mayo 14 2026: strips de "tus tiendas favoritas" y
          "tus tiendas frecuentes" ocultos en mobile. En cel el cliente
          quiere ver categorías y tiendas directamente, sin ruido de
          historial personal. En sm+ visibles. */}
      {/* Brandon 2026-05-18 perf P1 #5: gate isLoggedIn — los strips de
          historial personalizado solo tienen contenido para clientes
          logueados. Antes se montaban en blanco para anónimos disparando
          hooks `useCustomerOrders` + (en MisTiendasFavoritas) un fetch
          duplicado a /api/marketplace/stores que terminaba sin render.
          Ahora ni siquiera entran al árbol React si no hay login. */}
      {isLoggedIn && (
        <div className="hidden sm:contents">
          {/* ── Mis tiendas favoritas — solo activa con 5+ pedidos en 5+ tiendas ──
              Brandon 2026-05-18 perf P0 #3: inyectamos el catálogo ya pre-fetched
              (initialStores via SSR + refresh client) para evitar el segundo
              round-trip a /api/marketplace/stores. */}
          <MisTiendasFavoritasStrip stores={stores} />

          {/* ── Tus tiendas frecuentes ──────────────────────────────── */}
          <TusTiendasStrip />
        </div>
      )}

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
      {/* "Repetir último pedido" — Brandon 2026-06-10: MOVIDO de acá (primera
          sección, robaba el fold) a un CHIP compacto en la barra de filtros
          (ver <aside> más abajo). Ahora el feed arranca directo en las tiendas
          y el "repetir" queda a un toque junto a los filtros. */}

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

          {/* "Tiendas destacadas cerca de ti / las mejores 3 de tu alrededor"
              (FeaturedStoresNearby) REMOVIDO por pedido de Brandon 2026-06-05. */}
        </div>
      )}

      {/* RecommendationsStrip eliminado (Brandon, mayo 2026): la
          sección "Tiendas destacadas cerca tuyo" ahora la cubre
          FeaturedStoresNearby — personalizada y condicional al login.
          Mantener ambas creaba duplicación visual y mostraba data
          a deslogueados. */}

      {/* ── Filtros + Grid — minimalista Rappi-style.
           Brandon 2026-05-21 v9 rediseño:
           - Mobile: LocationBar fila + Banner (anónimo) → sin h1 visible.
           - Desktop: h1 compacto en 1 línea, sin párrafos largos.
           - Subtítulos mini (eyebrow uppercase) DELANTE de cada sección
             (categorías, tiendas) en vez de bloque h2 + p separado.
           - h1 sr-only en mobile para SEO.
           Desktop v2 (2026-05-26): sidebar de filtros (izquierda, 280px sticky)
           + grid de tiendas (derecha) vía lg:grid-cols-[280px_1fr]. */}
      <section className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-8 pb-6 sm:pb-8">
        {/* ── MOBILE TOP STACK (Rappi-style) — sin padding extra
             1. LocationBar (1 línea, tap → modal customer profile)
             2. WelcomeBanner (compacto, solo si NO logueado) */}
        {/* Brandon 2026-06-07: TiendasWelcomeBanner ("bienvenido") removido en
            mobile. La barra de ubicación va full-bleed (-mx-4 cancela el px-4 del
            section) y pegada al nav (-mt-3 cancela el pt-3) → rectángulo de ancho
            completo, sin bordes redondeados. */}
        <div className="sm:hidden flex flex-col -mx-4 -mt-3 mb-3">
          <TiendasLocationBar />
        </div>

        {/* h2 — el H1 único de la página es el sr-only en app/tiendas/page.tsx
            (server, SSR). Estos eran H1 duplicados (3 H1 → audit SEO 2026-05-31);
            degradados a H2 para jerarquía limpia H1→H2→H3 (cards). */}
        <h2 className="sm:hidden sr-only">Tiendas y bodegas en {BRAND_GEO.city} con delivery</h2>

        {/* Título "Tiendas en {ciudad}" REMOVIDO (Brandon 2026-07-06): el banner
            + las categorías ya orientan; el h1 SEO vive sr-only en el server. */}

        {/* ── CATEGORÍAS PRINCIPALES (Comida/Bodega/Ferretería/…) — el filtro de
             MÁS ALTO nivel, ANTES de las subcategorías (Brandon 2026-07-06).
             Mejor jerarquía: primero el "mundo", después el antojo. Filtra el
             directorio por vertical. ── */}
        {presentVerticals.length > 1 && (
          <div className="mb-4">
            {/* Categorías como TILES grandes (Brandon 2026-07-06): mismo formato
                que las subcategorías pero con MÁS jerarquía — tiles más grandes,
                border-2, badge de ícono prominente + conteo de tiendas. */}
            <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] [scroll-snap-type:x_mandatory] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
              <button
                type="button"
                onClick={() => setVertical(null)}
                aria-pressed={vertical === null}
                className={cn(
                  "group flex h-[112px] w-[112px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 transition-all sm:h-[128px] sm:w-[128px]",
                  vertical === null
                    ? "border-[var(--accent)] bg-primary/10"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:-translate-y-0.5 hover:border-[var(--accent)]/50",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
                    vertical === null ? "bg-[var(--accent)] text-white" : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                  )}
                >
                  <Boxes className="h-5 w-5" strokeWidth={2} aria-hidden />
                </span>
                <span className="text-sm font-bold text-[var(--text-primary)]">Todas</span>
              </button>
              {presentVerticals.map((v) => {
                const active = vertical === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVertical(active ? null : v.id)}
                    aria-pressed={active}
                    className={cn(
                      "group flex h-[112px] w-[112px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-1 text-center transition-all sm:h-[128px] sm:w-[128px]",
                      active
                        ? "border-[var(--accent)] bg-primary/10"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:-translate-y-0.5 hover:border-[var(--accent)]/50",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-colors",
                        active ? "bg-[var(--accent)] text-white" : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white",
                      )}
                    >
                      <v.Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="text-sm font-bold text-[var(--text-primary)] leading-tight line-clamp-1">
                      {v.label}
                    </span>
                    <span className="text-[length:var(--ts-2xs)] font-semibold tabular-nums text-[var(--text-tertiary)]">
                      {v.count} {v.count === 1 ? "tienda" : "tiendas"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ¿QUÉ SE TE ANTOJA HOY? — subcategorías (Pollos/Pizzas), el nivel
             MÁS FINO, DESPUÉS de las categorías principales. Solo si hay. */}
        {visibleSubcategories.length > 0 && (
          <div ref={subcategorySectionRef} className="mb-4">
            <h2 className="mb-2.5 text-base font-extrabold tracking-tight text-[var(--text-primary)] sm:text-lg">
              ¿Qué se te antoja hoy?
            </h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [scroll-snap-type:x_mandatory] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <button
                type="button"
                onClick={() => setSubCategoryId(null)}
                aria-pressed={subCategoryId === null}
                className={cn(
                  "group flex h-[84px] w-[84px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border transition-all sm:h-[100px] sm:w-[100px]",
                  subCategoryId === null
                    ? "border-[var(--accent)] bg-primary/10"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:-translate-y-0.5 hover:border-[var(--accent)]/50",
                )}
              >
                <Boxes className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
                <span className="text-[length:var(--ts-xs)] font-extrabold text-[var(--text-primary)]">
                  Todas
                </span>
              </button>
              <SubcategoryChips
                subcategories={visibleSubcategories}
                activeId={subCategoryId}
                onSelect={setSubCategoryId}
                variant="tile"
              />
            </div>
          </div>
        )}

        {/* ── DESKTOP SIDEBAR LAYOUT — lg:grid-cols-[280px_1fr]
             En < lg (mobile + tablet): los filtros y el grid quedan en flujo
             normal (columna única) igual que antes.
             En lg+: aside sticky izquierda + main derecha. */}
        <div className={manyStores ? "lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 lg:items-start" : ""}>
          {/*
          Brandon 2026-05-21 v3 — eliminados los chips legacy "Abierto ahora /
          4.5 o más / Sin mínimo" (componente QuickFilterChips) que se
          renderizaban arriba del filter bar.

          Razones:
          (1) DUPLICACIÓN — el chip "⭐ 4+" del filter bar (líneas 1055+)
              cubre el caso "top_rated" con la misma key.
          (2) FLASH — el gate `!isTiendasOnly` dependía del hook
              `useMarketplaceNavMode()` que arranca `null` en SSR; cuando
              en /tiendas el modo NO está forzado a "tiendas-only" en el
              superadmin, los chips legacy se renderizaban siempre.
          (3) FRICCIÓN — Brandon los considera antiguos; el nuevo flujo
              prioriza el sort dropdown + 4+ + filtros del drawer (modelo
              Doordash/Rappi).

          El `state activeChips` sigue vivo (lo lee el toggle ⭐ 4+, el
          URL sync, y `filteredStores` en MarketplaceStoresView). Solo se
          retiró el render UI duplicado.
        */}

          {/* ── ASIDE: Filtros (sidebar en lg+, flujo inline en <lg) ──
             En desktop: 280px sticky, separado del grid por gap-8.
             En mobile/tablet: flujo inline idéntico al anterior (mb-4). */}
          {/* Sidebar de filtros — rediseño minimalista (Brandon 2026-06-10):
            SIN tarjeta redondeada/sombra. Los filtros viven sobre el canvas,
            separados del grid por un hairline a la derecha (lg:border-r). Mismo
            lenguaje que QuickFilterToggle: radios sutiles, contornos en vez de
            fondos difuminados, estado activo = contorno oscuro sólido. */}
          {/* Audit filtros: aside SIEMPRE presente (barra slim). Los estilos de
              sidebar sticky/borde solo se aplican con muchas tiendas (columna
              280px); con pocas, la barra fluye a ancho completo arriba del grid. */}
          <aside
            aria-label="Filtros de tiendas"
            className={cn(
              // Compacto por defecto (barra slim); roomier solo como sidebar.
              "mb-2 space-y-2",
              // Filtros STICKY (Brandon 2026-07-06 v2): FLUSH al top (top-0), tipo
              // nav. Antes top-16 dejaba un hueco de 64px cuando el navbar se
              // escondía al scrollear → se veía "flotando". Ahora se pega arriba
              // de todo (fondo + blur tapan lo de atrás; el navbar z-50 lo cubre
              // al reaparecer). Con sidebar (muchas tiendas) usa su propio sticky.
              !manyStores &&
                "sticky top-0 z-30 -mx-4 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 px-4 py-2.5 backdrop-blur-md shadow-[0_4px_16px_-10px_rgba(0,0,0,0.2)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
              manyStores &&
                "lg:mb-0 lg:space-y-5 lg:sticky lg:top-28 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:pr-7 lg:border-r lg:border-[var(--rule-base)]",
            )}
          >
            {/* Chips COMPACTOS de categoría/subcategoría en la barra sticky
                (Brandon 2026-07-06 task 2): viajan con la barra al scrollear
                para quick-switch sin volver arriba. Solo cuando ya scrolleaste
                más allá de los tiles (evita duplicar los tiles grandes de
                arriba). Solo en la barra slim (!manyStores). */}
            {!manyStores && scrolledPastSubcategories && presentVerticals.length > 1 && (
              <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
                <button
                  type="button"
                  onClick={() => setVertical(null)}
                  aria-pressed={vertical === null}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-[length:var(--ts-xs)] font-bold whitespace-nowrap transition-colors",
                    vertical === null
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]",
                  )}
                >
                  Todas
                </button>
                {presentVerticals.map((v) => {
                  const active = vertical === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVertical(active ? null : v.id)}
                      aria-pressed={active}
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-[length:var(--ts-xs)] font-bold whitespace-nowrap transition-colors",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <v.Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      {v.label}
                    </button>
                  );
                })}
                {visibleSubcategories.length > 0 && (
                  <>
                    <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[var(--rule-base)]" />
                    <button
                      type="button"
                      onClick={() => setSubCategoryId(null)}
                      aria-pressed={subCategoryId === null}
                      className={cn(
                        "shrink-0 inline-flex items-center rounded-full border px-3 h-8 text-[length:var(--ts-xs)] font-bold whitespace-nowrap transition-colors",
                        subCategoryId === null
                          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      Todas
                    </button>
                    <SubcategoryChips
                      subcategories={visibleSubcategories}
                      activeId={subCategoryId}
                      onSelect={setSubCategoryId}
                      variant="pill"
                    />
                  </>
                )}
              </div>
            )}

            {/* Encabezado "Filtros · N | Limpiar" — SOLO en modo sidebar (muchas
              tiendas). Con la barra slim es redundante (la fila de chips activos
              ya trae "Limpiar todo"). Brandon 2026-07-06 (compactar). */}
            {manyStores && (
            <div className="hidden lg:flex items-center justify-between gap-2 pb-3 border-b border-[var(--rule-base)]">
              <div className="flex min-w-0 items-center gap-2">
                <SlidersHorizontal
                  className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                  strokeWidth={2}
                  aria-hidden
                />
                <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
                  Filtros
                </h2>
                {activeFilterCount > 0 && (
                  <span className="text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--text-tertiary)]">
                    · {activeFilterCount}
                  </span>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] transition-opacity hover:opacity-70"
                >
                  Limpiar
                </button>
              )}
            </div>
            )}

            {/* Chip "Repetir pedido" (Brandon 2026-06-10) — antes era una barra en
              la primera sección. Ahora pastilla compacta en los filtros. Solo
              logueado, sin búsqueda, md+. `empty:hidden` evita gap fantasma del
              space-y cuando el cliente no tiene un pedido reciente. */}
            {isLoggedIn && search.trim().length === 0 && (
              <div className="hidden md:flex empty:!hidden">
                <RepetirUltimoPedido variant="chip" />
              </div>
            )}

            {/* View-toggle de tablet REMOVIDO (Brandon 2026-07-06): Lista/Mapa
                ahora vive inline en la fila de filtros de arriba. */}

            {/* ── LO QUE SE TE ANTOJA — filtro PRINCIPAL por subcategoría.
               Brandon 2026-06-02: movido al TOPE del sidebar (lo primero que ve
               el cliente para filtrar por antojo) + tamaño grande. En mobile
               aparece como tira scrollable; en desktop como cards apiladas. */}
            {/* Subcategorías ("¿Qué se te antoja?") MOVIDAS del aside a la fila de
                tiles grandes bajo el banner (Brandon 2026-07-06). Acá ya no van. */}

            {/* "Lo más pedido" — antes label era "Subcategoría" (técnico, suena
              a panel admin). Brandon 2026-05-18 v3: renombrado a copy comercial
              que activa social proof y guía la elección del cliente.
              v4 (Brandon 2026-05-18): el botón "Filtros" del toolbar se MOVIÓ
              acá al lado del eyebrow — entrada principal de filtrado, al
              inicio del flujo de búsqueda de tiendas. Si no hay subcategorías,
              el botón sigue visible con eyebrow "Refiná tu búsqueda". */}
            {/* Brandon 2026-05-20 v7: eyebrow "LO MÁS PEDIDO / REFINÁ TU BÚSQUEDA"
              eliminado — redundaba con el h1 + chips de subcategoría justo
              debajo. El botón de filtros queda alineado a la derecha en el
              mismo bloque que las chips.
              Brandon 2026-05-21: agregamos chips inline en la fila (Sort
              dropdown + ⭐ 4+ toggle) para que no quede vacía y dar acción
              rápida sin abrir el drawer pesado. Modelo Doordash/Yelp. */}
            {/* Brandon 2026-05-21 v3: row de filtros estilo Rappi.
              - Sin justify-end (rompía mobile: el primer chip quedaba oculto).
              - Mobile: chips h-9 compactos, scroll-x natural desde la izquierda.
              - Desktop: tamaño normal con flex-wrap, sin scroll. */}
            {/* ── MOBILE/TABLET: fila compacta con scroll (orden + 4+ + abierto + drawer) ──
               Brandon 2026-05-31: gap más ajustado y sin margen extra (lo da el
               space-y del aside) → menos aire entre filtros y subcategorías. */}
            <div
              className={cn(
                "flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto sm:overflow-visible scrollbar-hide -mx-1 px-1 [scroll-snap-type:x_mandatory] sm:[scroll-snap-type:none]",
                manyStores && "lg:hidden",
              )}
            >
              {/* Sort "Relevancia" — OCULTO en celular (Brandon 2026-05-31): el
                orden vive dentro del drawer "Filtros" (extraSort) para que la
                fila quede limpia → 4+ · Abierto · Filtros. Visible desde sm
                (tablet) donde hay más ancho. */}
              <div className="hidden sm:flex shrink-0 [scroll-snap-align:start]">
                <StoresSortSelector value={sortKey} onChange={handleSortChange} />
              </div>
              <QuickFilterToggle
                active={activeChips.has("top_rated")}
                onToggle={() => handleChipToggle("top_rated")}
                icon={Star}
                label={`4+ estrellas${chipCounts.top_rated ? ` (${chipCounts.top_rated})` : ""}`}
                variant="pill"
                fillIconWhenActive
                title="Solo tiendas con rating 4 estrellas o más"
              />
              {/* audit #11: toggle "Abierto ahora" — chip open_now + filtro ya
                cableados (MarketplaceStoresView.passesChips). */}
              <QuickFilterToggle
                active={activeChips.has("open_now")}
                onToggle={() => handleChipToggle("open_now")}
                icon={Clock}
                label={`Abierto ahora${chipCounts.open_now ? ` (${chipCounts.open_now})` : ""}`}
                variant="pill"
                title="Solo tiendas abiertas en este momento"
              />
              {/* Fiado Digital — solo si alguna tienda lo ofrece. */}
              {anyAcceptsFiado && (
                <QuickFilterToggle
                  active={activeChips.has("accepts_fiado")}
                  onToggle={() => handleChipToggle("accepts_fiado")}
                  icon={Wallet}
                  label={`Acepta fiado${chipCounts.accepts_fiado ? ` (${chipCounts.accepts_fiado})` : ""}`}
                  variant="pill"
                  title="Solo tiendas que aceptan fiado (compra ahora, paga después)"
                />
              )}

              {/* Zona — en la MISMA fila (Brandon 2026-07-06). Abre el modal. */}
              {zonesForFilter.length > 1 && (
                <button
                  type="button"
                  onClick={() => setZoneModalOpen(true)}
                  aria-haspopup="dialog"
                  className={cn(
                    "shrink-0 inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition-colors [scroll-snap-align:start]",
                    zone
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]",
                  )}
                >
                  <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  <span className="max-w-[120px] truncate">
                    {zone ? (zonesForFilter.find((z) => z.id === zone)?.label ?? "Zona") : "Zona"}
                  </span>
                </button>
              )}

              {/* Lista / Mapa — en la MISMA fila, ACOPLADO junto a los demás
                  controles a la izquierda (Brandon 2026-07-06 v2: el ml-auto
                  dejaba un hueco vacío en el medio de la barra sticky; ahora
                  todo va tight y el conteo de tiendas ancla la derecha). */}
              <div className="shrink-0 inline-flex overflow-hidden rounded-full border border-[var(--rule-base)] [scroll-snap-align:start]">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  aria-label="Ver como lista"
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 px-3 text-sm font-bold transition-colors",
                    viewMode === "list"
                      ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <List className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Lista
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  aria-pressed={viewMode === "map"}
                  aria-label="Ver en el mapa"
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 border-l border-[var(--rule-base)] px-3 text-sm font-bold transition-colors",
                    viewMode === "map"
                      ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <MapIcon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Mapa
                </button>
              </div>

              <div className="shrink-0 [scroll-snap-align:start]">
                <MarketplaceFilters
                  filters={productFilters}
                  userCoords={userCoords}
                  geoLoading={geoLoading}
                  onChange={handleFiltersChange}
                  onRequestGeo={handleGeoSort}
                  hideProductCategory
                  hidePrice
                  zones={zonesForFilter}
                  zone={zone}
                  onZoneChange={setZone}
                  extraSort={{
                    value: sortKey,
                    onChange: (v) => handleSortChange(v as StoresSortKey),
                    options: STORES_SORT_OPTIONS,
                  }}
                  onClearAll={resetAllFilters}
                  globalActiveCount={activeFilterCount}
                  triggerCompact
                />
              </div>

              {/* Conteo de resultados — ANCLA la barra sticky a la derecha para
                  que no quede un hueco vacío (Brandon 2026-07-06 v2). Solo
                  desktop: en mobile la fila scrollea y el conteo estorbaría. */}
              <span className="ml-auto hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-[var(--text-secondary)] lg:inline-flex">
                <Store
                  className="h-4 w-4 text-[var(--text-tertiary)]"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="tabular-nums text-[var(--text-primary)]">
                  {finalStores.length}
                </span>
                {finalStores.length === 1 ? "tienda" : "tiendas"}
              </span>
            </div>

            {/* Chips de filtro activo — feedback + remoción por chip (audit
              filtros #4). Visibles apenas hay ≥1 filtro, en todos los breakpoints. */}
            {activeFilterPills.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {activeFilterPills.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={f.remove}
                    aria-label={`Quitar filtro ${f.label}`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 h-7 text-[length:var(--ts-xs)] font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/15"
                  >
                    <span className="max-w-[140px] truncate">{f.label}</span>
                    <X className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex h-7 items-center px-2 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] underline underline-offset-2 transition-colors hover:text-[var(--accent)]"
                >
                  Limpiar todo
                </button>
              </div>
            )}

            {/* ── DESKTOP: sidebar expandido (secciones apiladas) — SOLO con
              muchas tiendas (>6). Con pocas, la barra slim de arriba ya trae
              4+/Abierto/Fiado como pills. Brandon 2026-07-06 (audit filtros). ── */}
            {manyStores && (
            <div className="hidden lg:flex lg:flex-col lg:gap-4">
              {/* CALIFICACIÓN */}
              <div className="border-t border-[var(--rule-soft)] pt-4">
                <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                  Calificación
                </p>
                <QuickFilterToggle
                  active={activeChips.has("top_rated")}
                  onToggle={() => handleChipToggle("top_rated")}
                  icon={Star}
                  label="4 estrellas o más"
                  variant="full"
                  fillIconWhenActive
                />
              </div>
              {/* DISPONIBILIDAD */}
              <div className="border-t border-[var(--rule-soft)] pt-4">
                <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                  Disponibilidad
                </p>
                <QuickFilterToggle
                  active={activeChips.has("open_now")}
                  onToggle={() => handleChipToggle("open_now")}
                  icon={Clock}
                  label="Abierto ahora"
                  variant="full"
                />
              </div>
              {/* PAGO — Fiado Digital (solo si alguna tienda lo ofrece) */}
              {anyAcceptsFiado && (
                <div className="border-t border-[var(--rule-soft)] pt-4">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Pago</p>
                  <QuickFilterToggle
                    active={activeChips.has("accepts_fiado")}
                    onToggle={() => handleChipToggle("accepts_fiado")}
                    icon={Wallet}
                    label="Acepta fiado"
                    variant="full"
                  />
                </div>
              )}
            </div>
            )}

            {/* "Lo que se te antoja" se movió al TOPE del sidebar (Brandon
              2026-06-02) — ver bloque justo debajo del header "Filtrar tiendas". */}

            {/* Botón de zona separado REMOVIDO (Brandon 2026-07-06): la Zona
                ahora vive inline en la fila de filtros de arriba (abre el mismo
                modal). El modal se conserva abajo. */}

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
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
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
                      <span aria-hidden className="text-xl font-black leading-none">
                        ×
                      </span>
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
                                  ? "border-[var(--text-primary)] bg-[var(--surface-sunken)]"
                                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/50 hover:bg-primary/10/30",
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

            {/* Brandon 2026-05-18 v4: toolbar de filtros REMOVIDO. El botón de
              filtros se movió al header "Lo más pedido" arriba (entrada
              principal del flujo de filtrado). El sort, zone, price y
              clear-all ya viven dentro del drawer de filtros — no necesitamos
              un toolbar separado para ellos. */}
          </aside>

          {/* ── MAIN: Grid de tiendas ── */}
          <div className="min-w-0">
            {/* Toolbar superior (desktop) — SOLO en modo sidebar (muchas tiendas).
              Con pocas tiendas, Ordenar + Lista/Mapa ya viven en la fila slim de
              filtros de arriba (Brandon 2026-07-06). Evita el toolbar duplicado. */}
            {manyStores && (
            <div className="hidden lg:flex items-center justify-end gap-3 mb-4 pb-3 border-b border-[var(--rule-soft)]">
              <StoresSortSelector
                value={sortKey}
                onChange={handleSortChange}
                className="!rounded-sm hover:!bg-[var(--surface-sunken)] hover:!border-[var(--text-primary)]/40"
              />
              <div className="grid grid-cols-2 rounded-sm border border-[var(--rule-base)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-pressed={viewMode === "list"}
                  aria-label="Ver como lista"
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1.5 px-3 text-sm font-medium transition-colors",
                    viewMode === "list"
                      ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <List className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Lista
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("map")}
                  aria-pressed={viewMode === "map"}
                  aria-label="Ver en el mapa"
                  className={cn(
                    "inline-flex h-9 items-center justify-center gap-1.5 border-l border-[var(--rule-base)] px-3 text-sm font-medium transition-colors",
                    viewMode === "map"
                      ? "bg-[var(--text-primary)] text-[var(--surface-raised)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <MapIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Mapa
                </button>
              </div>
            </div>
            )}

            {/* Listado o Mapa según viewMode (Brandon 2026-06-02). */}
            {viewMode === "map" ? (
              <TiendasMap stores={finalStores} userCoords={userCoords} />
            ) : (
              <MarketplaceStoresView
                stores={stores}
                premiumProducts={premiumProducts}
                loading={loading}
                error={error}
                search={search}
                category={category}
                zone={zone}
                geoActive={geoActive}
                userCoords={userCoords}
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
          </div>
          {/* /main grid */}
        </div>
        {/* /lg:grid sidebar layout */}
      </section>

      {/* ── Referido por WhatsApp (Brandon 2026-06-02) — crecimiento viral.
           Después del grid: el cliente ya vio las tiendas, ahora lo invitamos
           a traer vecinos. Logueado = link personal + 50 puntos c/u; anónimo =
           share genérico que igual trae tráfico. ── */}
      {search.trim().length === 0 && <InvitaVecinoCard />}

      {/* "Sumate a Buleje" vive UNA sola vez: la sección JoinUsSection que
          renderiza tiendas/page.tsx (mejorada creativa). Antes había un
          SumateBulejeSection duplicado acá — removido (Brandon 2026-07-06). */}

      {/* Footer vive en el layout `/tiendas/layout.tsx` (persistente). */}
    </div>
  );
}
