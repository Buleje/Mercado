"use client";

import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
 * FilterChip — Chip de filtro reutilizable para toolbars de módulos admin.
 *
 * Dos estados visuales:
 *   - Inactivo: borde gris, fondo blanco
 *   - Activo: tint del color seleccionado (emerald por defecto)
 *
 * Colores soportados: emerald, violet, blue, amber, red
 * ═══════════════════════════════════════════════════════════════════════════ */

type ChipColor = "emerald" | "violet" | "blue" | "amber" | "red";

const COLOR_MAP: Record<ChipColor, { chip: string; badge: string }> = {
  emerald: {
    chip: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400",
    badge: "bg-emerald-600 text-white",
  },
  violet: {
    chip: "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    badge: "bg-violet-600 text-white",
  },
  blue: {
    chip: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400",
    badge: "bg-emerald-600 text-white",
  },
  amber: {
    chip: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400",
    badge: "bg-amber-600 text-white",
  },
  red: {
    chip: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400",
    badge: "bg-red-600 text-white",
  },
};

interface FilterChipProps {
  /** Texto del chip */
  label: string;
  /** Estado activo/seleccionado */
  active?: boolean;
  /** Badge numérico opcional */
  count?: number;
  /** Callback al hacer click */
  onClick: () => void;
  /** Color del estado activo (default: emerald) */
  color?: ChipColor;
}

export default function FilterChip({
  label,
  active = false,
  count,
  onClick,
  color = "emerald",
}: FilterChipProps) {
  const palette = COLOR_MAP[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium border transition-all",
        active
          ? palette.chip
          : "border-[var(--rule-base)] dark:border-zinc-700 text-gray-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800",
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[length:var(--ts-2xs)] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
            active
              ? palette.badge
              : "bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
