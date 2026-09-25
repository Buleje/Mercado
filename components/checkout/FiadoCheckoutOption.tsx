"use client";

import {
  CalendarClock,
  CheckCircle2,
  Wallet,
} from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/utils";

interface Props {
  selected: boolean;
  onSelect: () => void;
  availableCredit: number;
  /** Fecha de vencimiento ya formateada, ej. "15 de junio". */
  dueDateLabel: string;
}

/**
 * Tarjeta de método de pago "Paga el día de pago" (fiado, pago único).
 * Solo se renderiza cuando el cliente es elegible — la decisión la toma el
 * padre con `useFiadoOption`. El backend revalida la elegibilidad al crear
 * la orden (anti-fraude); esta UI es solo el disparador.
 */
export function FiadoCheckoutOption({
  selected,
  onSelect,
  availableCredit,
  dueDateLabel,
}: Props) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-testid="payment-fiado"
      onClick={onSelect}
      className="relative w-full flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all active:scale-[0.99]"
      style={
        selected
          ? {
              borderColor: "var(--color-primary, #00A0A0)",
              background:
                "color-mix(in oklch, var(--color-primary, #00A0A0) 8%, var(--color-card))",
            }
          : {
              borderColor:
                "color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
              background: "var(--color-card)",
            }
      }
    >
      {selected && (
        <span
          className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-white"
          style={{ background: "var(--color-primary, #00A0A0)" }}
          aria-hidden="true"
        >
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )}
      <span
        className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00A0A0) 14%, transparent)",
        }}
      >
        <Wallet
          className="h-6 w-6"
          strokeWidth={2}
          style={{ color: "var(--color-primary-dark, #009690)" }}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className="block text-base font-extrabold"
          style={{ color: "var(--color-primary-dark, #009690)" }}
        >
          Paga el día de pago
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
          <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={2} />
          Vence el {dueDateLabel} · disponible {formatCurrency(availableCredit)}
        </span>
      </span>
    </button>
  );
}
