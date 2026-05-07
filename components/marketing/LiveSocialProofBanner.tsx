"use client";

import { useLiveStats } from "@/hooks/use-live-stats";
import { Store, ShoppingBag, Flame } from "@buleje/design-system/icons";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";

/**
 * LiveSocialProofBanner — datos reales de DB (Cialdini Social Proof).
 *
 * Reglas de autenticidad:
 *   - Si stats.show === false → no renderiza nada
 *   - Solo muestra datos reales (nunca inflar)
 *   - "isHot" (≥2 pedidos última hora) agrega urgencia visible
 *
 * Usar en heros marketplace/tienda debajo del CTA row.
 */
interface Props {
  /** Dark = texto blanco/transparent. Light = texto gris. */
  variant?: "dark" | "light";
  /** Layout — "inline" horizontal, "stacked" vertical en mobile */
  layout?: "inline" | "stacked";
  className?: string;
}

export function LiveSocialProofBanner({
  variant = "dark",
  layout = "inline",
  className,
}: Props) {
  const stats = useLiveStats();

  if (!stats.show) return null;

  const textColor = variant === "dark" ? "text-white/55" : "text-gray-500 dark:text-gray-400";
  const numberColor = variant === "dark" ? "text-white" : "text-gray-900 dark:text-white";
  const dotColor = variant === "dark" ? "bg-emerald-400" : "bg-[var(--data-success-500)]";
  const hotColor = variant === "dark" ? "text-orange-300" : "text-orange-600";

  const separator = <span className="hidden sm:inline text-white/20" aria-hidden>·</span>;

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center gap-x-3 gap-y-1 text-[length:var(--ts-2xs)] tabular-nums",
        layout === "stacked" ? "flex-col sm:flex-row" : "flex-row flex-wrap",
        textColor,
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Actividad en vivo del marketplace"
    >
      {/* Pulse dot "Activos ahora" */}
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-50", dotColor)} />
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", dotColor)} />
        </span>
        <span className="font-bold uppercase tracking-[0.15em]">En vivo</span>
      </span>

      {layout === "inline" && separator}

      {/* Bodegas activas */}
      <span className="inline-flex items-center gap-1.5">
        <Store className="h-3 w-3" strokeWidth={1.75} aria-hidden />
        <NumberFlow value={stats.activeStores} className={cn("font-bold", numberColor)} />
        {stats.activeStores === 1 ? "bodega" : "bodegas"}
      </span>

      {/* Pedidos hoy */}
      {stats.ordersToday > 0 && (
        <>
          {layout === "inline" && separator}
          <span className="inline-flex items-center gap-1.5">
            <ShoppingBag className="h-3 w-3" strokeWidth={1.75} aria-hidden />
            <NumberFlow value={stats.ordersToday} className={cn("font-bold", numberColor)} />
            {stats.ordersToday === 1 ? "pedido hoy" : "pedidos hoy"}
          </span>
        </>
      )}

      {/* Hot signal (≥2 pedidos última hora) — Cialdini escasez social */}
      {stats.isHot && (
        <>
          {layout === "inline" && separator}
          <span className={cn("inline-flex items-center gap-1", hotColor, "font-bold")}>
            <Flame className="h-3 w-3 animate-pulse" strokeWidth={2} aria-hidden />
            <NumberFlow value={stats.ordersLastHour ?? 0} />
            {stats.ordersLastHour === 1 ? " en la última hora" : " en la última hora"}
          </span>
        </>
      )}
    </div>
  );
}
