"use client";

/**
 * loth-labels.ts — «Etiquetas QR» de las secciones del Libro TH (Tala,
 * Trozado…). Desde el 08-10 (QR5) es la MISMA etiqueta que «Imprimir
 * etiquetas» de Trozado (`loth-troza-etiquetas.ts`): blanco y negro para la
 * térmica, código grande, especie, medidas, m³, la ficha en un QR que se lee
 * sin internet y el QR del sistema con el id de la línea y el código. Antes era
 * una hoja A4 propia, en verde, con un QR que apuntaba al host del navegador.
 */
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { imprimirEtiquetasTrozasLoth, type OpcionesEtiquetaLoth } from "./loth-troza-etiquetas";

/**
 * Etiquetas de las líneas con código (de troza o de árbol), de cualquier
 * sección. La ventana se abre en el clic (`opts.ventana`): después de un
 * `await` el navegador la bloquea. Devuelve cuántas se imprimieron.
 */
export function printTrozaLabels(
  entries: readonly LothEntryDTO[],
  opts: Omit<OpcionesEtiquetaLoth, "todasLasSecciones">,
): Promise<number> {
  return imprimirEtiquetasTrozasLoth(entries, { ...opts, todasLasSecciones: true });
}
