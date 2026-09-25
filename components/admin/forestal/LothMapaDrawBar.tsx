"use client";

/**
 * LothMapaDrawBar — las barras flotantes que aparecen ENCIMA del mapa mientras
 * se dibuja algo, con lo único que hace falta en ese momento:
 *
 *   · `LothMapaDrawBar`  polígono (área o predio): vértices, área en vivo,
 *     envolvente del censo, coordenadas, deshacer, guardar y cancelar.
 *   · `LothMapaViaBar`   vía o río: puntos, largo, deshacer, terminar, cancelar.
 *   · `LothMapaMarcaBar` referencia: «toca el mapa» y cancelar.
 *
 * Presentacionales: el borrador vive en `useLothMapaDibujo`. Van sobre el mapa
 * y no en la barra de arriba porque es ahí donde está mirando quien dibuja.
 */

import { Check, Clipboard, Loader2, MapPin, Route, Trees, Undo2, X } from "@buleje/design-system/icons";
import { formatDistance, lineLengthM } from "@/lib/forestal/loth-utm";
import type { LatLng } from "@/lib/forestal/loth-geo";

const BTN =
  "inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";
const BARRA =
  "absolute inset-x-3 top-3 z-30 flex flex-wrap items-center gap-2 rounded-2xl border bg-[var(--surface-raised)]/95 px-3 py-2 shadow-lg backdrop-blur";
/** Magenta de la vía en curso: el mismo trazo que pinta el canvas. */
const VIA = "#a21caf";

interface Props {
  /** Qué polígono se está levantando: cambia el rótulo y el color de la barra. */
  target: "area" | "predio";
  count: number;
  areaHa: number;
  saving: boolean;
  canWrapCenso: boolean;
  onWrapCenso: () => void;
  onImportCoords: () => void;
  onUndo: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function LothMapaDrawBar({
  target,
  count,
  areaHa,
  saving,
  canWrapCenso,
  onWrapCenso,
  onImportCoords,
  onUndo,
  onSave,
  onCancel,
}: Props) {
  const esPredio = target === "predio";
  return (
    // Se dibuja igual pero NO es lo mismo: sin decir cuál de los dos polígonos
    // se está levantando, se guarda el contorno del predio encima del área.
    <div role="status" className={`${BARRA} border-[var(--brand-ink)]`}>
      <MapPin className="h-4 w-4 text-[var(--brand-ink)] dark:text-[var(--text-primary)]" />
      <span className="shrink-0 rounded-full bg-[var(--brand-ink)] px-2 py-0.5 text-xs font-bold text-white">
        {esPredio ? "Predio" : "Área de aprovechamiento"}
      </span>
      <span className="text-xs font-bold text-[var(--text-primary)]">
        Toca para marcar · arrastra para mover · click derecho borra ·{" "}
        <b className="font-mono tabular-nums">{count}</b>
        {count >= 3 && <span className="text-[var(--text-tertiary)]"> · {areaHa.toFixed(1)} ha</span>}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {canWrapCenso && !esPredio && (
          <button type="button" onClick={onWrapCenso} title="Genera un polígono que envuelve el censo con 60 m de franja" className={BTN}>
            <Trees className="h-3.5 w-3.5" /> Envolver censo
          </button>
        )}
        <button type="button" onClick={onImportCoords} title="Pegar el cuadro de coordenadas o subir KML/GeoJSON" className={BTN}>
          <Clipboard className="h-3.5 w-3.5" /> Coordenadas
        </button>
        <button type="button" onClick={onUndo} disabled={count === 0} className={BTN}>
          <Undo2 className="h-3.5 w-3.5" /> Deshacer
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={count < 3 || saving}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
        </button>
        <button type="button" onClick={onCancel} className={BTN}>
          <X className="h-3.5 w-3.5" /> Cancelar
        </button>
      </div>
    </div>
  );
}

export function LothMapaViaBar({
  puntos,
  onUndo,
  onTerminar,
  onCancel,
}: {
  puntos: LatLng[];
  onUndo: () => void;
  onTerminar: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="status" className={BARRA} style={{ borderColor: VIA }}>
      <Route className="h-4 w-4" style={{ color: VIA }} aria-hidden="true" />
      <span className="text-xs font-bold text-[var(--text-primary)]">
        Toca el mapa para trazar la vía · <b className="font-mono tabular-nums">{puntos.length}</b> punto(s)
        {puntos.length >= 2 && <span className="text-[var(--text-tertiary)]"> · {formatDistance(lineLengthM(puntos))}</span>}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" onClick={onUndo} disabled={puntos.length === 0} className={BTN}>
          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Deshacer
        </button>
        <button
          type="button"
          onClick={onTerminar}
          disabled={puntos.length < 2}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: VIA }}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Terminar vía
        </button>
        <button type="button" onClick={onCancel} className={BTN}>
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancelar
        </button>
      </div>
    </div>
  );
}

export function LothMapaMarcaBar({ onCancel }: { onCancel: () => void }) {
  return (
    <div role="status" className={`${BARRA} border-[var(--brand-ink)]`}>
      <MapPin className="h-4 w-4 text-[var(--brand-ink)] dark:text-[var(--text-primary)]" aria-hidden="true" />
      <span className="text-xs font-bold text-[var(--text-primary)]">
        Toca el mapa donde está el centro poblado, el campamento o el ingreso · después le pones nombre en «Referencias, vías y
        acceso»
      </span>
      <button type="button" onClick={onCancel} className={`ml-auto ${BTN}`}>
        <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancelar
      </button>
    </div>
  );
}
