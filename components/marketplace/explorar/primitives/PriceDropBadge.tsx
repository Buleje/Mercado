"use client";

/**
 * PriceDropBadge — badge de descuento con animacion shake sutil al montar.
 *
 * Calcula el porcentaje de descuento entre `was` y `now` y lo muestra
 * con tipografia black + tabular-nums.
 *
 * Variants:
 *   - "default" — pill rojo discreto
 *   - "subtle"  — texto + arrow flecha hacia abajo
 *
 * Uso:
 * ```tsx
 * <PriceDropBadge was={29.90} now={19.90} />
 * ```
 */

import { TrendingDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  was: number;
  now: number;
  variant?: "default" | "subtle";
  className?: string;
}

export default function PriceDropBadge({ was, now, variant = "default", className }: Props) {
  if (was <= now || was === 0) return null;
  const pct = Math.round(((was - now) / was) * 100);
  if (pct < 5) return null;

  if (variant === "subtle") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--accent)]",
          className,
        )}
      >
        <TrendingDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        -{pct}%
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2 py-1",
        "text-[length:var(--ts-2xs)] font-black tabular-nums uppercase tracking-wider",
        "bg-[var(--accent)] text-[var(--surface-canvas)]",
        "animate-in fade-in zoom-in-90 duration-300",
        className,
      )}
    >
      -{pct}%
    </span>
  );
}
