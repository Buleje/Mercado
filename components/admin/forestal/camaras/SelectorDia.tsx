"use client";

/**
 * Elegir el día: flechas día anterior / siguiente, el calendario y «Hoy».
 * Lo comparten «Hoy en el patio» y «Personas». No pasa de hoy (Lima).
 */

import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { BTN, moverDia } from "./camaras-ui";

interface Props {
  fecha: string;
  /** «Hoy» en Lima (`limaDateKey()`). */
  hoy: string;
  onCambiar: (fecha: string) => void;
  /** Nombre del calendario para el lector de pantalla. */
  etiqueta: string;
}

export default function SelectorDia({ fecha, hoy, onCambiar, etiqueta }: Props) {
  const esHoy = fecha === hoy;
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Elegir el día">
      <button
        type="button"
        onClick={() => onCambiar(moverDia(fecha, -1))}
        aria-label="Día anterior"
        className={cn(BTN, "w-10 justify-center px-0")}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <input
        type="date"
        value={fecha}
        max={hoy}
        onChange={(e) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onCambiar(e.target.value);
        }}
        aria-label={etiqueta}
        className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <button
        type="button"
        onClick={() => onCambiar(moverDia(fecha, 1))}
        disabled={esHoy}
        aria-label="Día siguiente"
        className={cn(BTN, "w-10 justify-center px-0")}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      {!esHoy && (
        <button type="button" onClick={() => onCambiar(hoy)} className={BTN}>
          Hoy
        </button>
      )}
    </div>
  );
}
