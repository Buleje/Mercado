"use client";

/**
 * Piezas chicas que comparten los bloques del alta de adelanto (ADR-448): la
 * tarjeta de cada bloque, la opción elegible y el chip que dice si la plata
 * sale o entra a la caja. Una sola medida para los cinco bloques.
 */

import { ArrowDownToLine, ArrowUpFromLine, Ban, CheckCircle2, Circle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/** La tarjeta blanca de un bloque, sobre el cuerpo hundido del modal. */
export const CLASE_BLOQUE =
  "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-sm)] sm:p-5";

/**
 * Una opción que se elige (quién pone la plata, cómo se devuelve, a qué
 * adelanto va). Borde de 2 px: el elegido se lee por el color de marca y el
 * relleno, no por un gris apenas distinto.
 */
export function claseOpcion(activa: boolean, disponible = true, disposicion = "flex w-full items-start gap-3"): string {
  return cn(
    disposicion,
    "rounded-xl border-2 p-3.5 text-left transition-[border-color,background-color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-raised)]",
    !disponible
      ? "cursor-not-allowed border-[var(--rule-soft)] opacity-50"
      : activa
        ? "border-primary bg-primary/8"
        : "border-[var(--rule-base)] hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-md)]",
  );
}

export function MarcaSeleccion({ activa }: { activa: boolean }) {
  return activa ? (
    <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--accent-ink)]" aria-hidden />
  ) : (
    <Circle className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
  );
}

const CHIP_CAJA = {
  egreso: { texto: "Sale de tu caja", Icono: ArrowUpFromLine, cls: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-ink)]" },
  ingreso: { texto: "Entra a tu caja", Icono: ArrowDownToLine, cls: "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]" },
  nada: { texto: "No mueve la caja", Icono: Ban, cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
} as const;

/** «Sale de tu caja» / «Entra a tu caja»: lo que el modal viejo no decía en ninguna parte. */
export function ChipCaja({ tipo, className }: { tipo: keyof typeof CHIP_CAJA; className?: string }) {
  const c = CHIP_CAJA[tipo];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-bold", c.cls, className)}>
      <c.Icono className="h-4 w-4 shrink-0" aria-hidden />
      {c.texto}
    </span>
  );
}
