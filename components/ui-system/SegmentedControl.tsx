"use client";

/**
 * SegmentedControl — Toggle entre 2-5 opciones, estilo iOS.
 *
 * Diferencia con Tabs: este es para cambiar un MODO o VISTA en la
 * misma pantalla (ej. "Mapa / Lista", "Semana / Mes / Año"), no para
 * navegar a otra ruta.
 *
 * A11y: radiogroup con roving tabindex. Flecha izquierda/derecha para
 * navegar. Enter/Space selecciona.
 *
 * Uso:
 *   <SegmentedControl
 *     value={view}
 *     onChange={setView}
 *     options={[
 *       { value: "list", label: "Lista" },
 *       { value: "map", label: "Mapa" },
 *     ]}
 *   />
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Badge opcional (ej. count) */
  badge?: string | number;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  /** Tamaño. Default "md" */
  size?: "sm" | "md" | "lg";
  /** Nombre accesible */
  label?: string;
  className?: string;
}

const SIZE_CLASSES = {
  sm: "h-8 text-xs px-3",
  md: "h-9 text-sm px-4",
  lg: "h-11 text-sm px-5",
} as const;

export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  label,
  className,
}: Props<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const enabled = options.filter((o) => !o.disabled);
    const currentIdx = enabled.findIndex((o) => o.value === value);
    let nextIdx = currentIdx;
    if (e.key === "ArrowRight") nextIdx = (currentIdx + 1) % enabled.length;
    else if (e.key === "ArrowLeft") nextIdx = (currentIdx - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = enabled.length - 1;
    onChange(enabled[nextIdx].value);
  };

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)]",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full font-bold transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
              SIZE_CLASSES[size],
              selected
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
            )}
          >
            {opt.icon && <span aria-hidden>{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.badge !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums",
                  selected
                    ? "bg-[var(--accent)] text-[var(--surface-canvas)]"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
