/**
 * loth-mapa-arbol-simbolo — el símbolo de un árbol del censo: la FORMA dice su
 * condición (círculo aprovechable, rombo semillero, triángulo bajo DMC,
 * cuadrado otra/sin condición), el RELLENO dice su estado (lleno en pie,
 * hueco y tachado talado, punteado descartado) y el color refuerza las dos.
 *
 * Una sola geometría para dos lugares: el marcador de Leaflet (que recibe un
 * string HTML) y la leyenda (JSX, en `LothMapaArbolSimbolo`). Si divergen, la
 * leyenda explica un mapa que no es el que se ve.
 *
 * Los colores son tokens del DS en `style` (`var(--…)`): cambian con el modo
 * oscuro sin volver a pintar el mapa. Puro: sin React, sin DOM.
 */

import { CLASE_ARBOL_FORMA, CLASE_ARBOL_TOKEN, type ClaseArbol, type FormaArbol } from "@/lib/forestal/loth-mapa-arboles";

/** El halo que separa el símbolo de cualquier base (topográfica o satelital). */
export const HALO_ARBOL = "var(--surface-raised)";
/** Anillo del árbol elegido / más cercano, y la línea que lleva hasta él. */
export const RESALTE_ARBOL = "var(--data-info-500)";
const FUERA = "var(--data-error-500)";
const DESCARTADO = "var(--data-3)";
/** Insignia de «Elegir varios»: el mismo turquesa del CTA del mapa. */
const MARCADO = "var(--accent)";

/** Trazo de cada forma en un lienzo de 24 × 24 con centro en (12, 12). */
export function pathForma(forma: FormaArbol): string {
  switch (forma) {
    case "rombo":
      return "M12 4.5 L19.5 12 L12 19.5 L4.5 12 Z";
    case "triangulo":
      return "M12 4.5 L19.5 18 L4.5 18 Z";
    case "cuadrado":
      return "M6.5 6.5 H17.5 V17.5 H6.5 Z";
    default:
      return "M5.5 12 a6.5 6.5 0 1 0 13 0 a6.5 6.5 0 1 0 -13 0 Z";
  }
}

/** Tachadura del talado: la diagonal que cruza el símbolo hueco. */
export const PATH_TACHADO = "M7 17 L17 7";

export interface EstiloSimbolo {
  d: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: string | null;
  tachado: boolean;
  opacidad: number;
}

/** Cómo se dibuja un árbol según su clase y su estado (lo usan string y JSX). */
export function estiloSimbolo(clase: ClaseArbol, estado: string): EstiloSimbolo {
  const d = pathForma(CLASE_ARBOL_FORMA[clase]);
  const color = CLASE_ARBOL_TOKEN[clase];
  if (estado === "talado") return { d, fill: HALO_ARBOL, stroke: color, strokeWidth: 2.5, dash: null, tachado: true, opacidad: 1 };
  if (estado === "descartado") return { d, fill: HALO_ARBOL, stroke: DESCARTADO, strokeWidth: 2, dash: "2.5 2", tachado: false, opacidad: 0.8 };
  return { d, fill: color, stroke: HALO_ARBOL, strokeWidth: 2, dash: null, tachado: false, opacidad: 1 };
}

const escapar = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** La insignia de «marcado»: un círculo con un check, arriba a la derecha del símbolo. */
export const BADGE_MARCADO_PATH = "M16.6 6 L18.2 7.6 L21.4 4.4";

export interface OpcionesSimbolo {
  clase: ClaseArbol;
  estado: string;
  /** Fuera del polígono declarado: anillo punteado rojo. */
  fuera?: boolean;
  /** Elegido o el más cercano: anillo azul. */
  resaltado?: boolean;
  /** El más cercano mientras se busca con el GPS: además late (salvo movimiento reducido). */
  latido?: boolean;
  /** Marcado en «Elegir varios»: insignia turquesa con un check. */
  marcado?: boolean;
  /** Nombre accesible del marcador (Leaflet lo vuelve `role="button"`). */
  etiqueta: string;
  /** Lado en px del marcador (el área que se toca, no sólo lo que se ve). */
  lado?: number;
}

/** HTML del `divIcon` de Leaflet para un árbol del censo. */
export function simboloArbolHtml(o: OpcionesSimbolo): string {
  const lado = o.lado ?? 26;
  const e = estiloSimbolo(o.clase, o.estado);
  const anillos = [
    o.fuera ? `<circle cx="12" cy="12" r="11" fill="none" style="stroke:${FUERA}" stroke-width="1.5" stroke-dasharray="3 2"/>` : "",
    o.resaltado ? `<circle cx="12" cy="12" r="11" fill="none" style="stroke:${HALO_ARBOL}" stroke-width="4"/><circle cx="12" cy="12" r="11" fill="none" style="stroke:${RESALTE_ARBOL}" stroke-width="2.5"/>` : "",
  ].join("");
  const badge = o.marcado
    ? `<circle cx="19" cy="6" r="5.5" style="fill:${MARCADO}" stroke="${HALO_ARBOL}" stroke-width="1.5"/><path d="${BADGE_MARCADO_PATH}" fill="none" style="stroke:${HALO_ARBOL}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
    : "";
  const forma = `<path d="${e.d}" style="fill:${e.fill};stroke:${e.stroke}" stroke-width="${e.strokeWidth}" stroke-linejoin="round"${
    e.dash ? ` stroke-dasharray="${e.dash}"` : ""
  } opacity="${e.opacidad}"/>`;
  const tachado = e.tachado ? `<path d="${PATH_TACHADO}" style="stroke:${e.stroke}" stroke-width="2.25" stroke-linecap="round"/>` : "";
  const latido = o.latido
    ? `<span aria-hidden="true" class="pointer-events-none absolute inset-0 rounded-full border-2 animate-ping motion-reduce:animate-none" style="border-color:${RESALTE_ARBOL}"></span>`
    : "";
  const etiqueta = o.marcado ? `${o.etiqueta}, marcado` : o.etiqueta;
  return `<span class="relative block" style="width:${lado}px;height:${lado}px">${latido}<svg aria-hidden="true" width="${lado}" height="${lado}" viewBox="0 0 24 24" style="overflow:visible;display:block">${anillos}${forma}${tachado}${badge}</svg><span class="sr-only">${escapar(
    etiqueta,
  )}</span></span>`;
}
