"use client";

/**
 * SearchFilters — Sidebar de filtros para la busqueda global.
 *
 * Extiende el patron de CategoryFilters con soporte de categorias dinamicas
 * (facets del backend) en lugar de subCategorias estaticas.
 *
 * Grupos:
 *   1. Categoria (checkboxes con count desde facets)
 *   2. Tiendas (checkboxes con count, max 8 + "Ver mas")
 *   3. Precio (inputs desde/hasta)
 *   4. Disponibilidad (radio)
 *   5. Rating tienda (radio 4+/3+/2+/1+)
 *   6. Zona Pucallpa (radio)
 *   7. Entrega (radio)
 *   8. CTA Limpiar filtros
 */

import { useState } from "react";
import { Star, ChevronDown } from "lucide-react";
import type { StoreFacet, CategoryFacet } from "@/lib/db/marketplace-search.db";

export type SearchFiltersState = {
  categories: string[];
  stores: string[];
  priceMin: number | null;
  priceMax: number | null;
  availability: "all" | "inStock" | "outOfStock";
  minRating: number;
  zone: string | null;
  deliveryTime: "any" | "express" | "sameDay";
};

interface SearchFiltersProps {
  storesFacet: StoreFacet[];
  categoriesFacet: CategoryFacet[];
  filters: SearchFiltersState;
  onChange: (next: SearchFiltersState) => void;
  onReset: () => void;
}

const ZONES = ["Calleria", "Manantay", "Yarinacocha"];
const MAX_STORES_VISIBLE = 8;
const MAX_CATS_VISIBLE = 6;

// ── Sub-componentes de UI ─────────────────────────────────────────────────────

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500">
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
            ? "font-semibold text-gray-900 dark:text-white"
            : "text-gray-600 dark:text-gray-400"
        }`}
      >
        {children ?? label}
      </span>
      {count != null && (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {count}
        </span>
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
        className={`h-4 w-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
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
            ? "font-semibold text-gray-900 dark:text-white"
            : "text-gray-600 dark:text-gray-400"
        }`}
      >
        {label}
      </span>
      {count != null && (
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {count}
        </span>
      )}
    </label>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function SearchFilters({
  storesFacet,
  categoriesFacet,
  filters,
  onChange,
  onReset,
}: SearchFiltersProps) {
  const [showAllStores, setShowAllStores] = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);

  // ── Toggles ─────────────────────────────────────────────────────────────────

  const toggleCategory = (cat: string) => {
    const exists = filters.categories.includes(cat);
    onChange({
      ...filters,
      categories: exists
        ? filters.categories.filter((c) => c !== cat)
        : [...filters.categories, cat],
    });
  };

  const toggleStore = (storeId: string) => {
    const exists = filters.stores.includes(storeId);
    onChange({
      ...filters,
      stores: exists
        ? filters.stores.filter((s) => s !== storeId)
        : [...filters.stores, storeId],
    });
  };

  const hasActive =
    filters.categories.length > 0 ||
    filters.stores.length > 0 ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    filters.availability !== "all" ||
    filters.minRating > 0 ||
    filters.zone !== null ||
    filters.deliveryTime !== "any";

  const visibleStores = showAllStores
    ? storesFacet
    : storesFacet.slice(0, MAX_STORES_VISIBLE);

  const visibleCats = showAllCats
    ? categoriesFacet
    : categoriesFacet.slice(0, MAX_CATS_VISIBLE);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-6 lg:sticky lg:top-24">
      {/* Categorias (facets dinamicos del backend) */}
      {categoriesFacet.length > 0 && (
        <FilterGroup title="Categoria">
          {visibleCats.map((cat) => (
            <CheckboxRow
              key={cat.category}
              label={cat.category}
              count={cat.count}
              checked={filters.categories.includes(cat.category)}
              onChange={() => toggleCategory(cat.category)}
            />
          ))}
          {categoriesFacet.length > MAX_CATS_VISIBLE && (
            <button
              onClick={() => setShowAllCats((v) => !v)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors mt-1"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showAllCats ? "rotate-180" : ""}`}
                strokeWidth={2}
                aria-hidden="true"
              />
              {showAllCats
                ? "Ver menos"
                : `Ver ${categoriesFacet.length - MAX_CATS_VISIBLE} mas`}
            </button>
          )}
        </FilterGroup>
      )}

      {/* Tiendas */}
      {storesFacet.length > 0 && (
        <FilterGroup title="Tiendas">
          {visibleStores.map((s) => (
            <CheckboxRow
              key={s.id}
              label={s.name}
              count={s.count}
              checked={filters.stores.includes(s.id)}
              onChange={() => toggleStore(s.id)}
            />
          ))}
          {storesFacet.length > MAX_STORES_VISIBLE && (
            <button
              onClick={() => setShowAllStores((v) => !v)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors mt-1"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showAllStores ? "rotate-180" : ""}`}
                strokeWidth={2}
                aria-hidden="true"
              />
              {showAllStores
                ? "Ver menos"
                : `Ver ${storesFacet.length - MAX_STORES_VISIBLE} mas`}
            </button>
          )}
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
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
            min={0}
            aria-label="Precio minimo"
          />
          <span className="text-gray-400 text-xs" aria-hidden="true">
            —
          </span>
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
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
            min={0}
            aria-label="Precio maximo"
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
          onChange={() =>
            onChange({ ...filters, availability: "outOfStock" })
          }
        />
      </FilterGroup>

      {/* Rating tienda */}
      <FilterGroup title="Rating tienda">
        <RadioRow
          label="Todos"
          checked={filters.minRating === 0}
          onChange={() => onChange({ ...filters, minRating: 0 })}
        />
        {[4, 3, 2, 1].map((n) => (
          <RadioRow
            key={n}
            label={`${n}+`}
            checked={filters.minRating === n}
            onChange={() => onChange({ ...filters, minRating: n })}
          >
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-3 w-3 ${
                    s <= n
                      ? "text-gray-900 dark:text-white fill-current"
                      : "text-gray-300 dark:text-gray-700"
                  }`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ))}
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                y mas
              </span>
            </span>
          </RadioRow>
        ))}
      </FilterGroup>

      {/* Zona Pucallpa */}
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

      {/* CTA Limpiar */}
      {hasActive && (
        <button
          onClick={onReset}
          className="w-full rounded-full border border-gray-300 dark:border-gray-700 px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
