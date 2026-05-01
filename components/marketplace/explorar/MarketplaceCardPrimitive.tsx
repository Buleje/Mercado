"use client";

/**
 * MarketplaceCardPrimitive — base Card component del marketplace.
 *
 * Componente primitivo reutilizable que establece tipografía, spacing,
 * hover, borders y tone de manera consistente. Los cards específicos
 * (Product, Category, Story) heredan vía composición:
 *
 *   <MarketplaceCard tone="raised" interactive>
 *     <MarketplaceCardMedia aspectRatio="4/3">...</MarketplaceCardMedia>
 *     <MarketplaceCardBody>
 *       <MarketplaceCardKicker>...</MarketplaceCardKicker>
 *       <MarketplaceCardTitle>...</MarketplaceCardTitle>
 *       <MarketplaceCardPrice amount={...} />
 *       <MarketplaceCardMeta>...</MarketplaceCardMeta>
 *     </MarketplaceCardBody>
 *   </MarketplaceCard>
 *
 * Jerarquía tipográfica:
 *  - Kicker  : text-[length:var(--ts-xs)] uppercase letter-spacing tracking-wider
 *  - Title   : text-base / lg / xl según size · font-bold · tight tracking
 *  - Price   : text-xl / 2xl · font-black · tabular-nums · color accent
 *  - Meta    : text-xs · color text-tertiary
 *
 * Fixes del problema "texto muy chiquito":
 *  - Usa text-base como mínimo (no text-[length:var(--ts-2xs)])
 *  - Contraste garantizado vía tokens
 *  - Spacing generoso (gap-1.5 vertical mín)
 */

import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

type CardTone = "canvas" | "raised" | "sunken";
type CardSize = "sm" | "md" | "lg";

interface MarketplaceCardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  size?: CardSize;
  interactive?: boolean;
  elevated?: boolean;
  children: ReactNode;
}

const toneMap: Record<CardTone, string> = {
  canvas: "bg-[var(--surface-canvas)]",
  raised: "bg-[var(--surface-raised)]",
  sunken: "bg-[var(--surface-sunken)]",
};

const paddingMap: Record<CardSize, string> = {
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
};

export function MarketplaceCard({
  tone = "raised",
  size = "md",
  interactive = false,
  elevated = false,
  className,
  children,
  ...rest
}: MarketplaceCardProps) {
  return (
    <div
      className={cn(
        "group/card rounded-xl border border-[var(--rule-soft)] transition-all duration-300",
        toneMap[tone],
        paddingMap[size],
        interactive &&
          "cursor-pointer hover:border-[var(--accent)]/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40 motion-reduce:hover:translate-y-0",
        elevated && "shadow-md shadow-black/5 dark:shadow-black/40",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Media: wraps images/illustrations with fixed aspect ratio */
type AspectRatio = "1/1" | "4/3" | "3/2" | "16/9" | "3/4";

const aspectMap: Record<AspectRatio, string> = {
  "1/1": "aspect-square",
  "4/3": "aspect-[4/3]",
  "3/2": "aspect-[3/2]",
  "16/9": "aspect-video",
  "3/4": "aspect-[3/4]",
};

export function MarketplaceCardMedia({
  aspectRatio = "1/1",
  rounded = true,
  className,
  children,
}: {
  aspectRatio?: AspectRatio;
  rounded?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]",
        aspectMap[aspectRatio],
        rounded && "rounded-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Body: container vertical con spacing correcto entre hijos */
export function MarketplaceCardBody({
  className,
  children,
  gap = "tight",
}: {
  className?: string;
  children: ReactNode;
  gap?: "tight" | "normal" | "loose";
}) {
  const gapCls = gap === "loose" ? "gap-3" : gap === "normal" ? "gap-2" : "gap-1.5";
  return <div className={cn("flex flex-col", gapCls, className)}>{children}</div>;
}

/** Kicker: label pequeño uppercase sobre el título (categoría, brand, etc.) */
export function MarketplaceCardKicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)] leading-none",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Title: nombre del producto/categoría con tamaño según size */
export function MarketplaceCardTitle({
  children,
  className,
  size = "md",
  clamp = 2,
  interactive = true,
}: {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  clamp?: 1 | 2 | 3;
  interactive?: boolean;
}) {
  const sizeCls =
    size === "xl"
      ? "text-xl sm:text-2xl"
      : size === "lg"
        ? "text-lg sm:text-xl"
        : size === "sm"
          ? "text-sm"
          : "text-base";
  const clampCls = clamp === 1 ? "line-clamp-1" : clamp === 3 ? "line-clamp-3" : "line-clamp-2";
  return (
    <h3
      className={cn(
        "font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-snug",
        sizeCls,
        clampCls,
        interactive && "group-hover/card:text-[var(--accent)] transition-colors",
        className,
      )}
    >
      {children}
    </h3>
  );
}

/** Price: precio prominente con opción de "antes" tachado */
interface PriceProps {
  amount: number;
  before?: number;
  currency?: string;
  size?: "md" | "lg" | "xl";
  className?: string;
}

export function MarketplaceCardPrice({
  amount,
  before,
  currency = "S/",
  size = "lg",
  className,
}: PriceProps) {
  const sizeCls =
    size === "xl" ? "text-2xl sm:text-3xl" : size === "lg" ? "text-xl sm:text-2xl" : "text-lg";
  const savings = before && before > amount ? before - amount : 0;
  const discountPct = before && before > amount ? Math.round(((before - amount) / before) * 100) : 0;
  const fmt = (v: number) =>
    `${currency} ${v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className={cn("flex flex-col", className)}>
      {before && before > amount && (
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-[var(--text-tertiary)] line-through tabular-nums">
            {fmt(before)}
          </span>
          {discountPct > 0 && (
            <span className="inline-flex items-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)] px-1.5 py-0.5 text-[length:var(--ts-xs)] font-bold tabular-nums">
              −{discountPct}%
            </span>
          )}
        </div>
      )}
      <p
        className={cn(
          "font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight",
          sizeCls,
        )}
      >
        {fmt(amount)}
      </p>
      {savings > 0 && (
        <p className="text-[length:var(--ts-xs)] font-bold text-[var(--data-success)] tabular-nums">
          Ahorrás {fmt(savings)}
        </p>
      )}
    </div>
  );
}

/** Meta: info secundaria (rating, stock, tienda, etc.) */
export function MarketplaceCardMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-[var(--text-tertiary)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Badge: chip pequeño con tone (usado para descuento, stock, novedad) */
type BadgeTone = "accent" | "warning" | "success" | "info" | "neutral";

export function MarketplaceCardBadge({
  children,
  tone = "accent",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  const toneCls =
    tone === "warning"
      ? "bg-[var(--data-warning-50)] text-[var(--data-warning)] border-[var(--data-warning)]/30"
      : tone === "success"
        ? "bg-[var(--accent-soft)] text-[var(--data-success)] border-[var(--data-success)]/30"
        : tone === "info"
          ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--rule-base)]"
          : tone === "neutral"
            ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] border-[var(--rule-soft)]"
            : "bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/30";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[length:var(--ts-xs)] font-bold tabular-nums leading-none whitespace-nowrap",
        toneCls,
        className,
      )}
    >
      {children}
    </span>
  );
}
