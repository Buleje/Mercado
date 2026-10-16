/**
 * El talonario PREIMPRESO dibujado debajo de los valores del diseñador: rayas,
 * rótulos, franjas y el N° en rojo, como los trae la imprenta (Brandon 16-10:
 * «que se parezca lo más posible a esos formatos, con ese color de texto,
 * tamaños y formatos»). Las medidas son de `gtf-talonario-plantilla`, en mm:
 * el `viewBox` es la hoja A4 y el SVG se estira al lienzo, así que la lupa no
 * lo vuelve a armar.
 *
 * SÓLO pantalla: el papel ya lo trae impreso. El HTML de la matricial, el PDF
 * y el ESC/P salen de `gtf-matricial-print` / la salida del servidor, que no
 * conocen este componente. No toma clics (`pointer-events: none`).
 *
 * Letra sans (Arial/Helvetica, la de la imprenta) y a escala: el rótulo que
 * en el papel mide 9 pt mide 9 pt de la hoja, aunque en pantalla quede chico.
 * Los textos con `ancho` se estiran o encogen a su medida del papel
 * (`textLength`), así no corren a los renglones.
 */

import { memo, useMemo } from "react";
import { plantillaTalonario, type EncabezadoTalonario, type TintaPlantilla, type TrazoPlantilla } from "@/lib/forestal/gtf-talonario-plantilla";
import type { FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";

const MM_POR_PT = 25.4 / 72;
const SANS = "Arial, Helvetica, sans-serif";
/** Punteado del renglón: puntos de 0,4 mm cada 0,9 mm (el de la imprenta). */
const PUNTEADO = "0.4 0.5";

const TINTA: Record<TintaPlantilla, string> = {
  forma: "var(--gtf-tinta)",
  folio: "var(--gtf-folio)",
  dato: "var(--gtf-tinta)",
};
const ANCLA = { izq: "start", centro: "middle", der: "end" } as const;

/** Las rayas finas (punteados y renglones de la tabla) van más claras: encima se lee el valor. */
const trazoDeLinea = (fina: boolean): string => (fina ? "var(--gtf-linea)" : "var(--gtf-tinta)");

function Trazo({ t }: { t: TrazoPlantilla }) {
  switch (t.t) {
    case "linea":
      return (
        <line
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={trazoDeLinea(!!t.punteado || t.grosor <= 0.2)}
          strokeWidth={t.punteado ? Math.max(t.grosor, 0.3) : t.grosor}
          strokeDasharray={t.punteado ? PUNTEADO : undefined}
          strokeLinecap={t.punteado ? "round" : undefined}
        />
      );
    case "rect":
      return (
        <rect
          x={t.x}
          y={t.y}
          width={t.w}
          height={t.h}
          rx={t.radio}
          fill={t.relleno ? "var(--gtf-franja)" : "none"}
          stroke="var(--gtf-tinta)"
          strokeWidth={t.grosor}
        />
      );
    case "casilla":
      return <rect x={t.x} y={t.y} width={t.w} height={t.h} fill="none" stroke="var(--gtf-tinta)" strokeWidth={0.3} />;
    case "texto":
      return (
        <text
          x={t.x}
          y={t.y}
          fontSize={t.pt * MM_POR_PT}
          fontWeight={t.peso ?? 400}
          textAnchor={ANCLA[t.alinea ?? "izq"]}
          fill={TINTA[t.tinta ?? "forma"]}
          {...(t.ancho ? { textLength: t.ancho, lengthAdjust: "spacingAndGlyphs" } : {})}
        >
          {t.s}
        </text>
      );
  }
}

function PlantillaTalonario({ formato, encabezado, anchoMm, altoMm }: { formato: FormatoTalonario; encabezado: EncabezadoTalonario; anchoMm: number; altoMm: number }) {
  const p = useMemo(() => plantillaTalonario(formato, encabezado), [formato, encabezado]);
  return (
    <svg
      aria-hidden
      data-plantilla-talonario={formato}
      /* El dibujo es A4 (en mm) y queda arriba a la izquierda en una hoja de otra medida: no se deforma. */
      viewBox={`0 0 ${anchoMm} ${altoMm}`}
      preserveAspectRatio="xMinYMin meet"
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      fontFamily={SANS}
    >
      {p.trazos.map((t, i) => (
        <Trazo key={i} t={t} />
      ))}
    </svg>
  );
}

/** Se dibuja otra vez sólo si cambian la hoja o los datos del encabezado: arrastrar un valor no la toca. */
export default memo(
  PlantillaTalonario,
  (a, b) => a.formato === b.formato && a.anchoMm === b.anchoMm && a.altoMm === b.altoMm && JSON.stringify(a.encabezado) === JSON.stringify(b.encabezado),
);
