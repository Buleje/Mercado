"use client";

/**
 * PaymentMethodCard — Card individual por método de pago.
 *
 * Se usa en `/checkout/entrega` para mostrar Efectivo / Yape / Plin como
 * 3 cards grandes con identidad visual propia (brandColor del método).
 *
 * Estados:
 *   - selected: border accent + ring accent-soft + checkmark corner
 *   - idle:     border rule-soft + hover accent/40 border
 */

import type { ComponentType } from "react";
import { CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type LucideProps = { className?: string; strokeWidth?: number; "aria-hidden"?: boolean };
type IconComponent = ComponentType<LucideProps>;

export interface PaymentMethodCardProps {
  id: string;
  name: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
  icon: IconComponent;
  /** Color HEX del brand (Yape #8a1bd4, Plin #1f86c7). Si no se pasa, usa el accent. */
  brandColor?: string;
}

export default function PaymentMethodCard({
  id,
  name,
  subtitle,
  selected,
  onSelect,
  icon: Icon,
  brandColor,
}: PaymentMethodCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Seleccionar método de pago: ${name}`}
      data-method={id}
      className={cn(
        "group relative text-left w-full rounded-2xl p-5 sm:p-6 transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2",
        selected
          ? "border-2 border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_6px_24px_-12px_var(--accent)]"
          : "border border-[var(--rule-soft)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40 hover:-translate-y-0.5",
      )}
    >
      {/* Checkmark corner */}
      {selected && (
        <span
          aria-hidden
          className="absolute right-3 top-3 inline-flex items-center justify-center h-6 w-6 rounded-full bg-[var(--accent)] text-white shadow-sm"
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
        </span>
      )}

      {/* Icon circle */}
      <span
        className={cn(
          "inline-flex h-12 w-12 items-center justify-center rounded-full mb-4 transition-colors",
          selected
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] group-hover:bg-[var(--accent-soft)]",
        )}
        style={
          brandColor && !selected
            ? { backgroundColor: `${brandColor}14`, color: brandColor }
            : undefined
        }
        aria-hidden
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>

      <p
        className={cn(
          "text-base font-bold tracking-[-0.01em]",
          selected ? "text-[var(--text-primary)]" : "text-[var(--text-primary)]",
        )}
      >
        {name}
      </p>
      <p className="mt-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-snug">
        {subtitle}
      </p>
    </button>
  );
}
