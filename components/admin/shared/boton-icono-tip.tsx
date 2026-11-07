"use client";

/**
 * BotonIconoTip — botón de sólo ícono con su texto al pasar el mouse.
 *
 * La ley de Brandon (2026-10-01, «íconos donde al pasar se vea el texto»): en
 * filas que se repiten, el texto de cada acción multiplica el ruido (10 filas ×
 * 4 botones = 40 palabras). El ícono queda a la vista; el nombre sale en el
 * tooltip (hover y foco) y SIEMPRE está en `aria-label` para el lector de
 * pantalla y el control por voz.
 *
 * Un botón `disabled` no recibe hover, así que su tooltip (que suele ser el
 * MOTIVO — «sin teléfono») va en un `<span>` que sí lo recibe; el motivo
 * además queda en el `aria-label` del botón.
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { AdminTooltip } from "./AdminTooltip";

type Tono = "neutro" | "acento" | "peligro";

const TONO: Record<Tono, string> = {
  neutro: "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
  acento: "text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]",
  peligro:
    "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]",
};

export interface BotonIconoTipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  /** Qué hace. Va en el tooltip Y en `aria-label`. */
  label: string;
  icon: LucideIcon;
  /** Texto del tooltip si conviene distinto al `label` (p. ej. el motivo de estar apagado). */
  tip?: ReactNode;
  tono?: Tono;
  /** 36 px por defecto; 32 px dentro de filas densas. */
  tamano?: "sm" | "md";
  /** Ícono latiendo mientras trabaja. */
  cargando?: boolean;
}

const BotonIconoTip = forwardRef<HTMLButtonElement, BotonIconoTipProps>(function BotonIconoTip(
  { label, icon: Icono, tip, tono = "neutro", tamano = "md", cargando = false, disabled, className, type = "button", ...rest },
  ref,
) {
  const boton = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tamano === "sm" ? "h-8 w-8" : "h-9 w-9",
        TONO[tono],
        className,
      )}
      {...rest}
    >
      <Icono className={cn("h-4 w-4", cargando && "animate-pulse")} aria-hidden />
    </button>
  );
  return (
    <AdminTooltip content={tip ?? label}>{disabled ? <span className="inline-flex">{boton}</span> : boton}</AdminTooltip>
  );
});

export default BotonIconoTip;
