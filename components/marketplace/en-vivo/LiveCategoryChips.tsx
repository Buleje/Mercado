"use client";

import { useMemo } from "react";

export interface LiveCategoryChipsProps {
  categories: string[];
  active: string | null;
  onChange: (category: string | null) => void;
}

export function LiveCategoryChips({ categories, active, onChange }: LiveCategoryChipsProps) {
  const list = useMemo(() => categories.slice().sort((a, b) => a.localeCompare(b)), [categories]);

  return (
    <div
      role="tablist"
      aria-label="Filtrar transmisiones por categoría"
      className="flex flex-wrap items-center gap-2"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === null}
        onClick={() => onChange(null)}
        className={
          active === null
            ? "inline-flex items-center rounded-full bg-[var(--text-primary)] px-3.5 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--surface-canvas)]"
            : "inline-flex items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        }
      >
        Todas
      </button>

      {list.map((cat) => {
        const selected = active === cat;
        return (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(selected ? null : cat)}
            className={
              selected
                ? "inline-flex items-center rounded-full bg-[var(--text-primary)] px-3.5 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--surface-canvas)]"
                : "inline-flex items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            }
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
