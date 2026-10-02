"use client";

/**
 * Una celda de la tabla de piezas: el interruptor de UNA pieza en UN negocio,
 * el botón de sus opciones y lo que el superadmin debe saber de la fila.
 */
import { AlertTriangle, Loader2, Settings2 } from "@buleje/design-system/icons";
import type { FilaDeLaMatriz } from "@/lib/extensiones/resolver";
import { avisosDeFila } from "./etiquetas";

interface Props {
  fila?: FilaDeLaMatriz;
  pendiente: boolean;
  /** «Hoja de control en Aserradero Don Pepe», para el lector de pantalla. */
  nombre: string;
  onAlternar: () => void;
  onOpciones: () => void;
  /** En la ficha del negocio van en una línea: interruptor, opciones y avisos. */
  enLinea?: boolean;
}

export function CeldaPieza({ fila, pendiente, nombre, onAlternar, onOpciones, enLinea = false }: Props) {
  const prendida = fila?.prendida === true;
  const avisos = fila ? avisosDeFila(fila) : [];

  return (
    <div className={enLinea ? "flex flex-wrap items-center gap-2" : "flex flex-col items-center gap-2 max-sm:flex-row max-sm:flex-wrap max-sm:justify-end"}>
      <button
        type="button"
        role="switch"
        aria-checked={prendida}
        aria-label={`${prendida ? "Apagar" : "Prender"} ${nombre}`}
        disabled={pendiente || fila?.huerfana === true}
        onClick={onAlternar}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          prendida ? "bg-[var(--data-success-500)] hover:bg-[var(--data-success-600)]" : "bg-[var(--rule-base)] hover:bg-[var(--text-tertiary)]"
        }`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-[var(--surface-raised)] shadow transition-transform ${prendida ? "translate-x-6" : "translate-x-1"}`} />
        {pendiente && <Loader2 className="absolute inset-0 m-auto h-4 w-4 animate-spin text-white" aria-hidden />}
      </button>

      <button
        type="button"
        onClick={onOpciones}
        aria-label={`Opciones de ${nombre}`}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      >
        <Settings2 className="h-4 w-4" aria-hidden />
        Opciones
      </button>

      {avisos.map((a) => (
        <span
          key={a.texto}
          title={a.texto}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${
            a.tono === "error"
              ? "bg-[var(--data-error-50)] text-[var(--data-error-700)]"
              : "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]"
          }`}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          {a.tono === "error" ? (fila?.huerfana ? "Ya no existe" : "Opciones inválidas") : "Versión vieja"}
          <span className="sr-only">. {a.texto}</span>
        </span>
      ))}
    </div>
  );
}
