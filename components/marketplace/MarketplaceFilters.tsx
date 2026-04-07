"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  SlidersHorizontal,
  X,
  LocateFixed,
  Loader2,
  ChevronDown,
  Check,
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
  { id: null,        label: "Todos", emoji: "🔥" },
  { id: "abarrotes", label: "Abarrotes", emoji: "🛒" },
  { id: "bebidas",   label: "Bebidas", emoji: "🥤" },
  { id: "limpieza",  label: "Limpieza", emoji: "🧹" },
  { id: "frescos",   label: "Frescos", emoji: "🥬" },
  { id: "otros",     label: "Otros", emoji: "📦" },
] as const;

const SORT_OPTIONS: { value: SortBy; label: string; short: string }[] = [
  { value: "relevance",  label: "Relevancia",             short: "Relevancia" },
  { value: "price-asc",  label: "Precio: menor a mayor",  short: "Menor precio" },
  { value: "price-desc", label: "Precio: mayor a menor",  short: "Mayor precio" },
  { value: "rating",     label: "Mejor valorados",        short: "Valorados" },
  { value: "distance",   label: "Más cerca de mí",        short: "Cercanía" },
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

/* ── Dropdown genérico ──────────────────────────────────────────────────────── */

function FilterDropdown({
  open,
  onClose,
  children,
  align = "left",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute top-full mt-2 z-50 min-w-55 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl shadow-gray-200/50 dark:shadow-none p-3 animate-in fade-in-0 zoom-in-95 duration-150",
        align === "right" ? "right-0" : "left-0"
      )}
    >
      {children}
    </div>
  );
}

/* ── Price Range Popover ────────────────────────────────────────────────────── */

function PriceRangePopover({
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
    <div className="w-56 space-y-3">
      <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Rango de precio</p>
      <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400">
        <span>S/ {min.toFixed(0)}</span>
        <span>S/ {max >= MAX_PRICE_LIMIT ? `${MAX_PRICE_LIMIT}+` : max.toFixed(0)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="absolute h-1.5 rounded-full bg-primary"
          style={{ left: `${minPercent}%`, right: `${100 - maxPercent}%` }}
        />
      </div>
      <div className="relative h-4">
        <input
          type="range"
          min={0}
          max={MAX_PRICE_LIMIT}
          step={5}
          value={min}
          aria-label="Precio mínimo"
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v < max) onChangeMin(v);
          }}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          style={{ zIndex: min > MAX_PRICE_LIMIT - 20 ? 5 : 3 }}
        />
        <input
          type="range"
          min={0}
          max={MAX_PRICE_LIMIT}
          step={5}
          value={max}
          aria-label="Precio máximo"
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v > min) onChangeMax(v);
          }}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
          style={{ zIndex: 4 }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-primary shadow-md pointer-events-none"
          style={{ left: `calc(${minPercent}% - 8px)` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-primary shadow-md pointer-events-none"
          style={{ left: `calc(${maxPercent}% - 8px)` }}
        />
      </div>
    </div>
  );
}

/* ── Drawer mobile ──────────────────────────────────────────────────────────── */

function FiltersDrawer({
  open,
  onClose,
  filters,
  geoLoading,
  onChange,
  onRequestGeo,
  onReset,
  activeCount,
}: {
  open: boolean;
  onClose: () => void;
  filters: MarketplaceFiltersState;
  userCoords: { lat: number; lng: number } | null;
  geoLoading: boolean;
  onChange: (patch: Partial<MarketplaceFiltersState>) => void;
  onRequestGeo: () => void;
  onReset: () => void;
  activeCount: number;
}) {
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full rounded-t-3xl bg-white px-5 pb-8 pt-5 dark:bg-gray-950 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
          aria-label="Cerrar filtros"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800 dark:text-white">Filtros</span>
            {activeCount > 0 && (
              <button type="button" onClick={onReset} className="text-xs font-semibold text-gray-400 underline hover:text-red-500">
                Limpiar
              </button>
            )}
          </div>

          {/* Sort */}
          <div>
            <label htmlFor="mobile-sort" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Ordenar por
            </label>
            <select
              id="mobile-sort"
              value={filters.sortBy}
              onChange={(e) => onChange({ sortBy: e.target.value as SortBy })}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-9 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Categories */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Categoría</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
              {PRODUCT_CATEGORIES.map((cat) => (
                <button
                  key={String(cat.id)}
                  type="button"
                  onClick={() => onChange({ productCategory: cat.id })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                    filters.productCategory === cat.id
                      ? "bg-primary text-white shadow-sm"
                      : "border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  )}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Precio</p>
            <PriceRangePopover
              min={filters.minPrice}
              max={filters.maxPrice}
              onChangeMin={(v) => onChange({ minPrice: v })}
              onChangeMax={(v) => onChange({ maxPrice: v })}
            />
          </div>

          {/* Nearby */}
          <button
            type="button"
            onClick={onRequestGeo}
            disabled={geoLoading}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60",
              filters.nearbyEnabled
                ? "bg-primary text-white shadow-md"
                : "border border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            )}
          >
            {geoLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <LocateFixed className="h-4 w-4" />}
            {filters.nearbyEnabled ? "Cerca de mí ✓" : "Cerca de mí"}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-12 w-full rounded-2xl bg-primary text-sm font-bold text-white shadow-md hover:bg-primary/90 transition-colors"
        >
          Ver resultados
        </button>
      </div>
    </div>
  );
}

/* ── Componente principal: barra horizontal compacta ────────────────────────── */

export default function MarketplaceFilters(props: MarketplaceFiltersProps) {
  const { filters, onChange, onRequestGeo, geoLoading } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const activeCount = countActiveFilters(filters);
  const priceActive = filters.minPrice > 0 || filters.maxPrice < MAX_PRICE_LIMIT;
  const currentSort = SORT_OPTIONS.find((o) => o.value === filters.sortBy) ?? SORT_OPTIONS[0];

  const handleReset = useCallback(() => {
    onChange({
      minPrice: 0,
      maxPrice: MAX_PRICE_LIMIT,
      productCategory: null,
      sortBy: "relevance",
      nearbyEnabled: false,
    });
  }, [onChange]);

  const handleCloseSortDropdown = useCallback(() => setSortOpen(false), []);
  const handleClosePriceDropdown = useCallback(() => setPriceOpen(false), []);

  return (
    <>
      {/* ── Mobile: botón para abrir drawer ── */}
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold border transition-colors",
            activeCount > 0
              ? "bg-primary/10 border-primary/30 text-primary"
              : "border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <FiltersDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        userCoords={props.userCoords}
        geoLoading={geoLoading}
        onChange={onChange}
        onRequestGeo={onRequestGeo}
        onReset={handleReset}
        activeCount={activeCount}
      />

      {/* ── Desktop: barra horizontal compacta ── */}
      <div className="hidden sm:flex items-center gap-2 flex-wrap">
        {/* Categorías como pills horizontales */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {PRODUCT_CATEGORIES.map((cat) => (
            <button
              key={String(cat.id)}
              type="button"
              onClick={() => onChange({ productCategory: cat.id })}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all shrink-0",
                filters.productCategory === cat.id
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary/40 hover:text-primary"
              )}
            >
              <span className="text-sm">{cat.emoji}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Separador */}
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />

        {/* Ordenar — dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setSortOpen(!sortOpen); setPriceOpen(false); }}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
              filters.sortBy !== "relevance"
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary/40"
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {currentSort.short}
            <ChevronDown className={cn("h-3 w-3 transition-transform", sortOpen && "rotate-180")} />
          </button>
          <FilterDropdown open={sortOpen} onClose={handleCloseSortDropdown}>
            <div className="space-y-0.5">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange({ sortBy: opt.value }); setSortOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                    filters.sortBy === opt.value
                      ? "bg-primary/10 text-primary"
                      : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  )}
                >
                  {filters.sortBy === opt.value && <Check className="h-3 w-3" />}
                  {opt.label}
                </button>
              ))}
            </div>
          </FilterDropdown>
        </div>

        {/* Precio — dropdown con slider */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setPriceOpen(!priceOpen); setSortOpen(false); }}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
              priceActive
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary/40"
            )}
          >
            💰 {priceActive ? `S/${filters.minPrice} – S/${filters.maxPrice >= MAX_PRICE_LIMIT ? "500+" : filters.maxPrice}` : "Precio"}
            <ChevronDown className={cn("h-3 w-3 transition-transform", priceOpen && "rotate-180")} />
          </button>
          <FilterDropdown open={priceOpen} onClose={handleClosePriceDropdown}>
            <PriceRangePopover
              min={filters.minPrice}
              max={filters.maxPrice}
              onChangeMin={(v) => onChange({ minPrice: v })}
              onChangeMax={(v) => onChange({ maxPrice: v })}
            />
          </FilterDropdown>
        </div>

        {/* Cerca de mí — toggle */}
        <button
          type="button"
          onClick={onRequestGeo}
          disabled={geoLoading}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-60",
            filters.nearbyEnabled
              ? "bg-primary text-white border-primary shadow-sm"
              : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-primary/40 hover:text-primary"
          )}
        >
          {geoLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <LocateFixed className="h-3.5 w-3.5" />}
          {filters.nearbyEnabled ? "Cerca ✓" : "Cerca"}
        </button>

        {/* Limpiar */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="h-3 w-3" />
            Limpiar
          </button>
        )}
      </div>
    </>
  );
}
