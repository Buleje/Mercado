"use client";

import { useMemo } from "react";
import { Truck, CheckCircle2 } from "@buleje/design-system/icons";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

export const FREE_SHIPPING_THRESHOLD = 50;

/**
 * Hook compartido por el bar full y el indicator compacto.
 */
export function useFreeShippingStatus() {
  const { items } = useMarketplaceCart();
  return useMemo(() => {
    const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    const remaining = Math.max(FREE_SHIPPING_THRESHOLD - subtotal, 0);
    const progress = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
    return {
      subtotal,
      remaining,
      progress,
      unlocked: subtotal >= FREE_SHIPPING_THRESHOLD,
      hasItems: items.length > 0,
    };
  }, [items]);
}

/**
 * Indicador compacto — pensado para vivir dentro de la nav secundaria.
 * No es sticky, no tapa nada. 1 linea: icono + copy + progreso.
 */
export function FreeShippingIndicator({ className }: { className?: string }) {
  const { subtotal, remaining, progress, unlocked, hasItems } =
    useFreeShippingStatus();

  if (!hasItems) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        unlocked
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
        className,
      )}
    >
      {unlocked ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Truck
          className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
          aria-hidden="true"
        />
      )}
      <span className="whitespace-nowrap">
        {unlocked ? (
          "Envio gratis desbloqueado"
        ) : (
          <>
            Faltan{" "}
            <strong className="tabular-nums text-[var(--text-primary)]">
              <NumberFlow
                value={remaining}
                format={{
                  style: "currency",
                  currency: "PEN",
                  minimumFractionDigits: 2,
                }}
                locales="es-PE"
              />
            </strong>{" "}
            para envio gratis
          </>
        )}
      </span>
      {/* Progress mini */}
      <span
        className="ml-1 hidden sm:block h-1 w-20 rounded-full bg-[var(--rule-soft)] overflow-hidden"
        aria-hidden="true"
      >
        <span
          className={cn(
            "block h-full transition-all duration-500 rounded-full",
            unlocked
              ? "bg-linear-to-r from-emerald-400 to-emerald-600"
              : "bg-linear-to-r from-[var(--accent)]/60 to-[var(--accent)]",
          )}
          style={{ width: `${progress}%` }}
        />
      </span>
      <span className="sr-only">
        Subtotal actual:{" "}
        <NumberFlow
          value={subtotal}
          format={{
            style: "currency",
            currency: "PEN",
            minimumFractionDigits: 2,
          }}
          locales="es-PE"
        />{" "}
        de S/{FREE_SHIPPING_THRESHOLD}
      </span>
    </div>
  );
}

/**
 * @deprecated — el bar sticky se tapaba con la nav secundaria.
 * Retornamos null y dejamos la UI en el indicador compacto de la nav.
 * Se mantiene el export para no romper importadores existentes.
 */
export default function MarketplaceFreeShippingBar() {
  return null;
}
