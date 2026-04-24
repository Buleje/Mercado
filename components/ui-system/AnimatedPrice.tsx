"use client";

/**
 * AnimatedPrice — Precio con animacion de digitos al cambiar.
 *
 * Usa @number-flow/react que ya está instalado en el proyecto (ver
 * package.json). Útil en:
 *   - Total del carrito al agregar/remover
 *   - Precio final del PDP al cambiar qty
 *   - Counters en dashboard bodeguero
 *
 * Props:
 *   value: number
 *   currency: default PEN
 *   size: "sm" | "md" | "lg" | "xl"
 *   subtle: si true, animacion mas suave
 */

import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  currency?: string;
  /** Tamaño visual. Default "md" */
  size?: "sm" | "md" | "lg" | "xl";
  /** true = animacion suave sin overshoot. Default false (spring) */
  subtle?: boolean;
  className?: string;
  /** Override del simbolo (default S/ para PEN) */
  locale?: string;
}

const SIZE_CLASSES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl",
  xl: "text-[clamp(2rem,4vw,3rem)]",
} as const;

export default function AnimatedPrice({
  value,
  currency = "PEN",
  size = "md",
  subtle = false,
  className,
  locale = "es-PE",
}: Props) {
  return (
    <span
      className={cn(
        "font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]",
        SIZE_CLASSES[size],
        className,
      )}
    >
      <NumberFlow
        value={value}
        format={{
          style: "currency",
          currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }}
        locales={locale}
        spinTiming={subtle ? { duration: 400, easing: "ease-out" } : undefined}
      />
    </span>
  );
}

/** Version sin currency, solo numero (para counters tipo "12 productos") */
export function AnimatedNumber({
  value,
  size = "md",
  suffix,
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg" | "xl";
  suffix?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]",
        SIZE_CLASSES[size],
        className,
      )}
    >
      <NumberFlow value={value} locales="es-PE" />
      {suffix && <span className="text-[var(--text-tertiary)] font-normal">{suffix}</span>}
    </span>
  );
}
