"use client";

/**
 * Un valor de la guía sobre la hoja del diseñador. Se dibuja con la MISMA
 * geometría que el papel (`gtf-matricial-print`): borde superior en `y`, ancho
 * máximo, Courier New negrita al tamaño de letra del campo.
 *
 * No se arrastra solo: avisa que lo presionaron y el arrastre lo lleva la
 * selección (`useSeleccionTalonario`), que mueve a todos los elegidos juntos.
 * Las flechas corren 0,5 mm (con Shift, 5 mm) a todo el grupo.
 *
 * Vacío: muestra el nombre del campo en gris para poder ubicarlo, pero al
 * imprimir no sale nada.
 */

import { entraEnUnaLinea, PASO_GRANDE_MM, PASO_MM, type Alineacion } from "@/lib/forestal/gtf-matricial-disposicion";
import { INTERLINEA, ptAMm } from "@/lib/forestal/gtf-matricial-edicion";
import { alineaCss } from "@/lib/forestal/gtf-matricial-print";
import { fmtMm } from "./gtf-matricial-controles";

export { ptAMm };

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
  /** El primero elegido: alinear e igualar toman su medida. Lleva la etiqueta con X/Y. */
  referencia?: boolean;
  /** Celda de tabla: un renglón, como en el papel. */
  unaLinea?: boolean;
  onPresionar: (e: React.PointerEvent) => void;
  /** Llega por Tab (no por clic): si no estaba elegido, queda elegido solo. */
  onFocoTeclado: () => void;
  onFlecha: (dx: number, dy: number) => void;
}

export default function CampoTalonario({
  etiqueta, texto, x, y, anchoMm, letraPt, alinea, escala, seleccionado, referencia = false, unaLinea = false,
  onPresionar, onFocoTeclado, onFlecha,
}: CampoTalonarioProps) {
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
      onPointerDown={onPresionar}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const f = FLECHAS[e.key];
        if (!f) return;
        e.preventDefault();
        const paso = e.shiftKey ? PASO_GRANDE_MM : PASO_MM;
        onFlecha(f[0] * paso, f[1] * paso);
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(":focus-visible")) onFocoTeclado();
      }}
      /* `outline` y no `border`: el borde le comería ancho al texto y la pantalla dejaría de ser el papel. */
      className={`absolute cursor-grab touch-none select-none rounded-[2px] active:cursor-grabbing ${
        seleccionado
          ? `z-20 bg-[var(--accent-muted)] outline-solid outline-[var(--accent)] ${referencia ? "outline-[3px]" : "outline-2"}`
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
      {referencia && (
        <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded-md bg-[var(--brand-ink)] px-1.5 py-0.5 font-sans text-xs font-bold not-italic text-white">
          X {fmtMm(x)} · Y {fmtMm(y)} mm
        </span>
      )}
    </div>
  );
}
