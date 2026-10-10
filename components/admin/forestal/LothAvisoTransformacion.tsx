"use client";

/**
 * Aviso de las secciones 4-6 del LO-TH (consumo de trozas, producto terminado y
 * despacho de producto terminado).
 *
 * Son secciones del formato oficial (RDE 264-2019) y se quedan: sirven para la
 * madera que se transforma DENTRO del título habilitante. Pero medido el
 * 28-09, en todos los negocios las únicas líneas que tienen son de prueba o de
 * demo: la madera real va a una planta, y ese movimiento se asienta en el
 * Libro CTP. Cargarlo acá también es la misma madera en dos libros.
 *
 * La casilla no es un «acepto»: es la pregunta que decide en qué libro va la
 * línea, y sin contestarla no se guarda.
 */

import { useId } from "react";
import { ArrowRight, Warehouse } from "@buleje/design-system/icons";

export default function LothAvisoTransformacion({
  confirmado,
  onConfirmado,
  onIrAlCtp,
}: {
  confirmado: boolean;
  onConfirmado: (v: boolean) => void;
  /** Sin esta prop no hay a dónde mandar: el botón no se muestra. */
  onIrAlCtp?: () => void;
}) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={`${id}-titulo`}
      className="space-y-1.5 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p
          id={`${id}-titulo`}
          className="flex min-w-0 flex-1 items-start gap-2 text-sm font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
        >
          <Warehouse className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>¿La madera va a una planta? Entonces esto se registra en el Libro CTP, no acá.</span>
        </p>
        {onIrAlCtp && (
          <button
            type="button"
            onClick={onIrAlCtp}
            className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
          >
            Ir al Libro CTP
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(e) => onConfirmado(e.target.checked)}
          aria-required="true"
          className="h-4 w-4 shrink-0 accent-[var(--accent-dark)]"
        />
        La transformé dentro del título habilitante
        <span className="text-[var(--data-error-600)]" aria-hidden="true">
          *
        </span>
      </label>
    </div>
  );
}
