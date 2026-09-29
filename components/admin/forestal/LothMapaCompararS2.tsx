"use client";

/**
 * LothMapaCompararS2 — dos fechas de Sentinel-2 con una cortina: a la
 * izquierda la que se elige acá, a la derecha la que está en pantalla. Es la
 * misma cortina del comparador EUDR (mismo pane, misma posición): prender una
 * apaga la otra.
 *
 * Para qué: ver qué cambió en el monte entre dos pasadas —la trocha que se
 * abrió, el claro del patio, lo que se taló— sin salir del mapa.
 */

import { Columns2, X } from "@buleje/design-system/icons";
import { etiquetaEscena, fechaCorta } from "@/lib/forestal/loth-imagenes";
import { COLOR_HERRAMIENTA as C, panelTenido } from "./loth-mapa-shared";
import type { LothMapaImagenes } from "./hooks/use-loth-mapa-imagenes";

interface Props {
  img: LothMapaImagenes;
  split: number;
  onSplit: (n: number) => void;
}

export default function LothMapaCompararS2({ img, split, onSplit }: Props) {
  const { comparada, escena } = img;
  if (!comparada || !escena) return null;
  return (
    <div className="border-b border-[var(--rule-soft)] px-3 py-2">
      <div className="space-y-2 rounded-xl border p-3" style={panelTenido(C.comparar)}>
        <div className="flex flex-wrap items-center gap-2">
          <Columns2 className="h-4 w-4" style={{ color: C.comparar }} aria-hidden="true" />
          <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            Izquierda:
            <select
              value={comparada.fecha}
              onChange={(e) => img.comparar(e.target.value)}
              aria-label="Fecha de la izquierda de la cortina"
              className="h-9 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-xs font-bold text-[var(--text-primary)]"
            >
              {img.escenas
                .filter((e) => e.fecha !== escena.fecha)
                .map((e) => (
                  <option key={e.fecha} value={e.fecha}>
                    {etiquetaEscena(e)}
                  </option>
                ))}
            </select>
          </label>
          <span className="text-sm font-bold text-[var(--text-primary)]">· derecha: {fechaCorta(escena.fecha)}</span>
          <button
            type="button"
            onClick={() => img.comparar(null)}
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Cerrar
          </button>
        </div>
        <label className="flex items-center gap-3 text-xs font-bold text-[var(--text-secondary)]">
          Cortina
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => onSplit(Number(e.target.value))}
            className="h-2 flex-1 cursor-ew-resize"
            style={{ accentColor: C.comparar }}
            aria-label="Posición de la cortina entre las dos fechas"
          />
          <span className="w-10 text-right font-mono tabular-nums">{split}%</span>
        </label>
      </div>
    </div>
  );
}
