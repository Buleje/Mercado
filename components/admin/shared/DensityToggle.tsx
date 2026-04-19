"use client";

/**
 * DensityToggle — 3 niveles de densidad para listas (cómodo/compacto/super).
 *
 * Cada módulo del admin puede tener su DensityToggle que cambia:
 *   · cómodo (default): padding generoso, fuente normal
 *   · compacto: padding reducido, más filas en pantalla
 *   · super-compacto: máxima densidad, útil para power users
 *
 * Uso:
 *   const [density, setDensity] = useDensity("products");
 *   <DensityToggle value={density} onChange={setDensity} />
 *   <div className={getDensityClasses(density)}>...</div>
 */

import { useState, useEffect, useCallback } from "react";
import { Rows3, Rows4, Rows2 } from "@buleje/design-system/icons";
import { AdminTooltip } from "./AdminTooltip";
import { cn } from "@/lib/utils";

export type Density = "comfortable" | "compact" | "super-compact";

const DENSITY_META: Array<{
  value: Density;
  icon: typeof Rows3;
  label: string;
  description: string;
}> = [
  { value: "comfortable", icon: Rows3, label: "Cómodo", description: "Espacio generoso, texto grande" },
  { value: "compact", icon: Rows4, label: "Compacto", description: "Más filas visibles, texto normal" },
  { value: "super-compact", icon: Rows2, label: "Denso", description: "Máxima densidad para power users" },
];

interface Props {
  value: Density;
  onChange: (v: Density) => void;
  className?: string;
}

export function DensityToggle({ value, onChange, className }: Props) {
  return (
    <div
      role="group"
      aria-label="Densidad de la lista"
      className={cn(
        "inline-flex items-center bg-[var(--surface-sunken)] rounded-lg p-0.5 gap-0.5",
        className,
      )}
    >
      {DENSITY_META.map((d) => {
        const Icon = d.icon;
        const active = value === d.value;
        return (
          <AdminTooltip key={d.value} content={`${d.label} — ${d.description}`} side="top">
            <button
              type="button"
              onClick={() => onChange(d.value)}
              aria-pressed={active}
              aria-label={d.label}
              className={cn(
                "h-7 w-7 rounded-md flex items-center justify-center transition-colors",
                active
                  ? "bg-[var(--surface-canvas)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </AdminTooltip>
        );
      })}
    </div>
  );
}

// Hook para persistir preferencia por módulo en localStorage
export function useDensity(moduleKey: string): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`admin-density:${moduleKey}`);
      if (stored === "comfortable" || stored === "compact" || stored === "super-compact") {
        setDensity(stored);
      }
    } catch {
      /* ignore */
    }
  }, [moduleKey]);

  const update = useCallback(
    (d: Density) => {
      setDensity(d);
      try {
        localStorage.setItem(`admin-density:${moduleKey}`, d);
      } catch {
        /* ignore */
      }
    },
    [moduleKey],
  );

  return [density, update];
}

// Clases para aplicar a las filas según densidad
export function getDensityClasses(density: Density): string {
  switch (density) {
    case "super-compact":
      return "[&_.row]:py-1 [&_.row]:text-xs";
    case "compact":
      return "[&_.row]:py-2 [&_.row]:text-sm";
    case "comfortable":
    default:
      return "[&_.row]:py-3 [&_.row]:text-sm";
  }
}

export default DensityToggle;
