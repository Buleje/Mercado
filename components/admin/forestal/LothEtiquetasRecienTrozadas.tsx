"use client";

/**
 * LothEtiquetasRecienTrozadas — el aviso que falta al GUARDAR un trozado.
 *
 * Brandon (2026-09-28): «Imprimir etiquetas» sólo vivía en la tabla (selección
 * en bloque) o en el detalle de una línea — al guardar un trozado (uno de a
 * uno, "Guardar y otro" del formulario, el múltiple de un árbol, o el que
 * sigue a "Trozar estos árboles" después de la tala en tanda) había que volver
 * a la tabla y marcar las trozas a mano. Este aviso queda PEGADO (no un toast
 * de 3 s: en Blas se guardaron 2 trozados hoy y el toast ya se había ido para
 * cuando el operario quiso imprimir) hasta que la persona toca «Listo».
 *
 * Reusa `imprimirEtiquetasTrozasLoth` (vía el `onImprimir` que arma
 * `LothLibroOperaciones`, el mismo camino que la selección en tabla y el
 * detalle de línea — ADR-436): mismo formato, mismo lector.
 */

import { Printer } from "@buleje/design-system/icons";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

interface Props {
  /** Las trozas recién asentadas — N sale de acá, no de un contador aparte. */
  trozas: readonly LothEntryDTO[];
  imprimiendo: boolean;
  onImprimir: () => void;
  onCerrar: () => void;
}

export default function LothEtiquetasRecienTrozadas({ trozas, imprimiendo, onImprimir, onCerrar }: Props) {
  const n = trozas.length;
  if (n === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 px-4 py-3"
    >
      <Printer className="h-5 w-5 shrink-0 text-[var(--data-success-ink)]" aria-hidden="true" />
      <span className="min-w-0 grow basis-56 text-sm font-semibold text-[var(--text-primary)]">
        Guardaste {plural(n, "esta troza", "estas trozas")}. Sus etiquetas no se imprimieron todavía.
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onImprimir}
          disabled={imprimiendo}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          {imprimiendo ? "Generando…" : n === 1 ? "Imprimir la etiqueta" : `Imprimir las ${n} etiquetas`}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          className="inline-flex h-10 items-center rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
        >
          Listo
        </button>
      </span>
    </div>
  );
}
