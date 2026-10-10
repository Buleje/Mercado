"use client";

/**
 * El croquis de la parte trasera del camión, visto desde la compuerta: cada
 * pieza es el rectángulo de su sección (espesor × ancho, a escala) con el
 * color de su especie. El acomodo sale de `acomodarCroquis` (lib pura, con
 * test); acá sólo se dibuja.
 *
 * Las unidades del `viewBox` son PULGADAS: el SVG escala solo al ancho de la
 * caja. El rótulo de la medida va dentro del rectángulo sólo si entra; si no,
 * queda en el `title` (al pasar el mouse) y en la tabla de abajo.
 */
import { CHART_PALETTE } from "@/components/ui-system/charts/palette";
import type { Croquis } from "@/lib/forestal/camion-croquis";
import { pulgAMetros } from "@/lib/forestal/camion-croquis";
import { formatNumber } from "@/lib/format";

/**
 * Un color por índice de `coloresPorEspecie`. Mismo orden que la paleta del
 * PDF (`camion-croquis-pdf.ts`): teal, azul, coral, morado, gris, tinta…
 */
export const COLORES_ESPECIE: readonly string[] = [
  CHART_PALETTE.accent,
  CHART_PALETTE.info,
  CHART_PALETTE.amber,
  CHART_PALETTE.purple,
  CHART_PALETTE.secondary,
  CHART_PALETTE.primary,
  CHART_PALETTE.tertiary,
  CHART_PALETTE.success,
];
export const colorCss = (i: number): string => COLORES_ESPECIE[i % COLORES_ESPECIE.length];

/** Muestra de color de una especie (tabla y leyenda). */
export function MuestraEspecie({ color }: { color: number }) {
  return <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: colorCss(color) }} />;
}

const MARGEN = 10;
/** Alto de las barandas: lo que la pila alcance o, como piso, 16″ (~40 cm):
 *  con pocas piezas, una baranda real de 1 m dejaba la pila como una raya. */
const BARANDA_MIN = 16;
const CHASIS = 4;
const LLANTA = { w: 8, h: 11 };

export function CroquisTrasera({ croquis }: { croquis: Croquis }) {
  const W = croquis.anchoPulg;
  const altoPila = croquis.altoPulg;
  const baranda = Math.max(BARANDA_MIN, altoPila + 3);
  const fs = Math.max(1.2, W / 62);
  /* Lienzo: el piso de la tolva en y = baranda (SVG crece hacia abajo). */
  const piso = baranda + MARGEN;
  const vbW = W + MARGEN * 2 + 18;
  const vbH = piso + CHASIS + LLANTA.h + fs * 3;
  const aY = (y: number, h: number) => piso - y - h;
  const anchoTxt = `${formatNumber(pulgAMetros(W), 2)} m`;
  const altoTxt = `${formatNumber(pulgAMetros(altoPila), 2)} m`;

  return (
    <svg
      viewBox={`${-MARGEN} 0 ${vbW} ${vbH}`}
      role="img"
      aria-label={`Croquis de la parte trasera: ${croquis.total} piezas en ${anchoTxt} de ancho, pila de ${altoTxt}`}
      className="h-auto max-h-[60vh] w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Barandas y piso de la tolva */}
      <rect x={-2.5} y={piso - baranda} width={2.5} height={baranda} fill="var(--text-tertiary)" />
      <rect x={W} y={piso - baranda} width={2.5} height={baranda} fill="var(--text-tertiary)" />
      <rect x={-4} y={piso} width={W + 8} height={CHASIS} rx={1} fill="var(--text-secondary)" />
      {/* Llantas dobles vistas desde atrás */}
      {[W * 0.16, W * 0.84].map((cx) => (
        <g key={cx} fill="var(--text-primary)" opacity={0.75}>
          <rect x={cx - LLANTA.w - 0.6} y={piso + CHASIS} width={LLANTA.w} height={LLANTA.h} rx={2.5} />
          <rect x={cx + 0.6} y={piso + CHASIS} width={LLANTA.w} height={LLANTA.h} rx={2.5} />
        </g>
      ))}

      {/* Las piezas */}
      {croquis.rects.map((r, i) => {
        const y = aY(r.y, r.h);
        const entra = r.w >= r.etiqueta.length * fs * 0.62 + 0.6 && r.h >= fs * 1.15;
        return (
          <g key={`${r.filaId}-${i}`}>
            <rect
              x={r.x}
              y={y}
              width={r.w}
              height={r.h}
              fill={colorCss(r.color)}
              fillOpacity={0.85}
              stroke="var(--surface-canvas)"
              strokeWidth={0.35}
            >
              <title>{r.detalle}</title>
            </rect>
            {entra && (
              <text
                x={r.x + r.w / 2}
                y={y + r.h / 2}
                fontSize={fs}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--text-primary)"
                stroke="var(--surface-canvas)"
                strokeWidth={fs * 0.22}
                paintOrder="stroke"
                fontWeight={700}
                className="pointer-events-none font-mono"
              >
                {r.etiqueta}
              </text>
            )}
          </g>
        );
      })}

      {/* Cotas: ancho abajo, alto de la pila a la derecha */}
      <g stroke="var(--text-tertiary)" strokeWidth={0.3} fill="none">
        <line x1={0} y1={vbH - fs * 1.6} x2={W} y2={vbH - fs * 1.6} />
        <line x1={0} y1={vbH - fs * 2.2} x2={0} y2={vbH - fs} />
        <line x1={W} y1={vbH - fs * 2.2} x2={W} y2={vbH - fs} />
        {altoPila > 0 && (
          <>
            <line x1={W + 7} y1={piso} x2={W + 7} y2={piso - altoPila} />
            <line x1={W + 5} y1={piso - altoPila} x2={W + 9} y2={piso - altoPila} />
          </>
        )}
      </g>
      <text x={W / 2} y={vbH - fs * 2} fontSize={fs} textAnchor="middle" fill="var(--text-secondary)" fontWeight={700}>
        {anchoTxt}
      </text>
      {altoPila > 0 && (
        <text
          x={W + 10}
          y={piso - altoPila / 2}
          fontSize={fs}
          fill="var(--text-secondary)"
          fontWeight={700}
          dominantBaseline="central"
        >
          {altoTxt}
        </text>
      )}
    </svg>
  );
}
