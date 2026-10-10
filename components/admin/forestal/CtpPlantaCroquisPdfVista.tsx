/**
 * Vista previa chica de la importación del PDF del croquis (ADR-465): el fondo
 * recortado y, encima, lo que se va a crear — el contorno del plano de cada
 * componente marcado o su cuadrado (rayado) si no trae contorno. Las más
 * grandes abajo, igual que en el mapa; el renglón resaltado de la lista se
 * remarca acá.
 */

import { areaComponenteM2, ladoMarcaM, type ComponentePdf, type PropuestaCroquisPdf } from "@/lib/forestal/croquis-desde-pdf";
import type { FilaPdf } from "./hooks/use-croquis-pdf";

export default function CtpPlantaCroquisPdfVista({ propuesta, filas, terreno, resaltada }: {
  propuesta: PropuestaCroquisPdf;
  filas: Record<string, FilaPdf>;
  terreno: { anchoM: number; altoM: number } | null;
  resaltada: string | null;
}) {
  // Sin medidas válidas, la forma de la hoja recortada (las fracciones no cambian).
  const t = terreno ?? { anchoM: propuesta.recorte.w, altoM: propuesta.recorte.h };
  const A = t.anchoM, B = t.altoM;
  const lado = terreno ? ladoMarcaM(A, B) : Math.min(A, B) * 0.04;
  const contornoDe = (c: ComponentePdf) => (filas[c.clave]?.forma === "contorno" ? c.contorno : null);
  const dibujar = propuesta.componentes
    .filter((c) => filas[c.clave]?.incluir)
    .map((c) => ({ c, contorno: contornoDe(c), area: areaComponenteM2({ contorno: contornoDe(c) }, t) }))
    .sort((a, b) => b.area - a.area);
  const conContorno = dibujar.filter((d) => d.contorno).length;

  return (
    <figure className="mx-auto w-full max-w-[20rem]" data-croquis-pdf-vista="">
      <svg
        viewBox={`0 0 ${A} ${B}`}
        role="img"
        aria-label={`Vista previa: ${conContorno} contornos y ${dibujar.length - conContorno} cuadrados sobre el plano`}
        className="block h-auto w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)]"
      >
        {propuesta.vistaPrevia && <image href={propuesta.vistaPrevia} x={0} y={0} width={A} height={B} preserveAspectRatio="none" opacity={0.8} />}
        {dibujar.map(({ c, contorno }) => {
          const fuerte = resaltada === c.clave;
          const comun = { vectorEffect: "non-scaling-stroke" as const, strokeWidth: fuerte ? 3 : 1.25, "data-clave": c.clave };
          if (contorno) {
            return (
              <polygon key={c.clave} {...comun} points={contorno.map(([fx, fy]) => `${fx * A},${(1 - fy) * B}`).join(" ")}
                fill="var(--accent)" fillOpacity={fuerte ? 0.5 : 0.22} stroke="var(--accent-dark)" />
            );
          }
          const x = Math.min(Math.max(c.fx * A - lado / 2, 0), A - lado), y = Math.min(Math.max((1 - c.fy) * B - lado / 2, 0), B - lado);
          return (
            <rect key={c.clave} {...comun} x={x} y={y} width={lado} height={lado} strokeDasharray="3 2"
              fill="var(--data-warning-500)" fillOpacity={fuerte ? 0.6 : 0.3} stroke="var(--data-warning-700)" />
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-3 w-3 rounded-sm border border-[var(--accent-dark)] bg-[var(--accent-muted)]" />
          {conContorno} con contorno del plano
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-3 w-3 rounded-sm border border-dashed border-[var(--data-warning-700)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20" />
          {dibujar.length - conContorno} en cuadrado
        </span>
      </figcaption>
    </figure>
  );
}
