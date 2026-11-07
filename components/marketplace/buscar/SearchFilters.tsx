"use client";

/**
 * SearchFilters — Sidebar de filtros para la busqueda global.
 *
 * Extiende el patron de CategoryFilters con soporte de categorias dinamicas
 * (facets del backend) en lugar de subCategorias estaticas.
 *
 * Grupos (todos filtran en el servidor vía el link):
 *   1. Categoria (checkboxes con count desde facets)
 *   2. Tiendas (checkboxes con count, max 8 + "Ver mas")
 *   3. Precio (inputs desde/hasta)
 *   4. Disponibilidad (radio) — stock null = se hace al pedido = disponible
 *   5. Calificación (radio 4+/3+/2+/1+) — sólo si alguna tienda tiene estrellas
 *   6. Zona (radio) — sólo con 2+ zonas con tiendas publicadas
 *   7. CTA Limpiar filtros
 *
 * «Entrega express / mismo día» se quitó (2026-10-09): no hay ningún dato de
 * tiempo de entrega en la base y el filtro no hacía nada.
 */

import { useState } from "react";
import { Star, ChevronDown } from "@buleje/design-system/icons";
import type { StoreFacet, CategoryFacet } from "@/lib/db/marketplace-search.db";
import { FilterGroup, RadioRow, CheckboxRow } from "./SearchFilterControls";
import { hayFiltrosActivos, type FiltrosBuscar } from "@/lib/marketplace/buscar-params";

/** El estado del panel ES lo que viaja en el link (lib/marketplace/buscar-params.ts). */
export type SearchFiltersState = FiltrosBuscar;

interface SearchFiltersProps {
  storesFacet: StoreFacet[];
  categoriesFacet: CategoryFacet[];
  /** Zonas con tiendas publicadas: con menos de 2 el bloque se esconde. */
  zonesFacet: string[];
  filters: SearchFiltersState;
  onChange: (next: SearchFiltersState) => void;
  onReset: () => void;
}

const MAX_STORES_VISIBLE = 8;
const MAX_CATS_VISIBLE = 6;

// ── Componente principal ──────────────────────────────────────────────────────

export default function SearchFilters({
  storesFacet,
  categoriesFacet,
  zonesFacet,
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
      stores: exists ? filters.stores.filter((s) => s !== storeId) : [...filters.stores, storeId],
    });
  };

  const hasActive = hayFiltrosActivos(filters);
  // Bloques sin datos se esconden (salvo que el link ya traiga ese filtro,
  // para poder deshacerlo): hoy las 4 tiendas tienen 0 estrellas y 1 zona.
  const verCalificacion = filters.minRating > 0 || storesFacet.some((s) => s.rating > 0);
  const verZona = filters.zone != null || zonesFacet.length > 1;
  const zonas =
    filters.zone && !zonesFacet.includes(filters.zone) ? [...zonesFacet, filters.zone] : zonesFacet;

  const visibleStores = showAllStores ? storesFacet : storesFacet.slice(0, MAX_STORES_VISIBLE);

  const visibleCats = showAllCats ? categoriesFacet : categoriesFacet.slice(0, MAX_CATS_VISIBLE);

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-2xl p-5 space-y-6 lg:sticky lg:top-24">
      {/* Categorias (facets dinamicos del backend) */}
      {categoriesFacet.length > 0 && (
        <FilterGroup title="Categoría">
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
              {showAllCats ? "Ver menos" : `Ver ${categoriesFacet.length - MAX_CATS_VISIBLE} más`}
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
              {showAllStores ? "Ver menos" : `Ver ${storesFacet.length - MAX_STORES_VISIBLE} más`}
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
            className="w-full h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)] transition-colors"
            min={0}
            aria-label="Precio mínimo"
          />
          <span className="text-[var(--text-tertiary)] text-xs" aria-hidden="true">
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
            className="w-full h-12 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 focus:border-[var(--accent)] transition-colors"
            min={0}
            aria-label="Precio máximo"
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

      {/* Calificación de la tienda */}
      {verCalificacion && (
        <FilterGroup title="Calificación de la tienda">
          <RadioRow
            label="Cualquiera"
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
                      s <= n ? "text-[var(--text-primary)] fill-current" : "text-[var(--rule-base)]"
                    }`}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                ))}
                <span className="ml-1 text-xs text-[var(--text-tertiary)]">o más</span>
              </span>
            </RadioRow>
          ))}
        </FilterGroup>
      )}

      {/* Zona: sale de las tiendas publicadas, no de una lista fija */}
      {verZona && (
        <FilterGroup title="Zona">
          <RadioRow
            label="Todas"
            checked={filters.zone === null}
            onChange={() => onChange({ ...filters, zone: null })}
          />
          {zonas.map((z) => (
            <RadioRow
              key={z}
              label={z}
              checked={filters.zone === z}
              onChange={() => onChange({ ...filters, zone: z })}
            />
          ))}
        </FilterGroup>
      )}

      {/* CTA Limpiar */}
      {hasActive && (
        <button
          onClick={onReset}
          className="w-full rounded-full border-2 border-[var(--rule-base)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:border-[var(--rule-strong)] transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
