"use client";

/**
 * RatingStars — Display + input de rating con estrellas.
 *
 * Dos modos:
 *   - "display" (default): readonly, muestra rating + count opcional
 *   - "input": interactivo, con keyboard nav + hover preview
 *
 * Soporta medio-estrella para display (4.5, 3.5, etc).
 *
 * API:
 *   <RatingStars value={4.5} count={128} />
 *   <RatingStars value={rating} onChange={setRating} mode="input" />
 */

import { Star } from "@buleje/design-system/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number; // 0-5
  max?: number;
  count?: number;
  size?: "xs" | "sm" | "md" | "lg";
  mode?: "display" | "input";
  onChange?: (value: number) => void;
  /** Label accesible */
  label?: string;
  className?: string;
}

const SIZES = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

const COUNT_TEXT = {
  xs: "text-[length:var(--ts-2xs)]",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
} as const;

export default function RatingStars({
  value,
  max = 5,
  count,
  size = "md",
  mode = "display",
  onChange,
  label,
  className,
}: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const displayValue = hover ?? value;

  if (mode === "input" && onChange) {
    return (
      <div
        className={cn("inline-flex items-center gap-1", className)}
        role="radiogroup"
        aria-label={label ?? "Calificación"}
      >
        {Array.from({ length: max }).map((_, i) => {
          const starValue = i + 1;
          const filled = starValue <= displayValue;
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={value === starValue}
              aria-label={`${starValue} ${starValue === 1 ? "estrella" : "estrellas"}`}
              onClick={() => onChange(starValue)}
              onMouseEnter={() => setHover(starValue)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(starValue)}
              onBlur={() => setHover(null)}
              className="group p-0.5 -m-0.5 rounded hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1"
            >
              <Star
                className={cn(
                  SIZES[size],
                  filled
                    ? "fill-[var(--accent)] text-[var(--accent)]"
                    : "fill-none text-[var(--rule-base)] group-hover:text-[var(--accent)]",
                )}
                strokeWidth={filled ? 0 : 1.5}
              />
            </button>
          );
        })}
      </div>
    );
  }

  // Display mode
  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      role="img"
      aria-label={label ?? `${value} de ${max} estrellas${count ? `, ${count} reseñas` : ""}`}
    >
      <div className="inline-flex items-center">
        {Array.from({ length: max }).map((_, i) => {
          const starValue = i + 1;
          const diff = displayValue - i;
          if (diff >= 1) {
            return (
              <Star
                key={i}
                className={cn(SIZES[size], "fill-[var(--accent)] text-[var(--accent)]")}
                strokeWidth={0}
                aria-hidden
              />
            );
          }
          if (diff >= 0.5) {
            // Media estrella: usamos 2 Star superpuestos con mask
            return (
              <span key={i} className={cn(SIZES[size], "relative inline-block")} aria-hidden>
                <Star
                  className={cn(SIZES[size], "absolute inset-0 fill-none text-[var(--rule-base)]")}
                  strokeWidth={1.5}
                />
                <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
                  <Star
                    className={cn(SIZES[size], "fill-[var(--accent)] text-[var(--accent)]")}
                    strokeWidth={0}
                  />
                </span>
              </span>
            );
          }
          return (
            <Star
              key={i}
              className={cn(SIZES[size], "fill-none text-[var(--rule-base)]")}
              strokeWidth={1.5}
              aria-hidden
            />
          );
        })}
      </div>
      {count !== undefined && (
        <span className={cn(COUNT_TEXT[size], "text-[var(--text-tertiary)] tabular-nums")}>
          ({count.toLocaleString("es-PE")})
        </span>
      )}
    </div>
  );
}
