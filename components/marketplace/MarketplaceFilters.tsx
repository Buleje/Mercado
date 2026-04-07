"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  SlidersHorizontal,
  X,
  LocateFixed,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Tipos públicos ─────────────────────────────────────────────────────────── */

export type SortBy =
  | "relevance"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "distance";

export interface MarketplaceFiltersState {
  minPrice: number;
  maxPrice: number;
  productCategory: string | null;
  sortBy: SortBy;
  nearbyEnabled: boolean;
}

export interface MarketplaceFiltersProps {
  filters: MarketplaceFiltersState;
  userCoords: { lat: number; lng: number } | null;
  geoLoading: boolean;
  onChange: (patch: Partial<MarketplaceFiltersState>) => void;
  onRequestGeo: () => void;
}

/* ── Constantes ─────────────────────────────────────────────────────────────── */

const PRODUCT_CATEGORIES = [
  { id: null,        label: "Todos" },
  { id: "abarrotes", label: "Abarrotes" },
  { id: "bebidas",   label: "Bebidas" },
  { id: "limpieza",  label: "Limpieza" },
  { id: "frescos",   label: "Frescos" },
  { id: "otros",     label: "Otros" },
] as const;

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "relevance",  label: "Relevancia" },
  { value: "price-asc",  label: "Precio: menor a mayor" },
  { value: "price-desc", label: "Precio: mayor a menor" },
  { value: "rating",     label: "Mejor valorados" },
  { value: "distance",   label: "Más cerca de mí" },
];

const MAX_PRICE_LIMIT = 500;

/* ── Utilidades ─────────────────────────────────────────────────────────────── */

function countActiveFilters(f: MarketplaceFiltersState): number {
  let count = 0;
  if (f.productCategory !== null) count++;
  if (f.sortBy !== "relevance") count++;
  if (f.minPrice > 0 || f.maxPrice < MAX_PRICE_LIMIT) count++;
  if (f.nearbyEnabled) count++;
  return count;
}

/* ── Price Range Slider ─────────────────────────────────────────────────────── */

function PriceRangeSlider({
  min,
  max,
  onChangeMin,
  onChangeMax,
}: {
  min: number;
  max: number;
  onChangeMin: (v: number) => void;
  onChangeMax: (v: number) => void;
}) {
  const minPercent = (min / MAX_PRICE_LIMIT) * 100;
  const maxPercent = (max / MAX_PRICE_LIMIT) * 100;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          S/ {min.toFixed(0)}
        </span>
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          S/ {max >= MAX_PRICE_LIMIT ? `${MAX_PRICE_LIMIT}+` : max.toFixed(0)}
        </span>
      </div>

      {/* Track visual */}
      <div className="relative h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 mb-4">
        <div
          className="absolute h-1.5 rounded-full bg-teal-600 dark:bg-teal-500"
          style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Inputs de rango superpuestos */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={MAX_PRICE_LIMIT}
          step={1}
          value={min}
          aria-label="Precio mínimo"
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < max) onChangeMin(v);
          }}
          className="absolute inset-0 w-full h-1 opacity-0 cursor-pointer"
          style={{ zIndex: min > MAX_PRICE_LIMIT - 20 ? 5 : 3 }}
        />
        <input
          type="range"
          min={0}
          max={MAX_PRICE_LIMIT}
          step={1}
          value={max}
          aria-label="Precio máximo"
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > min) onChangeMax(v);
          }}
          className="absolute inset-0 w-full h-1 opacity-0 cursor-pointer"
          style={{ zIndex: 4 }}
        />

        {/* Thumbs visibles */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-teal-600 dark:border-teal-500 shadow-md"
          style={{ left: `calc(${minPercent}% - 8px)` }}
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-teal-600 dark:border-teal-500 shadow-md"
          style={{ left: `calc(${maxPercent}% - 8px)` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

/* ── Botón "Cerca de mí" ────────────────────────────────────────────────────── */

function NearbyButton({
  enabled,
  loading,
  userCoords,
  onRequest,
}: {
  enabled: boolean;
  loading: boolean;
  userCoords: { lat: number; lng: number } | null;
  onRequest: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onRequest}
        disabled={loading}
        aria-pressed={enabled}
        className={cn(
          "inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600",
          enabled
            ? "bg-teal-700 text-white shadow-md shadow-teal-700/25"
            : "border border-gray-200 bg-white text-gray-600 hover:border-teal-400 hover:text-teal-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-teal-500",
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        )}
        {enabled ? "Cerca de mí activo" : "Tiendas cerca de mí"}
        {enabled && (
          <X
            className="h-3.5 w-3.5 opacity-70"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Mensaje si no hay coordenadas todavía */}
      {!enabled && !loading && !userCoords && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
          Activa para filtrar tiendas a menos de 5 km.{" "}
          <a
            href="https://support.google.com/chrome/answer/142065"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-teal-600"
          >
            ¿Cómo permitir ubicación?
          </a>
        </p>
      )}
    </div>
  );
}

/* ── Panel de filtros (contenido compartido entre desktop/drawer) ────────────── */

function FiltersPanel({
  filters,
  userCoords,
  geoLoading,
  onChange,
  onRequestGeo,
  onReset,
  activeCount,
}: MarketplaceFiltersProps & {
  onReset: () => void;
  activeCount: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado + reset */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden="true" />
          <span className="text-sm font-bold text-gray-800 dark:text-white">Filtros</span>
          {activeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-gray-400 underline hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Ordenar por */}
      <div>
        <label
          htmlFor="marketplace-sort"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
        >
          Ordenar por
        </label>
        <div className="relative">
          <select
            id="marketplace-sort"
            value={filters.sortBy}
            onChange={(e) => onChange({ sortBy: e.target.value as SortBy })}
            className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-9 text-sm font-semibold text-gray-700 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white transition-colors"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Categoría de producto */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Categoría de producto
        </p>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar por categoría de producto"
        >
          {PRODUCT_CATEGORIES.map((cat) => (
            <button
              key={String(cat.id)}
              type="button"
              onClick={() => onChange({ productCategory: cat.id })}
              aria-pressed={filters.productCategory === cat.id}
              className={cn(
                "min-h-[36px] rounded-full px-3.5 py-1 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600",
                filters.productCategory === cat.id
                  ? "bg-teal-700 text-white shadow-sm"
                  : "border border-gray-200 bg-white text-gray-600 hover:border-teal-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-teal-500",
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rango de precio */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Rango de precio
        </p>
        <PriceRangeSlider
          min={filters.minPrice}
          max={filters.maxPrice}
          onChangeMin={(v) => onChange({ minPrice: v })}
          onChangeMax={(v) => onChange({ maxPrice: v })}
        />
      </div>

      {/* Cerca de mí */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Ubicación
        </p>
        <NearbyButton
          enabled={filters.nearbyEnabled}
          loading={geoLoading}
          userCoords={userCoords}
          onRequest={onRequestGeo}
        />
      </div>
    </div>
  );
}

/* ── Drawer mobile ──────────────────────────────────────────────────────────── */

function FiltersDrawer({
  open,
  onClose,
  ...panelProps
}: { open: boolean; onClose: () => void } & Parameters<typeof FiltersPanel>[0]) {
  // Bloquear scroll del body mientras está abierto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel desde abajo */}
      <div className="relative w-full rounded-t-3xl bg-white px-5 pb-8 pt-5 dark:bg-gray-950 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden="true" />

        {/* Botón cerrar */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
          aria-label="Cerrar filtros"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>

        <FiltersPanel {...panelProps} />

        {/* Botón aplicar */}
        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-[48px] w-full rounded-2xl bg-teal-700 text-sm font-bold text-white shadow-md hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 transition-colors"
        >
          Ver resultados
        </button>
      </div>
    </div>
  );
}

/* ── Componente principal exportado ────────────────────────────────────────── */

export default function MarketplaceFilters(props: MarketplaceFiltersProps) {
  const { filters, onChange } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeCount = countActiveFilters(filters);

  const handleReset = useCallback(() => {
    onChange({
      minPrice: 0,
      maxPrice: MAX_PRICE_LIMIT,
      productCategory: null,
      sortBy: "relevance",
      nearbyEnabled: false,
    });
  }, [onChange]);

  const panelProps = {
    ...props,
    onReset: handleReset,
    activeCount,
  };

  return (
    <>
      {/* Botón "Filtrar" solo visible en mobile */}
      <div className="mb-4 sm:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600",
            activeCount > 0
              ? "bg-teal-700/10 border-teal-700/30 text-teal-700 dark:text-teal-400"
              : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
          )}
          aria-label={activeCount > 0 ? `Filtros (${activeCount} activos)` : "Abrir filtros"}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filtrar
          {activeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Drawer mobile */}
      <FiltersDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} {...panelProps} />

      {/* Panel desktop — siempre visible en sm+ */}
      <div className="hidden sm:block rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 mb-6">
        <FiltersPanel {...panelProps} />
      </div>
    </>
  );
}
