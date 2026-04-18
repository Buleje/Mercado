"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, Eye } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * LowStockUrgency — indicador de urgencia honesto basado en stock real.
 *
 * Muestra:
 * - Nivel 1 (stock 6-10): "Solo {N} unidades" — amber, sin pulse
 * - Nivel 2 (stock 2-5): "Solo {N} unidades — se está agotando" — red-500, con pulse sutil
 * - Nivel 3 (stock 1): "¡Última unidad!" — red-600, pulse marcado
 *
 * Opcional `recentViews`: si se pasa, muestra social proof "X personas vieron
 * en la última hora" — SOLO con datos reales. No inventar.
 *
 * Respeta `prefers-reduced-motion` — sin animación si el usuario pidió no.
 */

type Level = 1 | 2 | 3;

interface Props {
  /** Stock real del producto (entero ≥ 0). */
  stock: number;
  /** Umbral a partir del cual mostrar el indicador. Default: 10. */
  threshold?: number;
  /** Vistas reales en la última hora (de tracking backend). Opcional — NO inventar. */
  recentViews?: number;
  /** Variante compacta (solo la frase, sin caja). Para cards de grid. */
  compact?: boolean;
  className?: string;
}

function getLevel(stock: number): Level | null {
  if (stock <= 0) return null;
  if (stock === 1) return 3;
  if (stock <= 5) return 2;
  if (stock <= 10) return 1;
  return null;
}

const LEVEL_STYLES: Record<Level, { container: string; icon: string; label: (n: number) => string }> = {
  1: {
    container: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-900",
    icon: "text-amber-600 dark:text-amber-400",
    label: (n) => `Solo quedan ${n} unidades`,
  },
  2: {
    container: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 ring-1 ring-red-200 dark:ring-red-900",
    icon: "text-red-600 dark:text-red-400 motion-safe:animate-pulse",
    label: (n) => `Solo ${n} unidades — se está agotando`,
  },
  3: {
    container: "bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-200 ring-1 ring-red-300 dark:ring-red-800 motion-safe:animate-pulse",
    icon: "text-red-700 dark:text-red-300",
    label: () => "Última unidad disponible",
  },
};

export default function LowStockUrgency({
  stock,
  threshold = 10,
  recentViews,
  compact = false,
  className,
}: Props) {
  const level = stock <= threshold ? getLevel(stock) : null;

  // Social proof: solo si es un número real >= 3 (evitar "1 persona" que suena vacío).
  const showSocialProof = typeof recentViews === "number" && recentViews >= 3;

  // Client-mount guard para evitar hydration mismatch si se agregan timers luego.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!level) return null;

  const style = LEVEL_STYLES[level];

  if (compact) {
    return (
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md",
          style.container,
          className,
        )}
      >
        <AlertCircle className={cn("h-3 w-3", style.icon)} aria-hidden="true" />
        {style.label(stock)}
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col gap-1.5 px-3 py-2 rounded-lg",
        style.container,
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <AlertCircle className={cn("h-4 w-4 shrink-0", style.icon)} aria-hidden="true" />
        <span className="text-sm font-semibold">{style.label(stock)}</span>
      </div>
      {mounted && showSocialProof && (
        <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
          <Eye className="h-3 w-3" aria-hidden="true" />
          <span>{recentViews} personas lo vieron en la última hora</span>
        </div>
      )}
    </div>
  );
}
