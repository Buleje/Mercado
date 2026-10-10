"use client";

/**
 * Controles del croquis para el celular: acercar, alejar, encajar el plano y
 * pantalla completa, todos de 44 px (el control de Leaflet mide 30 y se esconde
 * en móvil). Más la pista de «dos dedos»: con un dedo la página sigue
 * desplazándose; el plano se mueve con dos, o en pantalla completa con uno.
 */

import { Plus, Minus, Maximize, Minimize, Locate } from "@buleje/design-system/icons";

const BTN = "grid h-11 w-11 place-items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] active:bg-[var(--surface-sunken)]";

export const CONTROLES_CSS = `[data-movil="1"] .leaflet-control-zoom{display:none}`;

export default function CtpPlantaCroquisControles({ onAcercar, onAlejar, onEncajar, fullscreen, onFullscreen, pista }: {
  onAcercar: () => void; onAlejar: () => void; onEncajar: () => void; fullscreen: boolean; onFullscreen: () => void;
  /** Muestra «dos dedos para mover» (solo con la página desplazándose por debajo). */
  pista: boolean;
}) {
  // En una fila bajo el plano, no encima: cuatro botones de 44 px tapaban la mitad del terreno.
  return (
    <div className="flex items-center gap-2 px-3 sm:px-0">
      <p className="min-w-0 flex-1 text-xs font-semibold leading-tight text-[var(--text-secondary)]">{pista ? "Dos dedos para mover y acercar el plano" : ""}</p>
      <button type="button" onClick={onAcercar} aria-label="Acercar" className={BTN}><Plus className="h-5 w-5" /></button>
      <button type="button" onClick={onAlejar} aria-label="Alejar" className={BTN}><Minus className="h-5 w-5" /></button>
      <button type="button" onClick={onEncajar} aria-label="Encajar el plano" title="Encajar el plano" className={BTN}><Locate className="h-5 w-5" /></button>
      <button type="button" onClick={onFullscreen} aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} className={BTN}>
        {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
      </button>
    </div>
  );
}
