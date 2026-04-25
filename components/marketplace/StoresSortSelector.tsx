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
import { ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type StoresSortKey = "relevance" | "delivery" | "rating" | "distance" | "newest";

const STORAGE_KEY = "tiendas-sort:v1";

const OPTIONS: Array<{ id: StoresSortKey; label: string }> = [
  { id: "relevance", label: "Relevancia" },
  { id: "delivery",  label: "Delivery + rápido" },
  { id: "rating",    label: "Mejor rating" },
  { id: "distance",  label: "Más cerca" },
  { id: "newest",    label: "Nuevas" },
];

interface Props {
  value: StoresSortKey;
  onChange: (next: StoresSortKey) => void;
  className?: string;
}

export default function StoresSortSelector({ value, onChange, className }: Props) {
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
        "inline-flex items-center gap-2 rounded-full border bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold border-[var(--rule-soft)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 transition-colors",
        className,
      )}
    >
      <span className="sr-only">Ordenar por</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as StoresSortKey)}
        aria-label="Ordenar tiendas por"
        className="bg-transparent outline-none cursor-pointer pr-1 appearance-none"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
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
