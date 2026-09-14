"use client";

/**
 * rrhh-form.tsx — la medida única de campos, botones, secciones y avisos del
 * hub de Recursos Humanos (ADR-414).
 *
 * Por qué existe (Brandon 2026-09-14: «los modales están muy apegados y mal
 * distribuidos»). Medido antes del cambio: ningún modal del módulo ponía el
 * relleno del cuerpo (`MODAL_BODY`), así que los campos tocaban el borde
 * (0 px de margen); y cada archivo declaraba su propio `input`/`label` a mano,
 * con cinco alturas distintas (h-8, h-9, h-10, py-1, py-2). Acá vive UNA
 * medida; los modales la combinan con `Field` y `ModalFooter` del panel, igual
 * que los 45 modales del Libro.
 */

import type { ComponentType, ReactNode } from "react";
import { BlockTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";

/** Texto, select y fecha: 44 px de alto (toque cómodo en el celular), foco con el anillo del acento. */
export const CLASE_CAMPO =
  "h-11 w-full min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:opacity-50";

/** `textarea` con la misma piel que el campo. */
export const CLASE_AREA = cn(CLASE_CAMPO, "h-auto min-h-[5.5rem] py-2.5 leading-relaxed");

const BASE_BOTON =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-[filter,background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10";

const BASE_BOTON_CHICO =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

/** Botones del módulo. Pie de modal y barra de herramientas usan los de tamaño normal; filas y fichas, los `chico`. */
export const BOTON = {
  primario: cn(BASE_BOTON, "bg-primary text-white shadow-[var(--shadow-sm)] hover:brightness-110"),
  secundario: cn(BASE_BOTON, "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"),
  fantasma: cn(BASE_BOTON, "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"),
  peligro: cn(BASE_BOTON, "bg-[var(--data-error-700)] text-white shadow-[var(--shadow-sm)] hover:brightness-110"),
  chico: cn(BASE_BOTON_CHICO, "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"),
  chicoPrimario: cn(BASE_BOTON_CHICO, "bg-primary font-bold text-white hover:brightness-110"),
  chicoPeligro: cn(BASE_BOTON_CHICO, "border border-[var(--data-error-500)]/40 bg-[var(--surface-raised)] text-[var(--data-error-700)] hover:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]"),
  chicoFantasma: cn(BASE_BOTON_CHICO, "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"),
  /** Sólo ícono: siempre con `aria-label`. */
  icono: "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40",
} as const;

/** Chip de estado (persona, contrato): legible, nunca `ts-2xs`. */
export const CLASE_CHIP = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold";

/** Chip de filtro (estados, períodos): 36 px, el activo con el acento. */
export function claseChipFiltro(activo: boolean): string {
  return cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
    activo
      ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
  );
}

/**
 * Un bloque de un formulario largo: título con su regla y la grilla de campos.
 * Separa «quién es / contacto / trabajo» en vez de 13 campos seguidos.
 */
export function SeccionForm({
  titulo,
  descripcion,
  children,
  columnas = 2,
  className,
}: {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  columnas?: 1 | 2;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--rule-soft)] pb-2">
        <BlockTitle as="h3">{titulo}</BlockTitle>
        {descripcion && <p className="text-xs text-[var(--text-tertiary)]">{descripcion}</p>}
      </div>
      <div className={cn("grid grid-cols-1 gap-x-4 gap-y-4", columnas === 2 && "sm:grid-cols-2")}>{children}</div>
    </section>
  );
}

const TONO_AVISO = {
  info: "border-[var(--data-info-500)]/30 bg-[var(--data-info-500)]/5 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  aviso: "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/5 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  neutro: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
} as const;

/** Caja de aviso con ícono. El color nunca va solo: siempre lleva texto. */
export function AvisoRrhh({
  tono = "info",
  icono: Icono,
  children,
  accion,
  className,
}: {
  tono?: keyof typeof TONO_AVISO;
  icono?: ComponentType<{ className?: string }>;
  children: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tono === "error" ? "alert" : undefined}
      className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed", TONO_AVISO[tono], className)}
    >
      {Icono && <Icono className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  );
}
