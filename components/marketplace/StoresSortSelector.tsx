"use client";

/**
 * StoresSortSelector — TS-22 sort visible para directorio /tiendas.
 *
 * Persiste la opción en localStorage para que el usuario no la repita cada
 * sesión. Los handlers de sort viven afuera (filtros del client).
 *
 * Sprint 4 tiendas blueprint.
 */

import { useEffect } from "react";
import { ArrowUpDown, ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type StoresSortKey = "relevance" | "delivery" | "rating" | "distance" | "newest";

const STORAGE_KEY = "tiendas-sort:v1";

// PENTEST 2026-05-18 Sprint D follow-up: exportar para que MarketplaceFilters
// drawer mobile pueda mostrar el sort dentro del modal (Brandon pidió fusionar
// "Filtros" y "Ordenar" en un solo modal mobile).
export const STORES_SORT_OPTIONS: Array<{ id: StoresSortKey; label: string }> = [
  { id: "relevance", label: "Relevancia" },
  { id: "delivery",  label: "Delivery + rápido" },
  { id: "rating",    label: "Mejor rating" },
  { id: "distance",  label: "Más cerca" },
  { id: "newest",    label: "Nuevas" },
];
const OPTIONS = STORES_SORT_OPTIONS;

interface Props {
  value: StoresSortKey;
  onChange: (next: StoresSortKey) => void;
  className?: string;
  /**
   * Variante compacta para filas mobile con poco espacio. Brandon 2026-05-21:
   * - Sin eyebrow "ORDENAR" — ícono `ArrowUpDown` lo reemplaza visualmente.
   * - Padding y typografía más chicos: `py-1.5 px-3 text-xs`.
   * - Ancho final ~90 px (vs ~130 px del default).
   * Default `false` — backward compatible con consumers existentes.
   */
  compact?: boolean;
}

export default function StoresSortSelector({
  value,
  onChange,
  className,
  compact = false,
}: Props) {
  // Persistir al cambiar
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignorar — modo privado / quota
    }
  }, [value]);

  return (
    <label
      className={cn(
        "inline-flex items-center rounded-full border bg-[var(--surface-canvas)] font-bold border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)]/20 transition-all cursor-pointer",
        compact
          ? "gap-1.5 h-9 px-2.5 text-xs"
          : "gap-2 px-4 py-2 text-sm",
        className,
      )}
    >
      {compact ? (
        <ArrowUpDown
          className="h-3.5 w-3.5 text-[var(--text-secondary)] shrink-0"
          strokeWidth={2.25}
          aria-hidden
        />
      ) : (
        <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mr-0.5">
          Ordenar
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as StoresSortKey)}
        aria-label="Ordenar tiendas por"
        className={cn(
          "bg-transparent outline-none cursor-pointer appearance-none font-bold",
          compact ? "pr-0.5" : "pr-1",
        )}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          "text-[var(--text-tertiary)] shrink-0",
          compact ? "h-3.5 w-3.5" : "h-4 w-4",
        )}
        strokeWidth={2}
        aria-hidden
      />
    </label>
  );
}

/** Lee el último sort persistido. SSR-safe. */
export function loadStoredSort(): StoresSortKey {
  if (typeof window === "undefined") return "relevance";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && OPTIONS.some((o) => o.id === raw)) {
      return raw as StoresSortKey;
    }
  } catch {
    // ignorar
  }
  return "relevance";
}
