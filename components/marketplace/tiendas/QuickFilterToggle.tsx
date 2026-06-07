"use client";

/**
 * QuickFilterToggle — botón toggle de filtro rápido del filter bar de /tiendas.
 *
 * Audit #12: los toggles "4+ estrellas" (top_rated) y "Abierto ahora"
 * (open_now) se repetían 4× (cada uno en variante pill mobile + full desktop).
 * Mismo markup salvo icono/label/estado → 1 componente con `variant`.
 * Markup preservado EXACTO (refactor sin cambio visual).
 */

import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

interface QuickFilterToggleProps {
  active: boolean;
  onToggle: () => void;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  variant: "pill" | "full";
  title?: string;
  /** Star rellena (fill-current) cuando está activo; Clock no. */
  fillIconWhenActive?: boolean;
}

export default function QuickFilterToggle({
  active,
  onToggle,
  icon: Icon,
  label,
  variant,
  title,
  fillIconWhenActive,
}: QuickFilterToggleProps) {
  const isPill = variant === "pill";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={title}
      className={cn(
        isPill
          ? "shrink-0 [scroll-snap-align:start] inline-flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-none text-xs font-bold transition-all whitespace-nowrap"
          : "w-full inline-flex items-center gap-2 h-11 px-3.5 rounded-none text-sm font-bold transition-all border-2",
        active
          ? isPill
            ? "bg-[var(--accent)] text-white border border-[var(--accent)]"
            : "bg-[var(--accent)] text-white border-[var(--accent)]"
          : isPill
            ? "bg-[var(--surface-canvas)] text-[var(--text-primary)] border border-[var(--rule-base)] hover:border-[var(--accent)]/50"
            : "bg-[var(--surface-canvas)] text-[var(--text-primary)] border-[var(--rule-base)] hover:border-[var(--accent)]/50",
      )}
    >
      <Icon
        className={cn(isPill ? "h-3.5 w-3.5" : "h-4 w-4", fillIconWhenActive && active && "fill-current")}
        strokeWidth={2}
      />
      <span>{label}</span>
    </button>
  );
}
