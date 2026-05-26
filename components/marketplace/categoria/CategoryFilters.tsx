"use client";

/**
 * CategoryFilters — Sidebar de filtros estilo Amazon adaptado Buleje.
 *
 * Grupos apilados (8pt grid gaps):
 *   1. Sub-categoria (radio exclusivo)
 *   2. Tiendas (checkbox multiple)
 *   3. Precio (inputs numericos desde/hasta)
 *   4. Disponibilidad (radio)
 *   5. Rating (radio 4+/3+/2+/1+)
 *   6. Zona (radio Calleria/Manantay/Yarinacocha/Todos)
 *   7. Tiempo entrega (radio Express/Mismo dia/Cualquiera)
 *   8. CTA "Limpiar filtros"
 *
 * No depende de Radix ni librerias externas — solo inputs HTML con styling
 * tokenizado del DS para mantener bundle liviano.
 */

import { Star } from "@buleje/design-system/icons";
import type { CategoriaDef } from "@/lib/constants/marketplace-categories";
import { cn } from "@/lib/utils";

export type CategoryFiltersState = {
  subCategoria: string | null;
  stores: string[];
  priceMin: number | null;
  priceMax: number | null;
  availability: "all" | "inStock" | "outOfStock";
  minStoreRating: number;
  zone: string | null;
  deliveryTime: "any" | "express" | "sameDay";
};

type StoreFacet = {
  id: string;
  slug: string;
  name: string;
  count: number;
  zone: string | null;
};

interface CategoryFiltersProps {
  slug: string;
  categoria: CategoriaDef;
  storesFacet: StoreFacet[];
  filters: CategoryFiltersState;
  onChange: (next: CategoryFiltersState) => void;
  onReset: () => void;
  /** Conteo de productos por subcategoría (para los chips). Opcional. */
  subCategoryCounts?: Record<string, number>;
  /** Total de productos de la categoría (chip "Todas"). */
  totalCount?: number;
}

/** Chip-pill destacado para subcategorías (énfasis visual sobre el resto). */
function SubCatChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-3 h-9 text-sm font-bold capitalize transition-all",
        active
          ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-sm"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]",
      )}
    >
      <span className="truncate max-w-[140px]">{label}</span>
      {count != null && (
        <span
          className={cn(
            "text-xs font-extrabold tabular-nums",
            active ? "text-white/85" : "text-[var(--text-tertiary)]",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

const ZONES = ["Calleria", "Manantay", "Yarinacocha"];

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function RadioRow({
  checked,
  onChange,
  label,
  count,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm cursor-pointer group">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`h-4 w-4 rounded-full border flex items-center justify-center transition-colors ${
          checked
            ? "border-primary bg-primary"
            : "border-gray-300 dark:border-gray-700 group-hover:border-gray-500"
        }`}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span
        className={`flex-1 ${
          checked
            ? "font-semibold text-[var(--text-primary)] dark:text-white"
            : "text-[var(--text-secondary)] dark:text-gray-400"
        }`}
      >
        {children ?? label}
      </span>
      {count != null && (
        <span className="text-xs text-[var(--text-tertiary)]">{count}</span>
      )}
    </label>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  count,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
          checked
            ? "border-primary bg-primary"
            : "border-gray-300 dark:border-gray-700 group-hover:border-gray-500"
        }`}
      >
        {checked && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M1.5 5.5L4 8L8.5 2.5"
              stroke="white"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span
        className={`flex-1 truncate ${
          checked
            ? "font-semibold text-[var(--text-primary)] dark:text-white"
            : "text-[var(--text-secondary)] dark:text-gray-400"
        }`}
      >
        {label}
      </span>
      {count != null && (
        <span className="text-xs text-[var(--text-tertiary)]">{count}</span>
      )}
    </label>
  );
}

export default function CategoryFilters({
  categoria,
  storesFacet,
  filters,
  onChange,
  onReset,
  subCategoryCounts,
  totalCount,
}: CategoryFiltersProps) {
  const toggleStore = (storeId: string) => {
    const exists = filters.stores.includes(storeId);
    onChange({
      ...filters,
      stores: exists
        ? filters.stores.filter((s) => s !== storeId)
        : [...filters.stores, storeId],
    });
  };

  const activeCount =
    (filters.subCategoria !== null ? 1 : 0) +
    (filters.stores.length > 0 ? 1 : 0) +
    (filters.priceMin !== null || filters.priceMax !== null ? 1 : 0) +
    (filters.availability !== "all" ? 1 : 0) +
    (filters.minStoreRating > 0 ? 1 : 0) +
    (filters.zone !== null ? 1 : 0) +
    (filters.deliveryTime !== "any" ? 1 : 0);
  const hasActive = activeCount > 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-6 lg:sticky lg:top-24">
      {/* Sub-categoria — DESTACADA: chips visuales con conteo (no radios).
          Es el filtro #1 que usa la gente; va arriba y con más peso visual. */}
      <div>
        <h3 className="mb-3 text-[length:var(--ts-xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)]">
          Subcategorías
        </h3>
        <div className="flex flex-wrap gap-2">
          <SubCatChip
            label="Todas"
            count={totalCount}
            active={filters.subCategoria === null}
            onClick={() => onChange({ ...filters, subCategoria: null })}
          />
          {categoria.subCategorias
            // Si tenemos conteos, ocultamos las subcategorías sin productos —
            // un chip que filtra a 0 resultados es ruido. Sin conteos (undefined)
            // mostramos todas.
            .filter((sub) => subCategoryCounts == null || (subCategoryCounts[sub] ?? 0) > 0)
            .map((sub) => (
              <SubCatChip
                key={sub}
                label={sub}
                count={subCategoryCounts?.[sub]}
                active={filters.subCategoria === sub}
                onClick={() => onChange({ ...filters, subCategoria: sub })}
              />
            ))}
        </div>
      </div>

      <div className="h-px bg-[var(--rule-soft)]" aria-hidden />


      {/* Tiendas */}
      {storesFacet.length > 0 && (
        <FilterGroup title="Tiendas">
          {storesFacet.slice(0, 8).map((s) => (
            <CheckboxRow
              key={s.id}
              label={s.name}
              count={s.count}
              checked={filters.stores.includes(s.id)}
              onChange={() => toggleStore(s.id)}
            />
          ))}
        </FilterGroup>
      )}

      {/* Precio */}
      <FilterGroup title="Precio (S/)">
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Desde"
            value={filters.priceMin ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                priceMin: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
            min={0}
          />
          <span className="text-[var(--text-tertiary)] text-xs">—</span>
          <input
            type="number"
            placeholder="Hasta"
            value={filters.priceMax ?? ""}
            onChange={(e) =>
              onChange({
                ...filters,
                priceMax: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
            min={0}
          />
        </div>
      </FilterGroup>

      {/* Disponibilidad */}
      <FilterGroup title="Disponibilidad">
        <RadioRow
          label="Todos"
          checked={filters.availability === "all"}
          onChange={() => onChange({ ...filters, availability: "all" })}
        />
        <RadioRow
          label="En stock"
          checked={filters.availability === "inStock"}
          onChange={() => onChange({ ...filters, availability: "inStock" })}
        />
        <RadioRow
          label="Agotados"
          checked={filters.availability === "outOfStock"}
          onChange={() => onChange({ ...filters, availability: "outOfStock" })}
        />
      </FilterGroup>

      {/* Rating */}
      <FilterGroup title="Rating tienda">
        <RadioRow
          label="Todos"
          checked={filters.minStoreRating === 0}
          onChange={() => onChange({ ...filters, minStoreRating: 0 })}
        />
        {[4, 3, 2, 1].map((n) => (
          <RadioRow
            key={n}
            label={`${n}+`}
            checked={filters.minStoreRating === n}
            onChange={() => onChange({ ...filters, minStoreRating: n })}
          >
            <span className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-3 w-3 ${
                    s <= n
                      ? "text-[var(--text-primary)] dark:text-white fill-current"
                      : "text-[var(--text-tertiary)] dark:text-gray-700"
                  }`}
                  strokeWidth={1.5}
                />
              ))}
              <span className="ml-1 text-xs text-[var(--text-secondary)]">y mas</span>
            </span>
          </RadioRow>
        ))}
      </FilterGroup>

      {/* Zona */}
      <FilterGroup title="Zona Pucallpa">
        <RadioRow
          label="Todas"
          checked={filters.zone === null}
          onChange={() => onChange({ ...filters, zone: null })}
        />
        {ZONES.map((z) => (
          <RadioRow
            key={z}
            label={z}
            checked={filters.zone === z}
            onChange={() => onChange({ ...filters, zone: z })}
          />
        ))}
      </FilterGroup>

      {/* Tiempo entrega */}
      <FilterGroup title="Entrega">
        <RadioRow
          label="Cualquiera"
          checked={filters.deliveryTime === "any"}
          onChange={() => onChange({ ...filters, deliveryTime: "any" })}
        />
        <RadioRow
          label="Express <25 min"
          checked={filters.deliveryTime === "express"}
          onChange={() => onChange({ ...filters, deliveryTime: "express" })}
        />
        <RadioRow
          label="Mismo dia"
          checked={filters.deliveryTime === "sameDay"}
          onChange={() => onChange({ ...filters, deliveryTime: "sameDay" })}
        />
      </FilterGroup>

      {hasActive && (
        <button
          onClick={onReset}
          className="w-full rounded-full border border-gray-300 dark:border-gray-700 px-4 py-2 text-xs font-semibold text-[var(--text-primary)] dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Limpiar filtros ({activeCount})
        </button>
      )}
    </div>
  );
}
