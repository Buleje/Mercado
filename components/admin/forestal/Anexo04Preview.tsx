"use client";

/**
 * Anexo04Preview — el papel a escala, con su zoom y el checklist encima. Lo que
 * se ve acá es exactamente lo que se descarga: las hojas se renderizan con la
 * misma geometría que usa el PDF, escaladas con un transform.
 */
import { forwardRef, type ReactNode } from "react";
import { Minus, Plus } from "@buleje/design-system/icons";
import type { Anexo04, DatosAnexo04 } from "@/lib/forestal/anexo04-serfor";
import Anexo04Hoja, { ANEXO04_CSS } from "./Anexo04Hoja";

const A4_PX = 794;   // ancho de una hoja A4 a 96 dpi
const A4_ALTO = 1123;

const Anexo04Preview = forwardRef<HTMLDivElement, {
  anexo: Anexo04;
  datos: DatosAnexo04;
  escala: number;
  onZoom: (paso: number) => void;
  /** Selector de origen de las piezas (va en la misma barra que el zoom). */
  origen: ReactNode;
  checklist: ReactNode;
}>(function Anexo04Preview({ anexo, datos, escala, onZoom, origen, checklist }, hojasRef) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {origen}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onZoom(-0.25)} aria-label="Alejar" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Minus className="h-3.5 w-3.5" /></button>
          <span className="w-12 text-center font-mono text-xs font-bold text-[var(--text-secondary)]">{Math.round(escala * 100)}%</span>
          <button type="button" onClick={() => onZoom(0.25)} aria-label="Acercar" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Plus className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      {checklist}
      <style>{ANEXO04_CSS}</style>
      <div className="max-h-[64vh] overflow-auto">
        <div ref={hojasRef} style={{ width: A4_PX * escala }}>
          {anexo.hojas.map((hoja, i) => (
            <div key={i} className="mb-3 shadow-[var(--shadow-md)]" style={{ width: A4_PX * escala, height: A4_ALTO * escala }}>
              <div style={{ transform: `scale(${escala})`, transformOrigin: "top left" }}>
                <Anexo04Hoja hoja={hoja} datos={datos} anexo={anexo} nro={i + 1} total={anexo.hojas.length} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
});

export default Anexo04Preview;
