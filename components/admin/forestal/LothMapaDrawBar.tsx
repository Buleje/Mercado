"use client";

/**
 * LothMapaDrawBar — barra flotante del modo dibujo del polígono de
 * aprovechamiento: contador de vértices, área en vivo, envolvente del censo,
 * deshacer, guardar y cancelar. Presentacional (el borrador vive en
 * `LothMapaView`).
 */

import { Check, Clipboard, Loader2, MapPin, Trees, Undo2, X } from "@buleje/design-system/icons";

const BTN =
  "inline-flex h-8 items-center gap-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40";

interface Props {
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
  return (
    <div className="absolute inset-x-3 top-3 z-30 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[var(--brand-ink)] bg-[var(--surface-raised)]/95 px-3 py-2 shadow-lg backdrop-blur">
      <MapPin className="h-4 w-4 text-[var(--brand-ink)] dark:text-[var(--text-primary)]" />
      <span className="text-xs font-bold text-[var(--text-primary)]">
        Tocá para marcar · arrastrá para mover · click derecho borra ·{" "}
        <b className="font-mono tabular-nums">{count}</b>
        {count >= 3 && <span className="text-[var(--text-tertiary)]"> · {areaHa.toFixed(1)} ha</span>}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {canWrapCenso && (
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
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
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
