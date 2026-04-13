"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  MapPin,
  Star,
  Store,
  ShoppingBag,
  ChevronRight,
  TrendingUp,
  Clock,
  Package,
  LocateFixed,
  LayoutGrid,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { m, AnimatePresence } from "framer-motion";
import MarketplaceFilters, {
  type MarketplaceFiltersState,
} from "@/components/marketplace/MarketplaceFilters";
import dynamic from "next/dynamic";
import PersonalizedRecommendations from "@/components/marketplace/PersonalizedRecommendations";
import CatalogSections from "@/components/marketplace/CatalogSections";
import SearchAutocomplete from "@/components/marketplace/SearchAutocomplete";

const CatalogView = dynamic(
  () => import("@/components/marketplace/CatalogView"),
  { ssr: false, loading: () => <CatalogSkeleton /> }
);

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-6">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="aspect-square bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/2 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

type ViewMode = "tiendas" | "catalogo";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface MarketplaceStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  description: string | null;
  lat?: number | null;
  lng?: number | null;
  vacationMode?: boolean;
  vacationMessage?: string | null;
}

interface ProductPreview {
  id: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
}

/* ── Zone approximate coords for Pucallpa (geo fallback) ───────────────────── */

const ZONE_COORDS: Record<string, [number, number]> = {
  centro: [-8.3808, -74.5333],
  manantay: [-8.4031, -74.5156],
  calleria: [-8.37, -74.55],
  yarinacocha: [-8.2556, -74.5111],
  campo_verde: [-8.3833, -74.4667],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Category config ───────────────────────────────────────────────────────── */

const CATEGORIES = [
  { id: "todos", label: "Todos", emoji: "🏪" },
  { id: "bodega", label: "Bodegas", emoji: "🛒" },
  { id: "minimarket", label: "Minimarkets", emoji: "🏬" },
  { id: "fruteria", label: "Fruterías", emoji: "🍎" },
  { id: "carniceria", label: "Carnicerías", emoji: "🥩" },
  { id: "panaderia", label: "Panaderías", emoji: "🍞" },
  { id: "licoreria", label: "Licorerías", emoji: "🍷" },
  { id: "farmacia", label: "Farmacias", emoji: "💊" },
  { id: "restaurante", label: "Restaurantes", emoji: "🍽️" },
];

/* ── Zones ─────────────────────────────────────────────────────────────────── */

const ZONES = [
  { id: "", label: "Todas las zonas" },
  { id: "centro", label: "Centro" },
  { id: "manantay", label: "Manantay" },
  { id: "calleria", label: "Callerìa" },
  { id: "yarinacocha", label: "Yarinacocha" },
  { id: "campo_verde", label: "Campo Verde" },
];

/* ── Store Card ────────────────────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function StoreCard({ store, index }: { store: MarketplaceStore; index: number }) {
  const categoryMeta = CATEGORIES.find((c) => c.id === store.category) ?? CATEGORIES[0];
  const [preview, setPreview] = useState<ProductPreview[]>([]);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadPreview = useCallback(async () => {
    if (previewLoaded || previewLoading) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/marketplace/stores/${store.slug}/products?limit=3`);
      if (res.ok) {
        const json = await res.json();
        setPreview(json.data?.slice(0, 3) ?? []);
      }
    } catch {
      /* silent fail */
    }
    setPreviewLoading(false);
    setPreviewLoaded(true);
  }, [store.slug, previewLoaded, previewLoading]);

  return (
    <m.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      onMouseEnter={loadPreview}
      onFocus={loadPreview}
    >
      <Link
        href={`/marketplace/${store.slug}`}
        className="group block bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 hover:-translate-y-1"
      >
        {/* Banner / gradient top */}
        <div className="relative h-32 bg-linear-to-br from-primary/10 via-primary/5 to-secondary/10 dark:from-primary/20 dark:via-primary/10 dark:to-secondary/20 overflow-hidden">
          {store.logo ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-20 h-20 rounded-2xl bg-white dark:bg-card shadow-lg border-2 border-white dark:border-card-border overflow-hidden group-hover:scale-110 transition-transform duration-300">
                <Image
                  src={store.logo}
                  alt={store.name}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center border-2 border-white dark:border-card-border shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Store className="h-10 w-10 text-primary" />
              </div>
            </div>
          )}

          {/* Category badge */}
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/90 dark:bg-card/90 backdrop-blur-sm text-xs font-bold text-gray-700 dark:text-foreground shadow-sm">
            {categoryMeta.emoji} {categoryMeta.label}
          </span>

          {/* Vacation badge */}
          {store.vacationMode && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100/95 dark:bg-amber-900/80 backdrop-blur-sm text-xs font-bold text-amber-700 dark:text-amber-300 shadow-sm">
              🏖️ De vacaciones
            </span>
          )}

          {/* Rating badge */}
          {store.rating > 0 && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-xs font-bold text-amber-700 dark:text-amber-400">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {store.rating.toFixed(1)}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg leading-tight group-hover:text-primary transition-colors line-clamp-1">
            {store.name}
          </h3>

          {store.description && (
            <p className="text-sm text-gray-500 dark:text-muted mt-1.5 line-clamp-2 leading-relaxed">
              {store.description}
            </p>
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {store.zone && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-muted">
                <MapPin className="h-3 w-3" />
                {store.zone}
              </span>
            )}
            {store.reviewCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-muted">
                <ShoppingBag className="h-3 w-3" />
                {store.reviewCount} reseña{store.reviewCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* CTA */}
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-bold text-primary group-hover:underline">
              Ver productos
            </span>
            <ChevronRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Product preview strip — visible on hover */}
          <AnimatePresence>
            {(previewLoading || previewLoaded) && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-3 pt-3 border-t border-gray-100 dark:border-card-border overflow-hidden"
              >
                {previewLoading ? (
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex-1 h-16 rounded-xl bg-gray-100 dark:bg-surface animate-pulse" />
                    ))}
                  </div>
                ) : preview.length > 0 ? (
                  <div className="flex gap-2">
                    {preview.map((p) => (
                      <div key={p.id} className="flex-1 rounded-xl overflow-hidden border border-gray-100 dark:border-card-border bg-gray-50 dark:bg-surface">
                        <div className="relative h-12 bg-gray-100 dark:bg-surface">
                          {p.image ? (
                            <Image
                              src={p.image}
                              alt={p.name}
                              fill
                              className="object-cover"
                              sizes="72px"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Package className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                            </div>
                          )}
                        </div>
                        <div className="px-1.5 py-1">
                          <p className="text-[10px] font-semibold text-gray-600 dark:text-muted line-clamp-1">
                            {p.name}
                          </p>
                          <p className="text-[10px] font-bold text-primary">
                            {fmt(p.price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 dark:text-muted text-center py-1">Sin productos disponibles</p>
                )}
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </Link>
    </m.div>
  );
}

/* ── Main Content ──────────────────────────────────────────────────────────── */

const MAX_PRICE_LIMIT = 500;

const DEFAULT_FILTERS: MarketplaceFiltersState = {
  minPrice: 0,
  maxPrice: MAX_PRICE_LIMIT,
  productCategory: null,
  sortBy: "relevance",
  nearbyEnabled: false,
};

export default function MarketplaceContent() {
  const searchParams = useSearchParams();
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

  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get("buscar") ?? "");
  const [category, setCategory] = useState(mappedCategory);
  const [zone, setZone] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoActive, setGeoActive] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [productFilters, setProductFilters] = useState<MarketplaceFiltersState>(DEFAULT_FILTERS);

  // ── New: view mode ──
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "tiendas";
    return (localStorage.getItem("marketplace-view-mode") as ViewMode) || "tiendas";
  });

  // Persist view mode preference
  useEffect(() => {
    try { localStorage.setItem("marketplace-view-mode", viewMode); } catch { /* silent */ }
  }, [viewMode]);

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
  }, []);


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
    const timer = setTimeout(fetchStores, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetchStores, search]);

  const filteredStores = useMemo(() => {
    if (!geoActive || !userCoords) return stores;

    return [...stores].sort((a, b) => {
      const coordsA = a.lat && a.lng
        ? [a.lat, a.lng]
        : ZONE_COORDS[a.zone?.toLowerCase().replace(/ /g, "_") ?? ""] ?? null;
      const coordsB = b.lat && b.lng
        ? [b.lat, b.lng]
        : ZONE_COORDS[b.zone?.toLowerCase().replace(/ /g, "_") ?? ""] ?? null;

      if (!coordsA && !coordsB) return 0;
      if (!coordsA) return 1;
      if (!coordsB) return -1;

      const distA = haversineKm(userCoords.lat, userCoords.lng, coordsA[0], coordsA[1]);
      const distB = haversineKm(userCoords.lat, userCoords.lng, coordsB[0], coordsB[1]);
      return distA - distB;
    });
  }, [stores, geoActive, userCoords]);

  const handleGeoSort = useCallback(() => {
    if (geoActive) {
      setGeoActive(false);
      setUserCoords(null);
      setProductFilters((prev) => ({ ...prev, nearbyEnabled: false }));
      return;
    }
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoActive(true);
        setGeoLoading(false);
        setProductFilters((prev) => ({ ...prev, nearbyEnabled: true }));
      },
      () => {
        setGeoLoading(false);
        setProductFilters((prev) => ({ ...prev, nearbyEnabled: false }));
        alert(
          "No pudimos obtener tu ubicación. Para ver tiendas cerca, permití la ubicación en la configuración de tu navegador.",
        );
      },
      { timeout: 8000 },
    );
  }, [geoActive]);

  return (
    <div className="relative">
      {/* ── Hero Section ── */}
      <section className="relative overflow-hidden bg-linear-to-br from-primary/5 via-white to-secondary/5 dark:from-primary/10 dark:via-background dark:to-secondary/10 pb-6 pt-5 sm:pt-8 sm:pb-8">
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
              Encuentra las mejores bodegas y tiendas cerca de ti.
              Compra de varios negocios en un solo pedido.
            </m.p>

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
              <Store className="h-4 w-4 text-primary" />
              <strong className="text-gray-900 dark:text-foreground">{stores.length}</strong> tiendas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" />
              Abierto 24/7
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" />
              Delivery rápido
            </span>
            {geoActive && (
              <span className="inline-flex items-center gap-1.5 text-primary font-semibold">
                <LocateFixed className="h-4 w-4" />
                Ordenado por cercanía
              </span>
            )}
          </m.div>

          {/* ── View Mode Toggle ── */}
          <m.div
            className="flex items-center justify-center mt-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="inline-flex items-center rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-1 shadow-md shadow-gray-200/40 dark:shadow-none">
              <button
                onClick={() => setViewMode("tiendas")}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                  viewMode === "tiendas"
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
              >
                <Store className="h-4 w-4" />
                Tiendas
              </button>
              <button
                onClick={() => setViewMode("catalogo")}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                  viewMode === "catalogo"
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Catálogo
              </button>
            </div>
          </m.div>
        </div>
      </section>

      {/* ── Filters + Grid ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Category pills — arriba de todo */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap border transition-all shrink-0",
                category === cat.id
                  ? "bg-primary text-white border-primary shadow-md shadow-primary/25"
                  : "bg-white dark:bg-card text-gray-600 dark:text-muted border-gray-200 dark:border-card-border hover:border-primary/40 hover:text-primary",
              )}
            >
              <span className="text-base">{cat.emoji}</span>
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
                {z.id ? `📍 ${z.label}` : "📍 Todas las zonas"}
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
              className="text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors underline"
            >
              Limpiar todo
            </button>
          )}
        </div>

        {/* ── Curated Catalog Sections (solo modo catalogo) ── */}
        {viewMode === "catalogo" && (
          <div className="mt-4">
            <CatalogSections />
          </div>
        )}

        {/* ── C2: Recomendaciones personalizadas (solo modo catalogo) ── */}
        {viewMode === "catalogo" && <PersonalizedRecommendations />}

        {/* ── Conditional View Rendering ── */}
        {viewMode === "catalogo" ? (
          <CatalogView
            searchQuery={search || undefined}
            zone={zone || undefined}
            category={category !== "todos" ? category : undefined}
          />
        ) : (
          <>
            {/* Error state */}
            {error && (
              <div className="mt-6 flex items-center gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4">
                <span className="text-sm text-red-700 dark:text-red-400 flex-1">{error}</span>
                <button
                  onClick={fetchStores}
                  className="text-xs font-bold text-red-600 hover:text-red-800 underline"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-2xl overflow-hidden"
                  >
                    <div className="h-32 bg-gray-100 dark:bg-surface animate-pulse" />
                    <div className="p-4 space-y-3">
                      <div className="h-5 bg-gray-100 dark:bg-surface rounded-lg w-3/4 animate-pulse" />
                      <div className="h-4 bg-gray-100 dark:bg-surface rounded-lg w-full animate-pulse" />
                      <div className="h-3 bg-gray-100 dark:bg-surface rounded-lg w-1/2 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && filteredStores.length === 0 && (
              <div className="mt-12 flex flex-col items-center justify-center text-center py-16">
                <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-surface flex items-center justify-center mb-6">
                  <Package className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                </div>
                <h3 className="text-xl font-extrabold text-gray-900 dark:text-foreground mb-2">
                  No encontramos tiendas
                </h3>
                <p className="text-sm text-gray-500 dark:text-muted max-w-md">
                  {search
                    ? `No hay tiendas que coincidan con "${search}". Prueba con otro nombre.`
                    : "Aún no hay tiendas publicadas en esta categoría. ¡Pronto habrá más!"}
                </p>
                {(search || category !== "todos" || zone || geoActive) && (
                  <button
                    onClick={() => { setSearch(""); setCategory("todos"); setZone(""); setGeoActive(false); setUserCoords(null); }}
                    className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
                  >
                    Ver todas las tiendas
                  </button>
                )}
              </div>
            )}

            {/* Store grid */}
            {!loading && !error && filteredStores.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                {filteredStores.map((store, i) => (
                  <StoreCard key={store.id} store={store} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── CTA: Register Your Store ── */}
      <section className="bg-linear-to-r from-primary/5 via-primary/10 to-secondary/5 dark:from-primary/10 dark:via-primary/15 dark:to-secondary/10 py-12 sm:py-16">
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
    </div>
  );
}
