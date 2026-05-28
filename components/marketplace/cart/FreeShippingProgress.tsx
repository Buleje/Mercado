"use client";

/**
 * FreeShippingProgress — barra de progreso hacia delivery gratis.
 * Vive en /marketplace/carrito, encima del listado de items.
 *
 * Reutiliza useFreeShippingStatus() de MarketplaceFreeShippingBar.tsx
 * (hook ya exportado, lógica validada). La visualización es distinta:
 * barra full-width prominente, no el indicador compacto de la nav.
 */

import { useMemo } from "react";
import { Truck, CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

export const UMBRAL_ENVIO_GRATIS = 50;

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function FreeShippingProgress({ className }: { className?: string }) {
  const { items } = useMarketplaceCart();

  const { remaining, progress, unlocked } = useMemo(() => {
    const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    const remaining = Math.max(UMBRAL_ENVIO_GRATIS - subtotal, 0);
    const progress = Math.min(100, (subtotal / UMBRAL_ENVIO_GRATIS) * 100);
    return { remaining, progress, unlocked: subtotal >= UMBRAL_ENVIO_GRATIS };
  }, [items]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={
        unlocked
          ? "Tenés delivery gratis en tu pedido"
          : `Te faltan ${fmt(remaining)} para delivery gratis`
      }
      className={cn(
        "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-5 py-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
            unlocked
              ? "border-[var(--data-success-200,#bbf7d0)] bg-[var(--data-success-50,#f0fdf4)] text-[var(--data-success-600,#16a34a)]"
              : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--accent)]",
          )}
        >
          {unlocked ? (
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          ) : (
            <Truck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          )}
        </span>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-[length:var(--ts-sm)] font-semibold leading-snug",
              unlocked
                ? "text-[var(--data-success-700,#15803d)]"
                : "text-[var(--text-primary)]",
            )}
          >
            {unlocked ? (
              "¡Tenés delivery gratis!"
            ) : (
              <>
                Te faltan{" "}
                <strong className="font-black text-[var(--accent)] tabular-nums">
                  {fmt(remaining)}
                </strong>{" "}
                para delivery gratis
              </>
            )}
          </p>

          {/* Barra de progreso */}
          <div
            className="mt-2 h-2 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden"
            aria-hidden="true"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                unlocked
                  ? "bg-[var(--data-success-500,#22c55e)]"
                  : "bg-[var(--accent)]",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {!unlocked && (
          <p
            className="shrink-0 text-[length:var(--ts-xs)] font-bold tabular-nums text-[var(--text-tertiary)]"
            aria-hidden="true"
          >
            {Math.round(progress)}%
          </p>
        )}
      </div>
    </div>
  );
}
