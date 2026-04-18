/**
 * @buleje/design-system/store — Primitives para la tienda pública (ADR-075 Ola 2).
 *
 * Source-of-truth de badges de producto y display canonico de precios en la
 * tienda publica. Unifica los 4-5 sistemas de badges saturados que existían
 * antes (blue/red/green/amber/orange con distintas paletas por componente) en
 * una sola paleta Buleje teal-first donde el DIFERENCIADOR es la semántica del
 * texto, no colores vibrantes saturados.
 *
 * Uso típico:
 * @example
 *   <ProductBadge intent="popular">Popular</ProductBadge>
 *   <ProductBadge intent="offer">Oferta</ProductBadge>
 *   <ProductPrice price={24.90} previousPrice={29.90} unit="kg" />
 *
 * Regla de armonía:
 * - `popular | fresh | scarcity` → teal soft (accent-soft + accent text)
 * - `offer`                       → warning soft (amber/ochre suave, no rojo 500)
 * - `new`                          → neutral (surface-sunken + border rule-base)
 * - `premium`                      → inverse (text-primary bg / surface-canvas text)
 *
 * NO se usa `bg-red-500`, `bg-green-500`, `bg-amber-500`, `bg-blue-500`, ni sus
 * variantes 400/600/700. La excepción `offer` usa `--data-warning-50/700` que
 * es el ochre suave del design system (calibrado para AA sobre fondo claro).
 */
"use client";

import type { ReactNode } from "react";
import { cn } from "./utils";

// ── ProductBadge ──────────────────────────────────────────────────────────────
export type ProductBadgeIntent =
  | "popular"   // neutral destacado (teal soft)
  | "offer"     // oferta genuina con precio tachado (warning soft)
  | "fresh"     // producto fresco/nuevo (teal soft)
  | "new"       // recien llegado (neutral outlined)
  | "scarcity"  // pocas unidades (teal soft — no rojo alarmista)
  | "premium";  // calidad alta (inverse ink)

export interface ProductBadgeProps {
  intent: ProductBadgeIntent;
  children: ReactNode;
  className?: string;
}

const INTENT_STYLES: Record<ProductBadgeIntent, string> = {
  popular:  "bg-[var(--accent-soft)] text-[var(--accent)]",
  offer:    "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]",
  fresh:    "bg-[var(--accent-soft)] text-[var(--accent)]",
  new:      "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-[var(--rule-base)]",
  scarcity: "bg-[var(--accent-soft)] text-[var(--accent)]",
  premium:  "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
};

export function ProductBadge({ intent, children, className }: ProductBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
        INTENT_STYLES[intent],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── ProductPrice ──────────────────────────────────────────────────────────────
export interface ProductPriceProps {
  /** Precio actual (obligatorio). Se muestra en text-primary bold. */
  price: number;
  /** Precio anterior (opcional). Se muestra tachado en text-tertiary si > price. */
  previousPrice?: number;
  /** Unidad del producto (opcional): "kg", "und", "lt", etc. */
  unit?: string;
  /** Tamaño visual. Default "md". "sm" para rows/list, "lg" para hero. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_PRIMARY: Record<NonNullable<ProductPriceProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base sm:text-lg",
  lg: "text-2xl sm:text-3xl",
};

const SIZE_SECONDARY: Record<NonNullable<ProductPriceProps["size"]>, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
};

/**
 * ProductPrice — display canonico del precio de un producto.
 *
 * Reglas visuales:
 * - Precio actual → `text-primary` bold, tabular-nums (alinea decimales).
 * - Precio anterior (si > actual) → `text-tertiary` line-through, mismo tabular-nums.
 * - Unidad → `text-secondary`, label corto "/ kg".
 *
 * NO usa `text-[var(--accent)]` (teal) para el precio actual. El accent teal se
 * reserva para CTAs y chrome editorial, no para valores monetarios dentro de
 * cards — ahí debe dominar la legibilidad del text-primary.
 */
export function ProductPrice({
  price,
  previousPrice,
  unit,
  size = "md",
  className,
}: ProductPriceProps) {
  const hasDiscount = previousPrice != null && previousPrice > price;

  return (
    <div className={cn("flex items-baseline gap-2 flex-wrap", className)}>
      <span
        className={cn(
          "font-bold tabular-nums text-[var(--text-primary)] leading-none",
          SIZE_PRIMARY[size],
        )}
      >
        S/{price.toFixed(2)}
      </span>
      {hasDiscount && (
        <span
          className={cn(
            "text-[var(--text-tertiary)] line-through tabular-nums leading-none",
            SIZE_SECONDARY[size],
          )}
        >
          S/{previousPrice.toFixed(2)}
        </span>
      )}
      {unit && (
        <span
          className={cn(
            "text-[var(--text-secondary)] leading-none",
            SIZE_SECONDARY[size],
          )}
        >
          / {unit}
        </span>
      )}
    </div>
  );
}
