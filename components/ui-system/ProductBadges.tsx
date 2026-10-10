"use client";

/**
 * ProductBadges — Coleccion de badges para cards de producto.
 *
 * Un solo archivo con todos los badges comunes, tokenizados, consistentes:
 *   - <DiscountBadge percent={15} />
 *   - <NewBadge />
 *   - <BestSellerBadge />
 *   - <LocalBadge />
 *   - <OrganicBadge />
 *   - <FreeShippingBadge />
 *   - <ExclusiveBadge />
 *   - <PreOrderBadge />
 *   - <LimitedStockBadge count={3} />
 *
 * Patron: badge = pill pequena, icon opcional, color de categoria.
 */

import { Sparkles, TrendingUp, MapPin, Leaf, Truck, Star, Clock, Flame } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface BaseBadgeProps {
  className?: string;
  size?: "xs" | "sm";
}

const SIZE = {
  xs: "h-5 px-1.5 text-[length:var(--ts-2xs)]",
  sm: "h-6 px-2 text-xs",
};

const ICON_SIZE = {
  xs: "h-2.5 w-2.5",
  sm: "h-3 w-3",
};

function BadgeShell({
  children,
  tone,
  className,
  size = "xs",
}: {
  children: React.ReactNode;
  tone: "accent" | "warning" | "error" | "neutral" | "info";
  className?: string;
  size?: "xs" | "sm";
}) {
  const toneClass =
    tone === "accent"
      ? "bg-[var(--accent)] text-[var(--surface-canvas)]"
      : tone === "warning"
      ? "bg-[var(--data-warning,_#eab308)] text-white"
      : tone === "error"
      ? "bg-[var(--data-error,_#e11d48)] text-white"
      : tone === "info"
      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide whitespace-nowrap",
        SIZE[size],
        toneClass,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DiscountBadge({ percent, size, className }: { percent: number } & BaseBadgeProps) {
  return (
    <BadgeShell tone="error" size={size} className={className}>
      -{percent}%
    </BadgeShell>
  );
}

export function NewBadge({ size, className, label = "Nuevo" }: BaseBadgeProps & { label?: string }) {
  return (
    <BadgeShell tone="accent" size={size} className={className}>
      <Sparkles className={ICON_SIZE[size ?? "xs"]} strokeWidth={2.5} aria-hidden />
      {label}
    </BadgeShell>
  );
}

export function BestSellerBadge({ size, className }: BaseBadgeProps) {
  return (
    <BadgeShell tone="warning" size={size} className={className}>
      <TrendingUp className={ICON_SIZE[size ?? "xs"]} strokeWidth={2.5} aria-hidden />
      Top ventas
    </BadgeShell>
  );
}

export function LocalBadge({ size, className, location }: BaseBadgeProps & { location?: string }) {
  return (
    <BadgeShell tone="info" size={size} className={className}>
      <MapPin className={ICON_SIZE[size ?? "xs"]} strokeWidth={2.5} aria-hidden />
      {location ?? "Local"}
    </BadgeShell>
  );
}

export function OrganicBadge({ size, className }: BaseBadgeProps) {
  return (
    <BadgeShell tone="info" size={size} className={className}>
      <Leaf className={ICON_SIZE[size ?? "xs"]} strokeWidth={2.5} aria-hidden />
      Orgánico
    </BadgeShell>
  );
}

export function FreeShippingBadge({ size, className }: BaseBadgeProps) {
  return (
    <BadgeShell tone="info" size={size} className={className}>
      <Truck className={ICON_SIZE[size ?? "xs"]} strokeWidth={2.5} aria-hidden />
      Envío gratis
    </BadgeShell>
  );
}

export function ExclusiveBadge({ size, className }: BaseBadgeProps) {
  return (
    <BadgeShell tone="warning" size={size} className={className}>
      <Star className={ICON_SIZE[size ?? "xs"]} strokeWidth={2.5} aria-hidden />
      Exclusivo
    </BadgeShell>
  );
}

export function PreOrderBadge({ size, className, days }: BaseBadgeProps & { days?: number }) {
  return (
    <BadgeShell tone="neutral" size={size} className={className}>
      <Clock className={ICON_SIZE[size ?? "xs"]} strokeWidth={2.5} aria-hidden />
      {days ? `Llega en ${days}d` : "Pre-venta"}
    </BadgeShell>
  );
}

export function LimitedStockBadge({ count, size, className }: BaseBadgeProps & { count: number }) {
  const hot = count <= 3;
  return (
    <BadgeShell tone={hot ? "error" : "warning"} size={size} className={className}>
      {hot && <Flame className={ICON_SIZE[size ?? "xs"]} strokeWidth={2.5} aria-hidden />}
      {hot ? `Quedan ${count}` : `Stock: ${count}`}
    </BadgeShell>
  );
}
