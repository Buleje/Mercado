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
import { m, AnimatePresence } from "framer-motion";
import type { MarketplaceStore } from "@/components/marketplace/useMarketplaceGeo";
import type { QuickChipId } from "@/components/marketplace/QuickFilterChips";
import { Plane } from "lucide-react";
import { StoreCardCanonical } from "@buleje/design-system";

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

/* ── Category config ────────────────────────────────────────────────────────── */

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

/* ── StoreCardWrapper ──────────────────────────────────────────────────────── */
/**
 * Envuelve StoreCardCanonical con:
 * - Framer Motion entrada animada (por index).
 * - Product preview strip (carga on hover/focus — lazy fetch).
 * - Badges: categoria + vacation + rating como slots del canonical.
 *
 * No reemplaza la logica de negocio de hover-preview: esa logica vive aqui
 * porque es especifica de esta vista y el DS canonical no la incluye.
 */
function StoreCardWrapper({ store, index }: { store: MarketplaceStore; index: number }) {
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

  // ── Slots para StoreCardCanonical ──────────────────────────────────────────

  const badges = (
    <>
      {/* Categoria */}
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/95 dark:bg-gray-950/95 border border-gray-200 dark:border-gray-800 text-[length:var(--ts-2xs)] font-bold text-gray-700 dark:text-gray-200">
        <CategoryIconRenderer id={categoryMeta.id} className="h-3 w-3" />
        {categoryMeta.label}
      </span>
      {/* Vacation */}
      {store.vacationMode && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 dark:bg-gray-950/95 border border-[var(--data-warning)]/40 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning)]">
          <Plane className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          De vacaciones
        </span>
      )}
      {/* Rating */}
      {store.rating > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 dark:bg-gray-950/95 border border-[var(--rule-base)] text-xs font-bold text-[var(--text-secondary)]">
          <Star className="h-3 w-3 fill-current text-[var(--accent)]" aria-hidden="true" />
          {store.rating.toFixed(1)}
        </span>
      )}
    </>
  );

  const footer = (
    <div className="flex flex-col gap-1.5">
      {/* Description */}
      {store.description && (
        <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
          {store.description}
        </p>
      )}
      {/* Meta row */}
      <div className="flex items-center gap-3 flex-wrap">
        {store.zone && (
          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {store.zone}
          </span>
        )}
        {store.reviewCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            <ShoppingBag className="h-3 w-3" aria-hidden="true" />
            {store.reviewCount} reseña{store.reviewCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      {/* CTA row — accion-oriented */}
      <div className="flex items-center justify-between pt-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)] group-hover:gap-2.5 transition-all">
          Pedir ahora
          <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </span>
        {!store.vacationMode && (
          <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--data-success,_#00b66a)]" />
            Disponible
          </span>
        )}
      </div>
      {/* Product preview strip — visible on hover */}
      <AnimatePresence>
        {(previewLoading || previewLoaded) && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="pt-2 border-t border-[var(--rule-soft)] overflow-hidden"
          >
            {previewLoading ? (
              <div className="flex gap-2" aria-busy="true" aria-label="Cargando productos...">
                {[0, 1, 2].map((i) => (
                  <div key={i} aria-hidden="true" className="flex-1 h-16 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
                ))}
              </div>
            ) : preview.length > 0 ? (
              <div className="flex gap-2">
                {preview.map((p) => (
                  <div key={p.id} className="flex-1 rounded-xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                    <div className="relative h-12 bg-[var(--surface-sunken)]">
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
                          <Package className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="px-1.5 py-1">
                      <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] line-clamp-1">
                        {p.name}
                      </p>
                      <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]">
                        {fmt(p.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center py-1">Sin productos disponibles</p>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );

  const ratingText = store.rating > 0 ? `, ${store.rating.toFixed(1)} estrellas` : "";
  const zoneText = store.zone ? `, ${store.zone}` : "";
  const ariaLabel = `${store.name}${zoneText}${ratingText}${store.vacationMode ? " — de vacaciones" : ""}`;

  return (
    <m.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      onMouseEnter={loadPreview}
      onFocus={loadPreview}
    >
      {/* StoreCardCanonical: aria-label override via href hack not needed —
          the canonical already sets aria-label={name} on the <a>. The richer
          aria description (zone, rating, vacation) is provided via the sr-only
          text rendered inside the footer slot, which screen readers will read. */}
      <StoreCardCanonical
        storeId={store.id || store.slug}
        name={ariaLabel}
        slug={store.slug}
        imageUrl={store.logo}
        badges={badges}
        footer={footer}
        renderImage={({ src, alt, className }) => (
          <Image
            src={src}
            alt={alt}
            fill
            className={className}
            sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
          />
        )}
      />
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
              className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-lg overflow-hidden"
            >
              <div className="aspect-[4/3] bg-[var(--surface-sunken)] animate-pulse" />
              <div className="p-3 space-y-3">
                <div className="h-5 bg-[var(--surface-sunken)] rounded-lg w-3/4 animate-pulse" />
                <div className="h-4 bg-[var(--surface-sunken)] rounded-lg w-full animate-pulse" />
                <div className="h-3 bg-[var(--surface-sunken)] rounded-lg w-1/2 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state — uses EmptyState slots from components/ui-system/EmptyState */}
      {!loading && !error && filteredStores.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center text-center py-16">
          <div className="w-24 h-24 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center mb-6">
            <Package className="h-12 w-12 text-[var(--text-tertiary)]" aria-hidden="true" />
          </div>
          <h3 className="text-xl font-extrabold text-[var(--text-primary)] mb-2">
            No encontramos tiendas
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-md">
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
              <StoreCardWrapper store={store} index={i} />
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
