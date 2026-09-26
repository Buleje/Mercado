/**
 * Piezas chicas que comparten las secciones de «Plata de la guía» (ADR-437):
 * el campo, el bloque y cómo se escribe la plata y la fecha. Un solo lugar para
 * que las cuatro secciones no se desalineen en el primer retoque.
 */

import type { ReactNode } from "react";
import { formatCurrency, formatWeekday } from "@/lib/format";
import type { EstadoPago } from "@/lib/forestal/plata-de-guia";

export const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-base tabular-nums text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-50";

export const ROTULO = "mb-1 block text-sm font-bold text-[var(--text-secondary)]";

/** «S/ 12 400,00». */
export const soles = (n: number | null | undefined): string =>
  n == null ? "—" : formatCurrency(n);

/** «jueves 10/09» — la fecha como se dice en el patio. `dia` = `AAAA-MM-DD` o ISO. */
export function diaCorto(dia: string | null | undefined): string {
  if (!dia) return "—";
  const d = dia.slice(0, 10);
  const [, m, dd] = d.split("-");
  return `${formatWeekday(`${d}T00:00:00.000Z`, { largo: true, soloFecha: true })} ${dd}/${m}`;
}

/** Un bloque del modal: título a la izquierda, lo que va arriba a la derecha. */
export function Bloque({
  titulo,
  extra,
  children,
  className = "",
}: {
  titulo: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-[var(--rule-base)] p-3 ${className}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-base font-bold text-[var(--text-primary)]">
          {titulo}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

const TONO_PAGO: Record<EstadoPago, string> = {
  pagada:
    "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)]",
  parcial:
    "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/15 text-[var(--data-warning-ink)]",
  pendiente:
    "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]",
};

export const ESTADO_PAGO_TEXTO: Record<EstadoPago, string> = {
  pagada: "Pagada",
  parcial: "Pago parcial",
  pendiente: "Sin pagar",
};

export function ChipPago({ estado }: { estado: EstadoPago }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-bold ${TONO_PAGO[estado]}`}
    >
      {ESTADO_PAGO_TEXTO[estado]}
    </span>
  );
}

/** Dos botones que se excluyen, como pastillas. `role="radiogroup"` para el lector de pantalla. */
export function Opciones<T extends string>({
  valor,
  opciones,
  onCambio,
  etiqueta,
}: {
  valor: T;
  opciones: readonly { v: T; l: string }[];
  onCambio: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={valor === o.v}
          onClick={() => onCambio(o.v)}
          className={`inline-flex h-11 items-center rounded-xl border-2 px-3 text-sm font-bold transition-colors ${
            valor === o.v
              ? "border-[var(--accent-dark)] bg-[var(--accent-dark)] text-white"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
