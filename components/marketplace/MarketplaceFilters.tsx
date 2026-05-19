"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  SlidersHorizontal,
  X,
  LocateFixed,
  Loader2,
  ChevronDown,
  Check,
  DollarSign,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";

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

export interface ZoneOption {
  id: string;
  label: string;
  count?: number;
}

export interface MarketplaceFiltersProps {
  filters: MarketplaceFiltersState;
  userCoords: { lat: number; lng: number } | null;
  geoLoading: boolean;
  onChange: (patch: Partial<MarketplaceFiltersState>) => void;
  onRequestGeo: () => void;
  /** Si true, no renderiza el row horizontal de PRODUCT_CATEGORIES
      (porque el caller lo está renderizando arriba en formato propio). */
  hideProductCategory?: boolean;
  /** Zonas disponibles. Si se provee, se muestra sección "Zona" en el drawer mobile. */
  zones?: ZoneOption[];
  /** Id de zona seleccionada ("" = todas). */
  zone?: string;
  /** Setter de zona. */
  onZoneChange?: (zone: string) => void;
  /**
   * Brandon 2026-05-18: sort externo (StoresSortKey) que se renderiza dentro
   * del drawer mobile reemplazando el select interno de filters.sortBy.
   * Cuando se provee, el toolbar de /tiendas NO renderea su propio
   * StoresSortSelector — todo el control de orden vive dentro del modal.
   */
  extraSort?: {
    value: string;
    onChange: (v: string) => void;
    options: ReadonlyArray<{ id: string; label: string }>;
  };
  /**
   * Brandon 2026-05-18: handler global "Limpiar todo" que limpia search,
   * category, chips, sort, todo. Si se provee, el botón "Limpiar" del action
   * bar sticky usa este en lugar del onReset interno (que solo limpia los
   * filters del state interno).
   */
  onClearAll?: () => void;
  /** Total de filtros activos (incluye los del caller — chips, search, etc.). */
  globalActiveCount?: number;
}

/* ── Constantes ─────────────────────────────────────────────────────────────── */

export const PRODUCT_CATEGORIES = [
  { id: null,        label: "Todos", key: "todos" },
  { id: "abarrotes", label: "Abarrotes", key: "abarrotes" },
  { id: "bebidas",   label: "Bebidas", key: "bebidas" },
  { id: "limpieza",  label: "Limpieza", key: "limpieza" },
  { id: "frescos",   label: "Frescos", key: "frescos" },
  { id: "otros",     label: "Otros", key: "otros" },
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
      <p className="text-xs font-bold text-[var(--text-primary)] dark:text-gray-200">Rango de precio</p>
      <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] dark:text-gray-400">
        <span>S/ {min.toFixed(0)}</span>
        <span>S/ {max >= MAX_PRICE_LIMIT ? `${MAX_PRICE_LIMIT}+` : max.toFixed(0)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-[var(--rule-soft)] dark:bg-gray-700">
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
  zones,
  zone,
  onZoneChange,
  extraSort,
  onClearAll,
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
  zones?: ZoneOption[];
  zone?: string;
  onZoneChange?: (zone: string) => void;
  extraSort?: {
    value: string;
    onChange: (v: string) => void;
    options: ReadonlyArray<{ id: string; label: string }>;
  };
  onClearAll?: () => void;
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--text-primary)]/55 backdrop-blur-md" onClick={onClose} aria-hidden="true" />

      {/* Brandon 2026-05-18 v3: Sheet rediseñado.
          - rounded-t-[28px] (alineado con el modal cupón bienvenida)
          - max-h-[88vh] (mejor para pantallas bajas + teclado abierto)
          - shadow-[var(--shadow-xl)] del DS en lugar de shadow-2xl Tailwind
          - Header con eyebrow + título + descripción (jerarquía premium)
          - Botón X 40x40 (WCAG AA) */}
      <div className="relative w-full max-h-[88vh] min-h-[60vh] rounded-t-[28px] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)] motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 flex flex-col border-t border-[var(--rule-soft)]">
        {/* Drag handle */}
        <div className="shrink-0 px-6 pt-3 pb-0">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--text-tertiary)]/30" aria-hidden="true" />
          {/* Header premium */}
          <div className="flex items-start justify-between gap-3 mb-3 pt-1">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1.5">
                <span aria-hidden className="inline-block h-[3px] w-6 rounded-full bg-[var(--accent)]" />
                Refiná tu búsqueda
              </p>
              <h2 className="text-xl font-extrabold tracking-[-0.025em] text-[var(--text-primary)] leading-tight">
                Filtrá las tiendas
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] font-medium">
                Elegí orden, zona, categoría y precio.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors border border-[var(--rule-soft)] active:scale-95"
              aria-label="Cerrar filtros"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Sort — usa extraSort cuando el caller lo provee (caso /tiendas con
              StoresSortKey). Si no, el sort interno de MarketplaceFiltersState. */}
          <div>
            <label htmlFor="mobile-sort" className="mb-2 block text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)]">
              Ordenar por
            </label>
            {extraSort ? (
              <select
                id="mobile-sort"
                value={extraSort.value}
                onChange={(e) => extraSort.onChange(e.target.value)}
                className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] py-3 pl-4 pr-9 text-base font-bold text-[var(--text-primary)]"
              >
                {extraSort.options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ) : (
              <select
                id="mobile-sort"
                value={filters.sortBy}
                onChange={(e) => onChange({ sortBy: e.target.value as SortBy })}
                className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] py-3 pl-4 pr-9 text-base font-bold text-[var(--text-primary)]"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* Zona */}
          {zones && zones.length > 1 && onZoneChange && (
            <div>
              <p className="mb-2.5 flex items-center gap-2 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)]">
                <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--accent)]/12 text-[var(--accent)]">
                  <MapPin className="h-3 w-3" strokeWidth={2.5} />
                </span>
                Zona
              </p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por zona">
                <button
                  type="button"
                  onClick={() => onZoneChange("")}
                  aria-pressed={!zone}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors",
                    !zone
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50",
                  )}
                >
                  Todas las zonas
                </button>
                {zones.filter((z) => z.id !== "").map((z) => {
                  const active = zone === z.id;
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => onZoneChange(active ? "" : z.id)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors",
                        active
                          ? "bg-[var(--accent)] text-white shadow-sm"
                          : "border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50",
                      )}
                    >
                      <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                      {z.label}
                      {typeof z.count === "number" && z.count > 0 && (
                        <span
                          className={cn(
                            "inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold tabular-nums",
                            active ? "bg-white/20 text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                          )}
                        >
                          {z.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Categories */}
          <div>
            <p className="mb-2.5 flex items-center gap-2 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)]">
              <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--accent)]/12 text-[var(--accent)]">
                <SlidersHorizontal className="h-3 w-3" strokeWidth={2.5} />
              </span>
              Categoría
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
              {PRODUCT_CATEGORIES.map((cat) => (
                <button
                  key={String(cat.id)}
                  type="button"
                  onClick={() => onChange({ productCategory: cat.id })}
                  aria-pressed={filters.productCategory === cat.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                    filters.productCategory === cat.id
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "border border-gray-200 bg-white text-[var(--text-secondary)] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 hover:border-gray-400"
                  )}
                >
                  {(() => {
                    const CatIcon = getProductCategoryIcon(cat.key);
                    return <CatIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />;
                  })()}
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div>
            <p className="mb-3 flex items-center gap-2 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)]">
              <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-[var(--accent)]/12 text-[var(--accent)] font-mono text-[10px]">
                S/
              </span>
              Precio
            </p>
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
            aria-pressed={filters.nearbyEnabled}
            aria-label={geoLoading ? "Obteniendo ubicación..." : filters.nearbyEnabled ? "Desactivar tiendas cercanas" : "Mostrar tiendas cercanas"}
            className={cn(
              "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60",
              filters.nearbyEnabled
                ? "bg-primary text-white shadow-md"
                : "border border-gray-200 bg-white text-[var(--text-secondary)] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            )}
          >
            {geoLoading
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <LocateFixed className="h-4 w-4" aria-hidden="true" />}
            {filters.nearbyEnabled ? "Cerca de mí ✓" : "Cerca de mí"}
          </button>
        </div>

        {/* Brandon 2026-05-18 v3: sticky bar con safe-area-inset + jerarquía
            visual entre "Limpiar" (secundario) y "Aplicar" (primario). */}
        <div
          className="shrink-0 border-t border-[var(--rule-soft)] px-6 pt-3 flex gap-3 bg-[var(--surface-raised)]"
          style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => {
              if (onClearAll) onClearAll();
              else onReset();
            }}
            aria-label="Limpiar todos los filtros"
            className="h-12 flex-1 rounded-2xl text-sm font-extrabold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors active:scale-[0.985]"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-[2] rounded-2xl bg-[var(--text-primary)] text-sm font-extrabold text-[var(--surface-raised)] hover:opacity-90 transition-opacity active:scale-[0.985] uppercase tracking-wide"
          >
            Ver tiendas
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Componente principal: barra horizontal compacta ────────────────────────── */

export default function MarketplaceFilters(props: MarketplaceFiltersProps) {
  const {
    filters,
    onChange,
    onRequestGeo,
    geoLoading,
    hideProductCategory,
    zones,
    zone,
    onZoneChange,
    extraSort,
    onClearAll,
    globalActiveCount,
  } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  const baseActiveCount = countActiveFilters(filters);
  const zoneActive = !!zone;
  // Si el caller pasa globalActiveCount, lo usamos (cuenta search + chips +
  // sort externo). Si no, calculamos del estado interno.
  const activeCount = globalActiveCount ?? (baseActiveCount + (zoneActive ? 1 : 0));
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
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          aria-label={activeCount > 0 ? `Filtros (${activeCount} activos)` : "Filtros"}
          className={cn(
            "inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold border transition-colors",
            activeCount > 0
              ? "bg-primary/10 border-primary/30 text-primary"
              : "border-gray-200 bg-white text-[var(--text-secondary)] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filtros
          {activeCount > 0 && (
            <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[length:var(--ts-2xs)] font-bold text-white">
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
        onReset={() => {
          handleReset();
          onZoneChange?.("");
        }}
        activeCount={activeCount}
        zones={zones}
        zone={zone}
        onZoneChange={onZoneChange}
        extraSort={extraSort}
        onClearAll={onClearAll}
      />

      {/* ── Desktop: barra horizontal compacta ── */}
      <div className="hidden sm:flex items-center gap-2 flex-wrap">
        {/* Categorías como pills horizontales — ocultas si el caller las renderiza arriba */}
        {!hideProductCategory && (
          <>
            <div role="group" aria-label="Filtrar por categoría de producto" className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
              {PRODUCT_CATEGORIES.map((cat) => (
                <button
                  key={String(cat.id)}
                  type="button"
                  onClick={() => onChange({ productCategory: cat.id })}
                  aria-pressed={filters.productCategory === cat.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all shrink-0",
                    filters.productCategory === cat.id
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white"
                      : "bg-white dark:bg-gray-900 text-[var(--text-secondary)] dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400"
                  )}
                >
                  {(() => {
                    const CatIcon = getProductCategoryIcon(cat.key);
                    return <CatIcon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />;
                  })()}
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Separador */}
            <div className="h-6 w-px bg-[var(--rule-soft)] dark:bg-gray-700 mx-1 shrink-0" />
          </>
        )}

        {/* Ordenar — dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setSortOpen(!sortOpen); setPriceOpen(false); }}
            aria-expanded={sortOpen}
            aria-haspopup="listbox"
            aria-label={`Ordenar por: ${currentSort.label}`}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-all",
              filters.sortBy !== "relevance"
                ? "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30"
                : "bg-[var(--surface-canvas)] text-[var(--text-primary)] border-[var(--rule-base)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/20"
            )}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {currentSort.short}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", sortOpen && "rotate-180")} aria-hidden="true" />
          </button>
          <FilterDropdown open={sortOpen} onClose={handleCloseSortDropdown}>
            <div className="space-y-0.5">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange({ sortBy: opt.value }); setSortOpen(false); }}
                  aria-pressed={filters.sortBy === opt.value}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                    filters.sortBy === opt.value
                      ? "bg-primary/10 text-primary"
                      : "text-[var(--text-secondary)] dark:text-gray-300 hover:bg-[var(--surface-alt)] dark:hover:bg-gray-800"
                  )}
                >
                  {filters.sortBy === opt.value && <Check className="h-3 w-3" aria-hidden="true" />}
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
            aria-expanded={priceOpen}
            aria-haspopup="dialog"
            aria-label={priceActive ? `Precio: S/${filters.minPrice} a S/${filters.maxPrice >= MAX_PRICE_LIMIT ? "500+" : filters.maxPrice}` : "Filtrar por precio"}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-all",
              priceActive
                ? "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/30"
                : "bg-[var(--surface-canvas)] text-[var(--text-primary)] border-[var(--rule-base)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/20"
            )}
          >
            <DollarSign className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {priceActive ? `S/${filters.minPrice} – S/${filters.maxPrice >= MAX_PRICE_LIMIT ? "500+" : filters.maxPrice}` : "Precio"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", priceOpen && "rotate-180")} aria-hidden="true" />
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
          aria-pressed={filters.nearbyEnabled}
          aria-label={geoLoading ? "Obteniendo ubicación..." : filters.nearbyEnabled ? "Desactivar tiendas cercanas" : "Mostrar tiendas cercanas"}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-all disabled:opacity-60",
            filters.nearbyEnabled
              ? "bg-[var(--accent-600,var(--accent))] text-white border-[var(--accent)] shadow-sm"
              : "bg-[var(--surface-canvas)] text-[var(--text-primary)] border-[var(--rule-base)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] hover:bg-[var(--accent-soft)]/20"
          )}
        >
          {geoLoading
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <LocateFixed className="h-4 w-4" aria-hidden="true" />}
          {filters.nearbyEnabled ? "Cerca ✓" : "Cerca"}
        </button>

        {/* Limpiar */}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={handleReset}
            aria-label="Limpiar todos los filtros"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Limpiar
          </button>
        )}
      </div>
    </>
  );
}
