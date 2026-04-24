"use client";

/**
 * QuantityStepper — Control +/- con input numerico accesible.
 *
 * Uso en PDP, carrito, admin. Respeta min/max/step. Autoresetea a min
 * si el user borra el input (no queda 0 o NaN).
 *
 * A11y: spinbutton role, aria-valuenow/min/max, arrow keys up/down.
 *
 * Uso:
 *   <QuantityStepper value={qty} onChange={setQty} min={1} max={stock} />
 */

import { Minus, Plus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Tamaño. Default "md" */
  size?: "sm" | "md" | "lg";
  /** Deshabilitar */
  disabled?: boolean;
  /** Etiqueta accesible */
  label?: string;
  /** Unidad (ej "kg"). Default vacio */
  unit?: string;
  className?: string;
}

const SIZE_CLASSES = {
  sm: { btn: "h-7 w-7", input: "h-7 w-10 text-xs", iconSize: "h-3 w-3" },
  md: { btn: "h-9 w-9", input: "h-9 w-12 text-sm", iconSize: "h-3.5 w-3.5" },
  lg: { btn: "h-11 w-11", input: "h-11 w-14 text-base", iconSize: "h-4 w-4" },
};

export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  step = 1,
  size = "md",
  disabled,
  label = "Cantidad",
  unit,
  className,
}: Props) {
  const cls = SIZE_CLASSES[size];

  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && value < max;

  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  const decrement = () => onChange(clamp(value - step));
  const increment = () => onChange(clamp(value + step));

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(clamp(parsed));
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      increment();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrement();
    }
  };

  return (
    <div
      role="spinbutton"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <button
        type="button"
        onClick={decrement}
        disabled={!canDecrement}
        aria-label="Disminuir"
        className={cn(
          "inline-flex items-center justify-center text-[var(--text-primary)] transition-colors",
          cls.btn,
          canDecrement
            ? "hover:bg-[var(--surface-sunken)] active:scale-95"
            : "opacity-40 cursor-not-allowed",
        )}
      >
        <Minus className={cls.iconSize} strokeWidth={2.5} aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={handleInput}
        onKeyDown={handleKey}
        onBlur={() => {
          // si quedo vacio o fuera de rango, resetear
          if (!Number.isFinite(value) || value < min) onChange(min);
        }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        className={cn(
          "text-center tabular-nums font-bold text-[var(--text-primary)] bg-transparent outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          cls.input,
        )}
      />
      <button
        type="button"
        onClick={increment}
        disabled={!canIncrement}
        aria-label="Aumentar"
        className={cn(
          "inline-flex items-center justify-center text-[var(--text-primary)] transition-colors",
          cls.btn,
          canIncrement
            ? "hover:bg-[var(--surface-sunken)] active:scale-95"
            : "opacity-40 cursor-not-allowed",
        )}
      >
        <Plus className={cls.iconSize} strokeWidth={2.5} aria-hidden />
      </button>
      {unit && (
        <span className="px-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] border-l border-[var(--rule-base)]">
          {unit}
        </span>
      )}
    </div>
  );
}
