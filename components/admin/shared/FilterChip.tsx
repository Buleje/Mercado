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
    chip: "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    badge: "bg-primary/10 text-white",
  },
  violet: {
    chip: "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    badge: "bg-[var(--accent-600,var(--accent))] text-white",
  },
  blue: {
    chip: "bg-primary/10 dark:bg-primary/15 border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    badge: "bg-primary/10 text-white",
  },
  amber: {
    chip: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    badge: "bg-[var(--data-warning-500)] text-white",
  },
  red: {
    chip: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
    badge: "bg-[var(--data-error-500)] text-white",
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
          : "border-[var(--rule-base)] dark:border-zinc-700 text-[var(--text-secondary)] dark:text-zinc-400 bg-white dark:bg-zinc-900 hover:bg-[var(--surface-alt)] dark:hover:bg-zinc-800",
      )}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[length:var(--ts-2xs)] font-bold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1",
            active
              ? palette.badge
              : "bg-[var(--rule-soft)] dark:bg-zinc-700 text-[var(--text-secondary)] dark:text-zinc-300",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
