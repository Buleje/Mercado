"use client";

/**
 * Un valor de la guía sobre la hoja del diseñador: se arrastra con el mouse o
 * el dedo y se corre con las flechas (0,5 mm; con Shift, 5 mm). Se dibuja con
 * la MISMA geometría que el papel (`gtf-matricial-print`): borde superior en
 * `y`, ancho máximo, Courier New negrita al tamaño de letra del campo.
 *
 * Vacío: muestra el nombre del campo en gris para poder ubicarlo, pero al
 * imprimir no sale nada.
 */

import { useRef } from "react";
import { aMedioMm, entraEnUnaLinea, PASO_GRANDE_MM, PASO_MM, type Alineacion } from "@/lib/forestal/gtf-matricial-disposicion";
import { alineaCss, INTERLINEA } from "@/lib/forestal/gtf-matricial-print";
import { fmtMm } from "./gtf-matricial-controles";

/** pt → mm (1 pt = 1/72 pulgada). */
export const ptAMm = (pt: number): number => (pt * 25.4) / 72;

const FLECHAS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export interface CampoTalonarioProps {
  etiqueta: string;
  texto: string;
  x: number;
  y: number;
  anchoMm: number;
  letraPt: number;
  alinea: Alineacion;
  /** px por mm de la hoja en pantalla. */
  escala: number;
  seleccionado: boolean;
  /** Celda de tabla: un renglón, como en el papel. */
  unaLinea?: boolean;
  onSeleccionar: () => void;
  onMover: (x: number, y: number) => void;
}

export default function CampoTalonario({
  etiqueta, texto, x, y, anchoMm, letraPt, alinea, escala, seleccionado, unaLinea = false, onSeleccionar, onMover,
}: CampoTalonarioProps) {
  const arrastre = useRef<{ px: number; py: number; x: number; y: number; movio: boolean } | null>(null);
  const vacio = !texto.trim();
  const noEntra = !vacio && !entraEnUnaLinea(texto, anchoMm, letraPt);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={seleccionado}
      aria-label={`${etiqueta}${vacio ? " (vacío: no se imprime)" : `: ${texto}`}. X ${fmtMm(x)} mm, Y ${fmtMm(y)} mm`}
      data-campo={etiqueta}
      title={etiqueta}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        arrastre.current = { px: e.clientX, py: e.clientY, x, y, movio: false };
        onSeleccionar();
      }}
      onPointerMove={(e) => {
        const a = arrastre.current;
        if (!a) return;
        const dx = (e.clientX - a.px) / escala;
        const dy = (e.clientY - a.py) / escala;
        if (!a.movio && Math.hypot(dx, dy) < PASO_MM) return;
        a.movio = true;
        onMover(aMedioMm(a.x + dx), aMedioMm(a.y + dy));
      }}
      onPointerUp={(e) => {
        arrastre.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        arrastre.current = null;
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const f = FLECHAS[e.key];
        if (!f) return;
        e.preventDefault();
        const paso = e.shiftKey ? PASO_GRANDE_MM : PASO_MM;
        onMover(aMedioMm(x + f[0] * paso), aMedioMm(y + f[1] * paso));
      }}
      onFocus={onSeleccionar}
      /* `outline` y no `border`: el borde le comería ancho al texto y la pantalla dejaría de ser el papel. */
      className={`absolute cursor-grab touch-none select-none rounded-[2px] active:cursor-grabbing ${
        seleccionado
          ? "z-20 bg-[var(--accent-muted)] outline-2 outline-solid outline-[var(--accent)]"
          : noEntra
            ? "z-10 outline-2 outline-dashed outline-[var(--data-warning-500)]"
            : "z-10 outline-1 outline-dashed outline-[var(--rule-base)] hover:outline-[var(--accent)]"
      }`}
      style={{
        left: x * escala,
        top: y * escala,
        width: anchoMm * escala,
        minHeight: ptAMm(letraPt) * INTERLINEA * escala,
        fontSize: ptAMm(letraPt) * escala,
        lineHeight: INTERLINEA,
        textAlign: alineaCss(alinea) as React.CSSProperties["textAlign"],
        fontFamily: '"Courier New", Courier, monospace',
        fontWeight: 700,
        whiteSpace: unaLinea ? "nowrap" : "pre-wrap",
        overflowWrap: unaLinea ? undefined : "anywhere",
      }}
    >
      {/* El nombre de un campo vacío va en un renglón con «…»: partido en una casilla de 6 mm tapaba a los vecinos. */}
      <span className={vacio ? "block truncate italic text-[var(--text-tertiary)] opacity-70" : "text-[var(--text-primary)]"}>
        {vacio ? etiqueta : texto}
      </span>
      {seleccionado && (
        <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded-md bg-[var(--brand-ink)] px-1.5 py-0.5 font-sans text-xs font-bold not-italic text-white">
          X {fmtMm(x)} · Y {fmtMm(y)} mm
        </span>
      )}
    </div>
  );
}
