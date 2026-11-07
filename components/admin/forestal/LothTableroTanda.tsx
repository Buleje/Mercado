"use client";

/**
 * La barra de la tanda (ADR-459): lo que se hace con las trozas del patio que
 * se marcaron — despacharlas con guía, imprimir sus etiquetas o exportarlas.
 *
 * Una guía sale de UN permiso: si lo marcado es de dos, se dice ANTES de abrir
 * el modal (que si no las soltaría en silencio).
 */

import { FileSpreadsheet, Printer, Truck, X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { sumaM3, type TrozaTablero } from "@/lib/forestal/loth-tablero-trozas";
import { Btn } from "./ctp-shared";

export default function LothTableroTanda({
  seleccion,
  ocultas = 0,
  planes,
  imprimiendo,
  onDespachar,
  onImprimir,
  onExportar,
  onQuitar,
}: {
  seleccion: readonly TrozaTablero[];
  /** Elegidas que el filtro de ahora no muestra (van igual en las acciones). */
  ocultas?: number;
  /** Cuántos permisos distintos hay en lo elegido. */
  planes: number;
  imprimiendo: boolean;
  onDespachar?: () => void;
  onImprimir: () => void;
  onExportar: () => void;
  onQuitar: () => void;
}) {
  const n = seleccion.length;
  if (n === 0) return null;
  const variosPermisos = planes > 1;
  return (
    <div
      role="region"
      aria-label="Trozas elegidas"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2"
    >
      <span className="text-sm font-semibold text-[var(--text-primary)]">
        <b className="font-mono tabular-nums">{n}</b> {n === 1 ? "elegida" : "elegidas"} ·{" "}
        <span className="font-mono tabular-nums">{fmtM3(sumaM3(seleccion))}</span> m³
        {ocultas > 0 && (
          <span className="font-normal text-[var(--text-secondary)]">
            {" "}· {ocultas} no {ocultas === 1 ? "se ve" : "se ven"} con el filtro
          </span>
        )}
      </span>
      {variosPermisos && (
        <span className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Son de {planes} permisos: la guía sale de uno solo. Elige el permiso arriba.
        </span>
      )}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        {onDespachar && (
          <Btn
            size="sm"
            variant="primary"
            onClick={onDespachar}
            disabled={variosPermisos}
            title={variosPermisos ? "La guía sale de un solo permiso" : "Abre la guía con estas trozas ya elegidas"}
          >
            <Truck className="h-4 w-4" aria-hidden="true" /> Despachar con guía
          </Btn>
        )}
        <Btn size="sm" variant="secondary" onClick={onImprimir} disabled={imprimiendo} title="La etiqueta con la ficha en el QR, la misma del Trozado">
          <Printer className="h-4 w-4" aria-hidden="true" /> {imprimiendo ? "Generando…" : "Imprimir etiquetas"}
        </Btn>
        <Btn size="sm" variant="secondary" onClick={onExportar} title="Sólo las trozas elegidas, en Excel">
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Exportar selección
        </Btn>
        <Btn size="sm" variant="ghost" onClick={onQuitar} aria-label="Quitar la selección" title="Quitar la selección">
          <X className="h-4 w-4" aria-hidden="true" />
        </Btn>
      </span>
    </div>
  );
}
