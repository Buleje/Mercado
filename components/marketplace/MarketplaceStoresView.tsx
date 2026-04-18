"use client";

import { useState, useCallback } from "react";
import {
  MapPin,
  Star,
  ShoppingBag,
  ChevronRight,
  Package,
  LocateFixed,
  Store,
  ShoppingCart,
  Building2,
  Apple,
  Beef,
  CroissantIcon,
  Wine,
  Pill,
  UtensilsCrossed,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import type { MarketplaceStore } from "@/components/marketplace/useMarketplaceGeo";
import type { QuickChipId } from "@/components/marketplace/QuickFilterChips";
import { Plane } from "lucide-react";
import { BodegaAbriendo, MotoRuta } from "@/components/ui-system/illustrations/contextual";
import { DoniaElena } from "@/components/ui-system/illustrations/pucallpa-locals";
import { BodegueroCelebrando } from "@/components/ui-system/illustrations/success-moments";

// Fallback illustration rotation deterministico por store.id para store cards sin logo.
function StoreFallbackIllustration({ id, className }: { id: string; className?: string }) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const pick = Math.abs(hash) % 4;
  if (pick === 0) return <BodegaAbriendo size={110} strokeWidth={1.5} className={className} />;
  if (pick === 1) return <DoniaElena size={110} strokeWidth={1.5} className={className} />;
  if (pick === 2) return <MotoRuta size={110} strokeWidth={1.5} className={className} />;
  return <BodegueroCelebrando size={110} strokeWidth={1.5} className={className} />;
}

/* ── Category config ───────────────────────────────────────────────────────── */

export const CATEGORIES = [
  { id: "todos", label: "Todos" },
  { id: "bodega", label: "Bodegas" },
  { id: "minimarket", label: "Minimarkets" },
  { id: "fruteria", label: "Fruterías" },
  { id: "carniceria", label: "Carnicerías" },
  { id: "panaderia", label: "Panaderías" },
  { id: "licoreria", label: "Licorerías" },
  { id: "farmacia", label: "Farmacias" },
  { id: "restaurante", label: "Restaurantes" },
];

/* ── Zones ─────────────────────────────────────────────────────────────────── */

export const ZONES = [
  { id: "", label: "Todas las zonas" },
  { id: "centro", label: "Centro" },
  { id: "manantay", label: "Manantay" },
  { id: "calleria", label: "Callerìa" },
  { id: "yarinacocha", label: "Yarinacocha" },
  { id: "campo_verde", label: "Campo Verde" },
];

/* ── Currency formatter ────────────────────────────────────────────────────── */

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/* ── ProductPreview type (internal to store card) ──────────────────────────── */

interface ProductPreview {
  id: number;
  name: string;
  price: number;
  image: string | null;
  unit: string | null;
}

/* ── Store Card ────────────────────────────────────────────────────────────── */

/** Renderer explicito por id de categoria — cumple react-hooks/static-components. */
function CategoryIconRenderer({ id, className }: { id: string; className?: string }) {
  const common = { className, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (id === "bodega") return <ShoppingCart {...common} />;
  if (id === "minimarket") return <Building2 {...common} />;
  if (id === "fruteria") return <Apple {...common} />;
  if (id === "carniceria") return <Beef {...common} />;
  if (id === "panaderia") return <CroissantIcon {...common} />;
  if (id === "licoreria") return <Wine {...common} />;
  if (id === "farmacia") return <Pill {...common} />;
  if (id === "restaurante") return <UtensilsCrossed {...common} />;
  return <Store {...common} />;
}

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

  const ratingText = store.rating > 0 ? `, ${store.rating.toFixed(1)} estrellas` : "";
  const zoneText = store.zone ? `, ${store.zone}` : "";
  const linkAriaLabel = `${store.name}${zoneText}${ratingText}${store.vacationMode ? " — de vacaciones" : ""}`;

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
        aria-label={linkAriaLabel}
        className="group block bg-white dark:bg-card border border-gray-100 dark:border-card-border rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 hover:-translate-y-1"
      >
        {/* Banner — surface-sunken con ilustracion grande o logo real */}
        <div className="relative h-32 bg-[var(--surface-sunken)] overflow-hidden">
          {store.logo ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-20 h-20 rounded-2xl bg-white dark:bg-card shadow-[var(--shadow-md)] border border-[var(--rule-base)] overflow-hidden group-hover:scale-105 transition-transform duration-300">
                <Image
                  src={store.logo}
                  alt={`Logo de ${store.name}`}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <StoreFallbackIllustration
                id={store.id || store.slug}
                className="text-[var(--text-tertiary)] opacity-70 group-hover:opacity-85 transition-opacity"
              />
            </div>
          )}

          {/* Category badge */}
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border border-gray-200 dark:border-gray-800 text-[11px] font-bold text-gray-700 dark:text-gray-200">
            <CategoryIconRenderer id={categoryMeta.id} className="h-3 w-3" />
            {categoryMeta.label}
          </span>

          {/* Vacation badge */}
          {store.vacationMode && (
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-gray-950/95 backdrop-blur-sm border border-[var(--data-warning)]/40 text-[11px] font-bold text-[var(--data-warning)]">
              <Plane className="h-3 w-3" strokeWidth={1.75} />
              De vacaciones
            </span>
          )}

          {/* Rating badge */}
          {store.rating > 0 && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/95 dark:bg-gray-950/95 border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)]">
              <Star className="h-3 w-3 fill-current text-[var(--accent)]" />
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
                  <div className="flex gap-2" aria-busy="true" aria-label="Cargando productos...">
                    {[0, 1, 2].map((i) => (
                      <div key={i} aria-hidden="true" className="flex-1 h-16 rounded-xl bg-gray-100 dark:bg-surface animate-pulse" />
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

/* ── MarketplaceStoresView Props ───────────────────────────────────────────── */

interface MarketplaceStoresViewProps {
  stores: MarketplaceStore[];
  loading: boolean;
  error: string | null;
  search: string;
  category: string;
  zone: string;
  geoActive: boolean;
  /** Live store count for the sr-only aria-live region */
  filteredStores: MarketplaceStore[];
  onRetry: () => void;
  onClearAll: () => void;
  /** Quick-filter chips active in MarketplaceContent */
  activeChips?: Set<QuickChipId>;
}

/* ── Chip filter helpers + MarketplaceStoresView ───────────────────────────── */

/**
 * Returns true when the store passes every active quick-filter chip.
 * Fields that don't exist on a given store are skipped (tolerant).
 */
function passesChips(
  store: MarketplaceStore & Partial<StoreChipFields>,
  chips: Set<QuickChipId>,
): boolean {
  if (chips.size === 0) return true;

  for (const chip of chips) {
    switch (chip) {
      case "open_now": {
        // Only filter if the store carries openHours data
        if (!("openHours" in store) || store.openHours == null) break;
        const now = new Date();
        const dayIndex = now.getDay(); // 0=Sun … 6=Sat
        const minutesNow = now.getHours() * 60 + now.getMinutes();
        const todayHours = store.openHours[dayIndex];
        if (!todayHours) return false;
        const open = todayHours.open * 60 + todayHours.openMin;
        const close = todayHours.close * 60 + todayHours.closeMin;
        if (minutesNow < open || minutesNow >= close) return false;
        break;
      }
      case "free_delivery": {
        if (!("deliveryFee" in store) && !("freeDelivery" in store)) break;
        const isFree =
          store.freeDelivery === true || store.deliveryFee === 0;
        if (!isFree) return false;
        break;
      }
      case "has_offers": {
        if (!("hasOffers" in store) && !("activePromos" in store)) break;
        const hasOffers =
          store.hasOffers === true ||
          (typeof store.activePromos === "number" && store.activePromos > 0);
        if (!hasOffers) return false;
        break;
      }
      case "top_rated": {
        if ((store.rating ?? 0) < 4.5) return false;
        break;
      }
      case "new_stores": {
        if (!("createdAt" in store) || store.createdAt == null) break;
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const age = Date.now() - new Date(store.createdAt).getTime();
        if (age >= thirtyDaysMs) return false;
        break;
      }
    }
  }
  return true;
}

/* ── Optional extended fields that may exist on store objects ───────────────── */

interface DayHours {
  open: number;
  openMin: number;
  close: number;
  closeMin: number;
}

interface StoreChipFields {
  openHours: DayHours[] | null;
  deliveryFee: number;
  freeDelivery: boolean;
  hasOffers: boolean;
  activePromos: number;
  createdAt: string | Date;
}

export default function MarketplaceStoresView({
  stores: _stores,
  loading,
  error,
  search,
  category,
  zone,
  geoActive,
  filteredStores: filteredStoresProp,
  onRetry,
  onClearAll,
  activeChips,
}: MarketplaceStoresViewProps) {
  const chips = activeChips ?? new Set<QuickChipId>();

  // Apply chip filters on top of whatever geo/category filtering already happened
  const filteredStores =
    chips.size === 0
      ? filteredStoresProp
      : filteredStoresProp.filter((s) =>
          passesChips(s as MarketplaceStore & Partial<StoreChipFields>, chips),
        );

  return (
    <>
      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="mt-6 flex items-center gap-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-4"
        >
          <span className="text-sm text-red-700 dark:text-red-400 flex-1">{error}</span>
          <button
            onClick={onRetry}
            aria-label="Reintentar cargar tiendas"
            className="text-xs font-bold text-red-600 hover:text-red-800 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div
          aria-busy="true"
          aria-label="Cargando tiendas..."
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              aria-hidden="true"
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
              onClick={onClearAll}
              aria-label="Quitar todos los filtros y ver todas las tiendas"
              className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              Ver todas las tiendas
            </button>
          )}
        </div>
      )}

      {/* Results count live region */}
      {!loading && !error && filteredStores.length > 0 && (
        <p
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {`Mostrando ${filteredStores.length} tienda${filteredStores.length !== 1 ? "s" : ""}`}
        </p>
      )}

      {/* Store grid */}
      {!loading && !error && filteredStores.length > 0 && (
        <div
          role="list"
          aria-label={`${filteredStores.length} tienda${filteredStores.length !== 1 ? "s" : ""} encontrada${filteredStores.length !== 1 ? "s" : ""}`}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6"
        >
          {filteredStores.map((store, i) => (
            <div key={store.id} role="listitem">
              <StoreCard store={store} index={i} />
            </div>
          ))}
        </div>
      )}

      {/* Geo active indicator (sr-only) */}
      {geoActive && (
        <p className="sr-only" aria-live="polite">
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
          Ordenado por cercanía
        </p>
      )}
    </>
  );
}
