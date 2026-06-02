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
  Store, MapPin, ArrowUpRight, Bike,
  Search as SearchIcon, ShoppingBag, ChevronRight,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
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
const ExplorarTracker = dynamic(
  () => import("@/components/marketplace/explorar/ExplorarTracker"),
  { ssr: false },
);
// Brandon 2026-05-18 perf P0 #2: MarketplaceFilters es 691 LOC y se monta
// dos veces (mobile + desktop). Lazy-load del componente; el type sigue siendo
// import estático para no romper el tipado de DEFAULT_FILTERS.
import type { MarketplaceFiltersState } from "@/components/marketplace/MarketplaceFilters";
import { Boxes, Package, Sparkles, Leaf, MoreHorizontal, Star, SlidersHorizontal, Clock } from "@buleje/design-system/icons";
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
import TiendasBreadcrumb from "@/components/marketplace/TiendasBreadcrumb";
import TiendasSectionHeader from "@/components/marketplace/TiendasSectionHeader";
import TiendasLocationBar from "@/components/marketplace/TiendasLocationBar";
import TiendasWelcomeBanner from "@/components/marketplace/TiendasWelcomeBanner";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
// `dynamic` ya está importado al top — usado por ExplorarTracker, MarketplaceFilters,
// SearchAutocomplete y los strips desktop-only (Tiendas*Strip).

// Brandon 2026-05-18 v3: TiendasMap dynamic removido — toggle Lista/Mapa
// eliminado del toolbar.

// Brandon 2026-05-18 perf P0 #2: MarketplaceFilters (691 LOC) lazy.
// El placeholder ocupa el slot visual hasta que el chunk carga, así no hay
// jump de layout en mobile/desktop. ssr:false porque el componente usa
// localStorage + window.matchMedia y no aporta SEO.
const MarketplaceFilters = dynamic(
  () => import("@/components/marketplace/MarketplaceFilters"),
  {
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
  },
);

// Brandon 2026-05-18 perf P1 #6: SearchAutocomplete oculto en mobile (hero
// sm+ only); el navbar mobile tiene su propio search pill. ssr:false +
// placeholder con la misma altura/borde para evitar layout shift.
const SearchAutocomplete = dynamic(
  () => import("@/components/marketplace/SearchAutocomplete"),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-12 w-full rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)]"
      />
    ),
  },
);

// Brandon 2026-05-18 perf P1 #6: TiendasHeroAds — banner rotante de promos
// del superadmin. Solo visible en sm+ y cuando no hay query. Lazy con ssr:false
// y placeholder ancho/alto fijo (no layout shift al hidratar).
const TiendasHeroAds = dynamic(
  () => import("@/components/marketplace/TiendasHeroAds"),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="max-w-[1760px] mx-auto mt-4 px-4 sm:px-6 lg:px-8"
      >
        <div className="h-32 w-full rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)]" />
      </div>
    ),
  },
);

// Brandon 2026-05-20 perf mobile: componentes que viven solo en sm+ (eran
// `hidden sm:block` o `hidden sm:contents`). Convertidos a dynamic con
// ssr:false: mobile no descarga el JS, no hidrata, no corre hooks (fetch,
// useCustomerOrders, geolocation). Gateados además por useMediaQuery abajo.
const TiendasPromoCards = dynamic(
  () => import("@/components/marketplace/TiendasPromoCards"),
  { ssr: false, loading: () => null },
);
const MisTiendasFavoritasStrip = dynamic(
  () => import("@/components/marketplace/MisTiendasFavoritasStrip"),
  { ssr: false, loading: () => null },
);
const TusTiendasStrip = dynamic(
  () => import("@/components/marketplace/TusTiendasStrip"),
  { ssr: false, loading: () => null },
);
const RepetirUltimoPedido = dynamic(
  () => import("@/components/marketplace/RepetirUltimoPedido"),
  { ssr: false, loading: () => null },
);
const InvitaVecinoCard = dynamic(
  () => import("@/components/marketplace/InvitaVecinoCard"),
  { ssr: false, loading: () => null },
);
const CuponBienvenidaBar = dynamic(
  () => import("@/components/marketplace/CuponBienvenidaBar"),
  { ssr: false, loading: () => null },
);
const MisPedidosFavoritosStrip = dynamic(
  () => import("@/components/marketplace/MisPedidosFavoritosStrip"),
  { ssr: false, loading: () => null },
);
const FeaturedStoresNearby = dynamic(
  () => import("@/components/marketplace/FeaturedStoresNearby"),
  { ssr: false, loading: () => null },
);
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
  /** Stores pre-fetched en el server (fix bug back-nav cross-layout Next 16).
   *  El HTML server-rendered ya tiene la lista materializada, así que aunque
   *  la hidratación cliente quede frozen tras un back nav, los items siguen
   *  visibles. El client useEffect refresca/filtra normalmente. */
  initialStores?: MarketplaceStore[];
  /** Productos por slug para las cards Premium (beneficio superadmin). */
  premiumProducts?: Record<string, import("@/components/marketplace/PremiumStoreCard").PremiumProduct[]>;
}

export default function TiendasClient({ initialZone, initialStores = [], premiumProducts = {} }: TiendasClientProps = {}) {
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
  useEffect(() => { subCategoryIdRef.current = subCategoryId; }, [subCategoryId]);

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
          (s) =>
            Array.isArray(s.linkedStoreSlugs) && s.linkedStoreSlugs.length > 0,
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

  // Brandon 2026-05-18 v3: viewMode state removido. Antes alternaba lista/mapa
  // (TiendasMap Leaflet). El cliente del directorio busca por filtros, no por
  // ubicación visual — y los chips de zona ya cubren el caso geográfico. El
  // import dynamic de TiendasMap también se eliminó del top del archivo.

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
  useTiendasUrlSync({ search, category, zone, sortKey, activeChips, subCategoryId, initialZone });

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
    (zone ? 1 : 0) +
    (subCategoryId ? 1 : 0) +
    (geoActive ? 1 : 0) +
    activeChips.size +
    (sortKey !== "relevance" ? 1 : 0) +
    (productFilters.minPrice > 0 || productFilters.maxPrice < MAX_PRICE_LIMIT ? 1 : 0);

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
      try { router.refresh(); } catch {}
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
    const base =
      activeChips.size === 0
        ? subcategoryFiltered
        : subcategoryFiltered.filter((s) =>
            passesChips(
              s as MarketplaceStore & Partial<StoreChipFields>,
              activeChips,
            ),
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
  }, [subcategoryFiltered, activeChips]);

  // Brandon 2026-05-18 perf P2 #10: antes `stores.some(...)` se evaluaba
  // inline en JSX (en cada render). Ahora memoizado contra `stores` solo.
  const hasActiveOffers = useMemo(
    () =>
      stores.some((s) => ((s as { activePromos?: number }).activePromos ?? 0) > 0),
    [stores],
  );

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
            "sm:hidden fixed left-0 right-0 top-[52px] z-40 will-change-transform",
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
              <SubcategoryChips
                subcategories={subcategories}
                activeId={subCategoryId}
                onSelect={setSubCategoryId}
                variant="pill"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── TS-47 breadcrumb visible + JSON-LD ──────────────────────────────
           Oculto en modo `tiendas-only` — el link "Inicio" llevaría
           fuera del contexto de tienda y confundiría al usuario. */}
      {!isTiendasOnly && <TiendasBreadcrumb zonaLabel={zonaLabel} />}

      {/* Brandon 2026-05-20 v6: HERO REMOVIDO de /tiendas.
          El cliente que llega aquí ya decidió comprar — no necesita más
          mensajes editoriales. Debe ver filtros + tiendas directo. La
          información comercial (h1 "Las mejores tiendas de tu barrio",
          stats, descripción) vive en home (/). */}

      {/* ── Cupón de bienvenida (Brandon 2026-06-02) — ARRIBA del hero, visible
           al abrir, solo para usuarios nuevos (el componente se auto-gatea por
           primer-pedido + dismiss). Saca el cupón de adentro del hero rotante. */}
      {search.trim().length === 0 && <CuponBienvenidaBar />}

      {/* ── Banner rotante de promos (gestionado desde superadmin) ─────
           Aparece solo cuando NO hay búsqueda activa para no competir
           con el hero de resultados. Brandon mayo 14 2026: oculto en
           mobile — el cliente quiere ir directo a categorías y tiendas. */}
      {search.trim().length === 0 && (
        <div className="hidden sm:block">
          <TiendasHeroAds zone={zone || null} />
        </div>
      )}

      {/* ── Hero de resultados de búsqueda — solo cuando hay query activa ─
           Da prioridad visual a la tienda buscada antes de las secciones
           promocionales. Especialmente útil en modo tiendas-only. */}
      {search.trim().length > 0 && stores.length > 0 && (
        <section className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-6">
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

            {/* A3 — búsqueda por PRODUCTO cross-tienda. El vecino busca
                "gaseosa", no "bodega": le ofrecemos saltar a la búsqueda de
                productos en TODAS las tiendas (que sí matchea por producto). */}
            <Link
              href={`/marketplace/buscar?q=${encodeURIComponent(search.trim())}`}
              className="mt-4 flex items-center gap-3 rounded-xl border-2 border-dashed border-[var(--accent)]/40 bg-[var(--surface-canvas)] p-3.5 transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/40"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
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
              <ArrowUpRight className="h-4.5 w-4.5 shrink-0 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
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
      {/* "Repetir último pedido" — barra sticky slim. Brandon 2026-06-02:
          ahora TAMBIÉN en mobile (antes hidden sm:block) — la mayoría pide
          desde el cel y repetir es la acción de retención #1. Solo aparece
          si el cliente está logueado, sin búsqueda activa, y tiene un pedido
          reciente en localStorage (grabado post-checkout). */}
      {isLoggedIn && search.trim().length === 0 && <RepetirUltimoPedido />}

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
              Wrap con max-w-[1760px] para alinear con el resto de
              secciones del directorio. */}
          <section className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16">
            <FeaturedStoresNearby userCoords={userCoords} />
          </section>
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
        <div className="sm:hidden flex flex-col gap-1.5 mb-2">
          <TiendasLocationBar />
          <TiendasWelcomeBanner />
        </div>

        {/* h2 — el H1 único de la página es el sr-only en app/tiendas/page.tsx
            (server, SSR). Estos eran H1 duplicados (3 H1 → audit SEO 2026-05-31);
            degradados a H2 para jerarquía limpia H1→H2→H3 (cards). */}
        <h2 className="sm:hidden sr-only">
          Tiendas y bodegas en {BRAND_GEO.city} con delivery
        </h2>

        {/* h2 desktop compacto — 1 línea, sin párrafos extra */}
        <h2 className="hidden sm:block text-2xl lg:text-3xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] leading-tight mb-6">
          Tiendas en{" "}
          <span className="text-[var(--accent)]">{BRAND_GEO.city}</span>
        </h2>

        {/* ── DESKTOP SIDEBAR LAYOUT — lg:grid-cols-[280px_1fr]
             En < lg (mobile + tablet): los filtros y el grid quedan en flujo
             normal (columna única) igual que antes.
             En lg+: aside sticky izquierda + main derecha. */}
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 lg:items-start">

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
        <aside
          aria-label="Filtros de tiendas"
          className="space-y-3 mb-3 lg:space-y-4 lg:mb-0 lg:sticky lg:top-20 lg:self-start lg:bg-[var(--surface-raised)] lg:rounded-2xl lg:border lg:border-[var(--rule-soft)] lg:p-5 lg:shadow-sm"
        >
          {/* Encabezado sidebar — solo visible en desktop. Muestra el nº de
              filtros activos + acceso rápido a limpiar (modelo Amazon/Rappi). */}
          <div className="hidden lg:flex items-center justify-between pb-3 border-b border-[var(--rule-soft)]">
            <h2 className="inline-flex items-center gap-2 text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
              <SlidersHorizontal className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
              Filtrar tiendas
              {activeFilterCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
                  {activeFilterCount}
                </span>
              )}
            </h2>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-xs font-bold text-[var(--accent)] hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* ── LO QUE SE TE ANTOJA — filtro PRINCIPAL por subcategoría.
               Brandon 2026-06-02: movido al TOPE del sidebar (lo primero que ve
               el cliente para filtrar por antojo) + tamaño grande. En mobile
               aparece como tira scrollable; en desktop como cards apiladas. */}
          {subcategories.length > 0 && (
            <div
              ref={subcategorySectionRef}
              className="lg:pb-4 lg:mb-1 lg:border-b lg:border-[var(--rule-soft)]"
            >
              <p className="mb-2.5 flex items-center gap-2 text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                <Sparkles className="h-5 w-5 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
                Lo que se te antoja
              </p>
              {/* Mobile/tablet: tira horizontal con cards icono + label */}
              <div
                role="group"
                aria-label="Filtrá por categoría"
                className="flex lg:hidden items-center gap-2 overflow-x-auto scrollbar-hide pb-1"
              >
                <SubcategoryChips
                  subcategories={subcategories}
                  activeId={subCategoryId}
                  onSelect={setSubCategoryId}
                  variant="card"
                />
              </div>
              {/* Desktop sidebar: cards grandes apiladas (filtro estrella) */}
              <div
                role="group"
                aria-label="Filtrá por categoría"
                className="hidden lg:flex flex-col gap-2"
              >
                <SubcategoryChips
                  subcategories={subcategories}
                  activeId={subCategoryId}
                  onSelect={setSubCategoryId}
                  variant="row"
                />
              </div>
            </div>
          )}

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
          <div className="flex lg:hidden items-center gap-1.5 sm:gap-2.5 overflow-x-auto sm:overflow-visible scrollbar-hide -mx-1 px-1 [scroll-snap-type:x_mandatory] sm:[scroll-snap-type:none]">
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
              label="4+ estrellas"
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
              label="Abierto ahora"
              variant="pill"
              title="Solo tiendas abiertas en este momento"
            />
            <div className="shrink-0 [scroll-snap-align:start]">
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
          </div>

          {/* ── DESKTOP: secciones limpias apiladas (sin drawer) ── */}
          <div className="hidden lg:flex lg:flex-col lg:gap-4">
            {/* ORDENAR */}
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
                Ordenar
              </p>
              <StoresSortSelector value={sortKey} onChange={handleSortChange} className="w-full justify-between" />
            </div>
            {/* CALIFICACIÓN */}
            <div className="border-t border-[var(--rule-soft)] pt-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
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
            {/* DISPONIBILIDAD — toggle "Abierto ahora" (audit #11). Filtro ya
                cableado en MarketplaceStoresView; acá solo el control desktop. */}
            <div className="border-t border-[var(--rule-soft)] pt-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
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
          </div>

          {/* "Lo que se te antoja" se movió al TOPE del sidebar (Brandon
              2026-06-02) — ver bloque justo debajo del header "Filtrar tiendas". */}

          {/* Filtrar por zona = botón único que abre modal.
              Brandon mayo 14 2026: las cajitas inline de zonas saturaban
              la UI cuando había muchas zonas. Ahora un solo botón con la
              zona activa visible (o "Todas las zonas") + modal con la
              lista completa al tap.
              Brandon mayo 18 2026: en mobile, la zona vive dentro del modal
              de filtros (chips junto a categoría/precio) — escondemos este
              botón inline. En desktop sigue visible. */}
          {zonesForFilter.length > 1 && (
          <div className="hidden sm:block lg:border-t lg:border-[var(--rule-soft)] lg:pt-3">
            {/* Label solo visible en desktop sidebar */}
            <p className="hidden lg:block text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
              Zona
            </p>
            <button
              type="button"
              onClick={() => setZoneModalOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={zoneModalOpen}
              className={cn(
                "w-full sm:w-auto lg:w-full inline-flex items-center gap-3 rounded-2xl lg:rounded-xl border-2 transition-all px-4 h-12 sm:h-14 lg:h-11 shadow-sm hover:shadow-md hover:-translate-y-0.5 lg:hover:translate-y-0",
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

          {/* Brandon 2026-05-18 v4: toolbar de filtros REMOVIDO. El botón de
              filtros se movió al header "Lo más pedido" arriba (entrada
              principal del flujo de filtrado). El sort, zone, price y
              clear-all ya viven dentro del drawer de filtros — no necesitamos
              un toolbar separado para ellos. */}
        </aside>

        {/* ── MAIN: Grid de tiendas ── */}
        <div className="min-w-0">
          {/* ── TIRA DE CATEGORÍAS (Brandon 2026-06-02) — acceso horizontal
               rápido arriba del grid (desktop; en mobile/tablet ya están el
               scroll del sidebar + la barra sticky). Misma data + mismo
               subCategoryId que el sidebar → quedan sincronizados. ── */}
          {subcategories.length > 0 && (
            <div className="hidden lg:block mb-5">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                <button
                  type="button"
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
                <SubcategoryChips
                  subcategories={subcategories}
                  activeId={subCategoryId}
                  onSelect={setSubCategoryId}
                  variant="pill"
                />
              </div>
            </div>
          )}

          {/* Mini-label minimalista arriba del grid de tiendas — solo cuando
              hay resultados. Brandon 2026-05-21: reemplaza el bloque h2+p
              largo anterior. Pattern: eyebrow uppercase con count tabular. */}
          {!loading && !error && finalStores.length > 0 && (
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Todas nuestras tiendas{" "}
                <span className="text-[var(--accent)] tabular-nums">
                  · {finalStores.length}
                </span>
              </p>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                Entrega hoy
              </p>
            </div>
          )}

          {/* Listado de tiendas — vista mapa removida (Brandon 2026-05-18 v3). */}
          <MarketplaceStoresView
            stores={stores}
            premiumProducts={premiumProducts}
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
        </div>{/* /main grid */}

        </div>{/* /lg:grid sidebar layout */}
      </section>

      {/* ── Referido por WhatsApp (Brandon 2026-06-02) — crecimiento viral.
           Después del grid: el cliente ya vio las tiendas, ahora lo invitamos
           a traer vecinos. Logueado = link personal + 50 puntos c/u; anónimo =
           share genérico que igual trae tráfico. ── */}
      {search.trim().length === 0 && <InvitaVecinoCard />}

      {/* Brandon 2026-05-20 v7: SECCIÓN "Sumate a Buleje" REMOVIDA de /tiendas.
          Era una intrusión B2B (bodegueros/repartidores) en una página B2C
          de compra — distraía al cliente del flujo "ver tienda → comprar".
          Esos CTAs viven naturalmente en home (/), /negocios y /abrir-tienda.
          El footer (BottomNav + Footer del chrome unificado) ya tiene links
          a "Abre tu tienda" y "Para repartidores" para quien los necesite. */}

      {/* Footer vive en el layout `/tiendas/layout.tsx` (persistente). */}
    </div>
  );
}
