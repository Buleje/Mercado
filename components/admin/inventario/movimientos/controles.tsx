"use client";

/**
 * Los controles de la fila de filtros (48 px, texto de 14 px) que comparten
 * Movimientos, Pérdidas y Vencimientos, y el aviso de error con «Reintentar».
 */
import { AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/** Para `FiltroColumnaMulti` en la fila (no en la cabecera de la tabla). */
export const FILTRO_EN_FILA = "mt-0! min-w-0 flex-1 sm:flex-none [&_summary]:h-12 [&_summary]:rounded-xl [&_summary]:text-sm";

/** Chips de un solo valor (período, estado): un grupo de botones con `aria-pressed`. */
export function Chips<T extends string>({ opciones, valor, onCambiar, etiqueta }: {
  opciones: readonly { v: T; label: string; cuenta?: number }[];
  valor: T;
  onCambiar: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex h-12 max-w-full items-center overflow-x-auto rounded-xl bg-[var(--surface-sunken)]">
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={valor === o.v}
          onClick={() => onCambiar(o.v)}
          className={cn(
            "inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-colors",
            valor === o.v
              ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-inset ring-[var(--rule-base)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          {o.label}
          {o.cuenta != null && <span className="tabular-nums text-[var(--text-secondary)]">{o.cuenta}</span>}
        </button>
      ))}
    </div>
  );
}

export function AvisoDeError({ que, error, onReintentar }: { que: string; error: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 dark:bg-[var(--data-error-500)]/10">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-error-500)]" aria-hidden />
      <span className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">No se pudieron cargar {que}: {error}</span>
      <button type="button" onClick={onReintentar} className="ml-auto min-h-12 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]">
        Reintentar
      </button>
    </div>
  );
}
