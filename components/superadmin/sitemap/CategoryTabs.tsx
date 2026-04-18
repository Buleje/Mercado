"use client";

/**
 * CategoryTabs — chips horizontales de categoría con contador.
 *
 * Scroll horizontal en mobile. Active usa tokens --accent/--text-inverse.
 */

import { SITE_CATEGORIES, type SiteCategoryId } from "@/lib/site-map";

interface Props {
  active: SiteCategoryId | "all";
  onChange: (v: SiteCategoryId | "all") => void;
  counts: Record<string, number>;
}

export default function CategoryTabs({ active, onChange, counts }: Props) {
  return (
    <nav aria-label="Filtrar por categoría" className="-mx-1">
      <div className="flex flex-wrap gap-2 px-1">
        <Chip
          label="Todas"
          count={counts.all ?? 0}
          active={active === "all"}
          onClick={() => onChange("all")}
        />
        {SITE_CATEGORIES.map((cat) => (
          <Chip
            key={cat.id}
            label={cat.label}
            count={counts[cat.id] ?? 0}
            active={active === cat.id}
            onClick={() => onChange(cat.id)}
          />
        ))}
      </div>
    </nav>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
        active
          ? "bg-[var(--accent)] text-white border-[var(--accent)]"
          : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        className={[
          "tabular-nums text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full",
          active
            ? "bg-white/25 text-white"
            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
        ].join(" ")}
      >
        {count}
      </span>
    </button>
  );
}
