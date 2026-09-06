"use client";

/**
 * Anexo04Preview — el papel a escala, con su zoom y el checklist encima. Lo que
 * se ve acá es exactamente lo que se descarga: las hojas se renderizan con la
 * misma geometría que usa el PDF, escaladas con un transform.
 */
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Minus, Pencil, Plus } from "@buleje/design-system/icons";
import type { Anexo04, DatosAnexo04 } from "@/lib/forestal/anexo04-serfor";
import Anexo04Hoja, { ANEXO04_CSS, type CampoEditable } from "./Anexo04Hoja";

const A4_PX = 794;   // ancho de una hoja A4 a 96 dpi
const A4_ALTO = 1123;

/**
 * Trackpad/mouse con ruedita inclinable mandan deltaX Y deltaY en el MISMO
 * evento aunque la persona sólo quiera bajar — el navegador scrollea ambos
 * ejes a la vez y la hoja "camina" de lado mientras se baja (bug reportado:
 * "se mueve brusco de un lado para el otro"). Se traba al eje DOMINANTE de
 * cada evento: si el gesto es mayormente vertical, sólo se mueve scrollTop
 * (deltaX se descarta ese tick); si es mayormente horizontal —zoom alto,
 * paneo deliberado—, sólo scrollLeft. `{ passive: false }` a mano porque
 * React adjunta `onWheel` como listener PASIVO por default: ahí
 * `preventDefault()` no hace nada y el navegador igual scrollea diagonal.
 */
function useScrollSinDiagonal(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX === 0 || e.deltaY === 0) return; // ya es un solo eje, dejar que el navegador lo maneje
      e.preventDefault();
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) el.scrollTop += e.deltaY;
      else el.scrollLeft += e.deltaX;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);
}

const Anexo04Preview = forwardRef<HTMLDivElement, {
  anexo: Anexo04;
  datos: DatosAnexo04;
  escala: number;
  onZoom: (paso: number) => void;
  /** Selector de origen de las piezas (va en la misma barra que el zoom). */
  origen: ReactNode;
  /** Filtro por dueño — sólo se pasa cuando el origen trae más de uno. */
  duenoSelector?: ReactNode;
  checklist: ReactNode;
  /** Corrige Cant./E/A/L directo en la hoja — el volumen se recalcula solo. */
  onEditarCelda?: (id: string, campo: CampoEditable, valor: number) => void;
}>(function Anexo04Preview({ anexo, datos, escala, onZoom, origen, duenoSelector, checklist, onEditarCelda }, hojasRef) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollSinDiagonal(scrollRef);
  const [editando, setEditando] = useState(false);

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {origen}
          {duenoSelector}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            aria-pressed={editando}
            title="Corregir Cant./E/A/L directo en la hoja — el volumen se recalcula solo, como en Excel"
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border-2 px-2.5 text-xs font-bold transition ${editando ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"}`}
          >
            {editando ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editando ? "Editando" : "Editar medidas"}
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onZoom(-0.25)} aria-label="Alejar" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Minus className="h-3.5 w-3.5" /></button>
            <span className="w-12 text-center font-mono text-xs font-bold text-[var(--text-secondary)]">{Math.round(escala * 100)}%</span>
            <button type="button" onClick={() => onZoom(0.25)} aria-label="Acercar" className="rounded-lg border border-[var(--rule-base)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><Plus className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
      {editando && (
        <p className="mb-2 rounded-lg border-2 border-[var(--accent)] bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          Tocá una celda amarilla (Cant./E/A/L) y escribí el valor correcto — el pie tablar, el m³ y los totales se recalculan solos.
        </p>
      )}
      {checklist}
      <style>{ANEXO04_CSS}</style>
      <div ref={scrollRef} className="max-h-[64vh] overflow-auto">
        <div ref={hojasRef} style={{ width: A4_PX * escala }}>
          {anexo.hojas.map((hoja, i) => (
            <div key={i} className="mb-3 shadow-[var(--shadow-md)]" style={{ width: A4_PX * escala, height: A4_ALTO * escala }}>
              <div style={{ transform: `scale(${escala})`, transformOrigin: "top left" }}>
                <Anexo04Hoja hoja={hoja} datos={datos} anexo={anexo} nro={i + 1} total={anexo.hojas.length} editando={editando} onEditarCelda={onEditarCelda} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
});

export default Anexo04Preview;
