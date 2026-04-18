"use client";

/**
 * CurrencySwitcher — Toggle PEN/USD compacto.
 *
 * Demo: muestra conversion con rate hardcoded (backend siempre PEN).
 * Sin emojis. Estilo enterprise — 2 letras + separador sutil.
 *
 * ADR-068: tokens CSS only, 0 emojis.
 */

import { useCurrency, type Currency } from "@/contexts/currency-context";
import { cn } from "@buleje/design-system";

const OPTIONS: { value: Currency; label: string }[] = [
  { value: "PEN", label: "S/" },
  { value: "USD", label: "$" },
];

export default function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();

  return (
    <div
      role="group"
      aria-label="Selector de moneda"
      className={cn(
        "inline-flex items-center rounded-lg",
        "border border-[var(--rule-base)] bg-[var(--surface-raised)]",
        "p-0.5 gap-0.5",
      )}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === currency;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setCurrency(opt.value)}
            aria-pressed={active}
            aria-label={`Mostrar precios en ${opt.value}`}
            className={cn(
              "inline-flex items-center justify-center",
              "h-7 min-w-[34px] px-2 rounded-md",
              "text-[length:var(--ts-xs)] font-bold tabular-nums",
              "transition-colors",
              active
                ? "bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
