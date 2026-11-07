/**
 * El talonario PREIMPRESO dibujado debajo de los valores del diseñador: rayas,
 * rótulos, franjas y el N° en rojo, como los trae la imprenta (Brandon 16-10:
 * «que se parezca lo más posible a esos formatos, con ese color de texto,
 * tamaños y formatos»). Las medidas son de `gtf-talonario-plantilla`, en mm:
 * el `viewBox` es la hoja A4 y el SVG se estira al lienzo, así que la lupa no
 * lo vuelve a armar.
 *
 * Los trazos los traduce `gtf-talonario-plantilla-svg` (con los tokens
 * `--gtf-*`): la MISMA traducción que dibuja la «Hoja de prueba en papel
 * blanco», así lo que se ve acá es lo que sale en esa prueba. La impresión
 * normal (HTML de la matricial, PDF y ESC/P) no lo conoce: lleva sólo valores.
 * No toma clics (`pointer-events: none`).
 *
 * Letra sans (Arial/Helvetica, la de la imprenta) y a escala: el rótulo que
 * en el papel mide 9 pt mide 9 pt de la hoja, aunque en pantalla quede chico.
 */

import { memo, useMemo } from "react";
import { plantillaTalonario, type EncabezadoTalonario, type MarcoHoja } from "@/lib/forestal/gtf-talonario-plantilla";
import { ESTILO_PANTALLA, FUENTE_PLANTILLA, trazosPlantillaSvg } from "@/lib/forestal/gtf-talonario-plantilla-svg";
import type { FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";

interface Props {
  formato: FormatoTalonario;
  encabezado: EncabezadoTalonario;
  anchoMm: number;
  altoMm: number;
  /** El recuadro medido en el papel (`DisposicionHoja.marco`): el dibujo se estira a él. */
  marco?: MarcoHoja;
}

function PlantillaTalonario({ formato, encabezado, anchoMm, altoMm, marco }: Props) {
  /* Texto armado por un módulo puro con datos escapados (`esc`): sin HTML de afuera. */
  const trazos = useMemo(
    () => ({ __html: trazosPlantillaSvg(plantillaTalonario(formato, encabezado, marco), ESTILO_PANTALLA) }),
    [formato, encabezado, marco],
  );
  return (
    <svg
      aria-hidden
      data-plantilla-talonario={formato}
      /* El dibujo es A4 (en mm) y queda arriba a la izquierda en una hoja de otra medida (o estirado a su recuadro medido). */
      viewBox={`0 0 ${anchoMm} ${altoMm}`}
      preserveAspectRatio="xMinYMin meet"
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      fontFamily={FUENTE_PLANTILLA}
      dangerouslySetInnerHTML={trazos}
    />
  );
}

/** Se dibuja otra vez sólo si cambian la hoja o los datos del encabezado: arrastrar un valor no la toca. */
export default memo(
  PlantillaTalonario,
  (a, b) =>
    a.formato === b.formato &&
    a.anchoMm === b.anchoMm &&
    a.altoMm === b.altoMm &&
    JSON.stringify(a.marco ?? null) === JSON.stringify(b.marco ?? null) &&
    JSON.stringify(a.encabezado) === JSON.stringify(b.encabezado),
);
