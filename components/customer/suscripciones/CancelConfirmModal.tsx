"use client";

/**
 * CancelConfirmModal — Confirmacion de cancelacion de suscripcion.
 *
 * Copy amigable tipo bodega vecinal. Muestra lo que el usuario pierde (5 % y
 * el monto estimado anual de ahorros) para que piense dos veces.
 */

import { useEffect } from "react";
import { AlertTriangle, X } from "@buleje/design-system/icons";
import { CardTitle, BodyText, Caption } from "@buleje/design-system";
import {
  FREQUENCY_PER_YEAR,
  type SubscriptionPlan,
} from "@/contexts/subscription-context";
import { cn } from "@/lib/utils";

const fmtMoney = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export interface CancelConfirmModalProps {
  subscription: SubscriptionPlan;
  onClose: () => void;
  onConfirm: () => void;
}

export default function CancelConfirmModal({
  subscription,
  onClose,
  onConfirm,
}: CancelConfirmModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const perDeliverySavings =
    subscription.unitPrice * subscription.quantity * subscription.discount;
  const yearlySavings =
    perDeliverySavings * FREQUENCY_PER_YEAR[subscription.frequency];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        className={cn(
          "relative z-10 w-full max-w-md rounded-xl overflow-hidden",
          "bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-xl",
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-[var(--rule-soft)]">
          <div
            className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--data-warning) 14%, transparent)",
            }}
          >
            <AlertTriangle
              className="h-5 w-5"
              style={{ color: "var(--data-warning)" }}
              aria-hidden
            />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle id="cancel-title">Cancelar suscripcion</CardTitle>
            <Caption className="mt-0.5 text-[var(--text-tertiary)] line-clamp-1">
              {subscription.productName}
            </Caption>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
              "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              "hover:bg-[var(--surface-sunken)] transition-colors",
            )}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <BodyText>
            Seguro que queres cancelar? Perdes el descuento de 5% en este producto.
          </BodyText>

          <div className="rounded-lg bg-[var(--surface-sunken)] p-3 space-y-2">
            <div className="flex justify-between items-baseline">
              <Caption className="text-[var(--text-tertiary)]">
                Ahorro por entrega
              </Caption>
              <span className="text-[length:var(--ts-sm)] font-bold tabular-nums text-[var(--text-primary)]">
                {fmtMoney(perDeliverySavings)}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <Caption className="text-[var(--text-tertiary)]">
                Ahorro anual estimado
              </Caption>
              <span
                className="text-[length:var(--ts-base)] font-extrabold tabular-nums"
                style={{ color: "var(--data-success)" }}
              >
                {fmtMoney(yearlySavings)}
              </span>
            </div>
          </div>

          <BodyText className="text-[var(--text-tertiary)] text-[length:var(--ts-xs)]">
            Tip: si solo queres saltarte una entrega, usa{" "}
            <strong className="text-[var(--text-primary)]">
              &quot;Saltar próxima entrega&quot;
            </strong>{" "}
            en vez de cancelar.
          </BodyText>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 p-4 border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex-1 py-2.5 rounded-lg font-semibold text-[length:var(--ts-sm)]",
              "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90 transition-opacity",
            )}
          >
            Mantener suscripcion
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "flex-1 py-2.5 rounded-lg font-semibold text-[length:var(--ts-sm)]",
              "border transition-colors",
            )}
            style={{
              color: "var(--data-error)",
              borderColor: "var(--data-error)",
            }}
          >
            Si, cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
