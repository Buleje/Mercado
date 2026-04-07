"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  Search,
  MapPin,
  Star,
  Store,
  ShoppingBag,
  Filter,
  X,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Clock,
  Package,
  LocateFixed,
  Loader2,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import MarketplaceFilters, {
  type MarketplaceFiltersState,
  type SortBy,
} from "@/components/marketplace/MarketplaceFilters";

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

interface CrossStoreResult {
  productId: number;
  productName: string;
  price: number;
  image: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
  stock: number;
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
    <motion.div
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
              <motion.div
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Link>
    </motion.div>
  );
}

/* ── Cross-Store Search Dropdown ───────────────────────────────────────────── */

function CrossStoreDropdown({
  query,
  onClose,
  zone,
  category,
  filters,
  userCoords,
}: {
  query: string;
  onClose: () => void;
  zone?: string;
  category?: string;
  filters?: MarketplaceFiltersState;
  userCoords?: { lat: number; lng: number } | null;
}) {
  const [results, setResults] = useState<CrossStoreResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query });
        if (zone) params.set("zone", zone);
        if (category && category !== "todos") params.set("category", category);
        if (filters?.minPrice && filters.minPrice > 0) params.set("minPrice", String(filters.minPrice));
        if (filters?.maxPrice && filters.maxPrice < 500) params.set("maxPrice", String(filters.maxPrice));
        if (filters?.productCategory) params.set("category", filters.productCategory);
        if (filters?.sortBy && filters.sortBy !== "relevance") {
          const sortMap: Record<string, string> = {
            "price-asc": "price_asc",
            "price-desc": "price_desc",
            "rating": "rating",
            "distance": "distance",
          };
          const mappedSort = sortMap[filters.sortBy];
          if (mappedSort) params.set("sort", mappedSort);
        }
        if (filters?.nearbyEnabled && userCoords) {
          params.set("lat", String(userCoords.lat));
          params.set("lng", String(userCoords.lng));
        }
        const res = await fetch(`/api/marketplace/search?${params}`);
        if (res.ok) {
          const json = await res.json();
          setResults(json.data ?? []);
        }
      } catch {
        /* silent */
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, zone, category, filters, userCoords]);

  if (query.length < 2) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="absolute top-full left-0 right-0 mt-2 rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card shadow-2xl shadow-gray-200/50 dark:shadow-none overflow-hidden z-50"
    >
      {loading ? (
        <div className="flex items-center gap-3 px-5 py-4">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <span className="text-sm text-gray-500 dark:text-muted">Buscando en todas las tiendas…</span>
        </div>
      ) : results.length === 0 ? (
        <div className="px-5 py-4 text-sm text-gray-500 dark:text-muted">
          No encontramos productos para <strong className="text-gray-900 dark:text-foreground">&ldquo;{query}&rdquo;</strong>
        </div>
      ) : (
        <div>
          <div className="px-5 py-2.5 border-b border-gray-100 dark:border-card-border">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-muted">
              Productos en el marketplace
            </p>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-card-border">
            {results.map((r) => (
              <li key={`${r.storeId}-${r.productId}`}>
                <Link
                  href={`/marketplace/${r.storeSlug}`}
                  onClick={onClose}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-surface transition-colors"
                >
                  <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-surface">
                    {r.image ? (
                      <Image
                        src={r.image}
                        alt={r.productName}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-foreground line-clamp-1">
                      {r.productName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-muted line-clamp-1">
                      en <span className="text-primary font-medium">{r.storeName}</span>
                      {r.stock === 0 && (
                        <span className="ml-2 text-red-500 font-medium">· Agotado</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-primary">{fmt(r.price)}</p>
                    {r.unit && (
                      <p className="text-[10px] text-gray-400 dark:text-muted">/{r.unit}</p>
                    )}
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="px-5 py-2.5 border-t border-gray-100 dark:border-card-border bg-gray-50 dark:bg-surface">
            <p className="text-xs text-gray-400 dark:text-muted">
              {results.length} resultado{results.length !== 1 ? "s" : ""} · Haz clic en un producto para ir a la tienda
            </p>
          </div>
        </div>
      )}
    </motion.div>
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
  const [stores, setStores] = useState<MarketplaceStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todos");
  const [zone, setZone] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoActive, setGeoActive] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [productFilters, setProductFilters] = useState<MarketplaceFiltersState>(DEFAULT_FILTERS);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      <section className="relative overflow-hidden bg-linear-to-br from-primary/5 via-white to-secondary/5 dark:from-primary/10 dark:via-background dark:to-secondary/10 pb-8 pt-6 sm:pt-10 sm:pb-12">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-secondary/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/3 pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Title */}
          <div className="text-center mb-6 sm:mb-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary mb-3 bg-primary/8 rounded-full px-4 py-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Marketplace
              </span>
            </motion.div>

            <motion.h1
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-foreground leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              Todas las tiendas,{" "}
              <span className="text-primary relative">
                un solo lugar
                <svg
                  className="absolute -bottom-1 sm:-bottom-2 left-0 w-full h-2 sm:h-3 text-primary/30"
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
            </motion.h1>

            <motion.p
              className="text-gray-500 dark:text-muted mt-3 sm:mt-4 text-sm sm:text-base md:text-lg max-w-2xl mx-auto"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Encuentra las mejores bodegas y tiendas cerca de ti.*
              Compra de varios negocios en un solo pedido.
            </motion.p>
          </div>

          {/* Search bar */}
          <motion.div
            className="max-w-xl mx-auto"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="relative" ref={searchContainerRef}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-muted pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Buscar tiendas o productos…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowSearchDropdown(e.target.value.length >= 2);
                }}
                onFocus={() => { if (search.length >= 2) setShowSearchDropdown(true); }}
                className="w-full pl-12 pr-12 py-4 rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-foreground text-base font-medium shadow-lg shadow-gray-200/50 dark:shadow-none outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-gray-400 dark:placeholder:text-muted"
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setShowSearchDropdown(false); searchRef.current?.focus(); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              )}

              {/* Cross-store search dropdown */}
              <AnimatePresence>
                {showSearchDropdown && (
                  <CrossStoreDropdown
                    query={search}
                    onClose={() => setShowSearchDropdown(false)}
                    zone={zone}
                    category={category}
                    filters={productFilters}
                    userCoords={userCoords}
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Stats row */}
          <motion.div
            className="flex items-center justify-center gap-4 sm:gap-8 mt-6 text-sm text-gray-500 dark:text-muted flex-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
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
          </motion.div>
        </div>
      </section>

      {/* ── Filters + Grid ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Category pills — categoría de TIENDA (bodega, minimarket, etc.) */}
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

        {/* Zona + filtros clásicos (zona / geo) */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <button
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors",
              showFilters || zone
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-white dark:bg-card text-gray-600 dark:text-muted border-gray-200 dark:border-card-border hover:border-primary/40",
            )}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Zona
          </button>

          {/* Zone quick filter (visible if filters open) */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden"
              >
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  aria-label="Filtrar por zona"
                  className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-semibold text-gray-700 dark:text-foreground outline-none focus:border-primary transition-colors"
                >
                  {ZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </motion.div>
            )}
          </AnimatePresence>

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
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Panel de filtros de producto: precio, categoría producto, ordenar, geo */}
        <div className="mt-4">
          <MarketplaceFilters
            filters={productFilters}
            userCoords={userCoords}
            geoLoading={geoLoading}
            onChange={handleFiltersChange}
            onRequestGeo={handleGeoSort}
          />
        </div>

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
