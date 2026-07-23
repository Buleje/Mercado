"use client";

/**
 * BarraEstado — el resumen de la selección, abajo del todo.
 *
 * Es el gesto más barato de una planilla: seleccionás una columna de importes
 * y ves el total sin escribir una fórmula ni tocar nada. Excel lo tiene ahí
 * desde siempre y es lo primero que se extraña cuando falta.
 *
 * Sólo aparece lo que tiene sentido: si la selección no tiene números, no se
 * muestran suma ni promedio (mostrar "Suma: 0" sobre una columna de nombres
 * es ruido que además confunde).
 */

import { Minus, Plus } from "@buleje/design-system/icons";
import type { Resumen } from "@/lib/documentos/hoja-analisis";

/** Números legibles: miles separados y como mucho dos decimales. */
function fmt(n: number): string {
  return n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

export default function BarraEstado({
  resumen, etiqueta, filtradas, hojas, hojaActual, zoom, onZoom,
}: {
  resumen: Resumen;
  /** Rango seleccionado, ej. "B2:B40". */
  etiqueta: string;
  /** Cuántas filas esconde el filtro activo. */
  filtradas: number;
  hojas: number;
  hojaActual: string;
  /** Escala de la vista (1 = 100%). */
  zoom: number;
  /** `delta` suma o resta escala; `null` vuelve al 100%. */
  onZoom: (delta: number | null) => void;
}) {
  const hayNumeros = resumen.numericas > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
      <span className="font-bold text-[var(--text-primary)]">{hojaActual}</span>
      {hojas > 1 && <span className="text-[var(--text-tertiary)]">{hojas} hojas</span>}

      <span className="text-[var(--text-tertiary)]">{etiqueta}</span>

      {resumen.celdas > 1 && (
        <Dato titulo="Celdas con datos" valor={`${resumen.conDatos} de ${resumen.celdas}`} />
      )}

      {hayNumeros && (
        <>
          <Dato titulo="Suma" valor={fmt(resumen.suma)} destacado />
          <Dato titulo="Promedio" valor={fmt(resumen.promedio)} />
          <Dato titulo="Mín" valor={fmt(resumen.minimo)} />
          <Dato titulo="Máx" valor={fmt(resumen.maximo)} />
          <Dato titulo="Números" valor={String(resumen.numericas)} />
        </>
      )}

      {filtradas > 0 && (
        <span className="rounded-md bg-[var(--data-warning-50)] px-2 py-0.5 font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          {filtradas} {filtradas === 1 ? "fila oculta" : "filas ocultas"} por el filtro
        </span>
      )}

      {/* Zoom: para ver una planilla ancha entera o para leer sin forzar la vista. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onZoom(-0.1)}
          title="Alejar (Ctrl+rueda)"
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">Alejar</span>
        </button>
        <button
          type="button"
          onClick={() => onZoom(null)}
          title="Volver al 100%"
          className="w-12 rounded px-1 text-center font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => onZoom(0.1)}
          title="Acercar (Ctrl+rueda)"
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">Acercar</span>
        </button>
      </div>
    </div>
  );
}

function Dato({ titulo, valor, destacado }: { titulo: string; valor: string; destacado?: boolean }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-[var(--text-tertiary)]">{titulo}: </span>
      <span className={destacado ? "font-bold text-[var(--text-primary)]" : "font-semibold"}>{valor}</span>
    </span>
  );
}
