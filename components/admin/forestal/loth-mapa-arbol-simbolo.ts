/**
 * loth-mapa-arbol-simbolo — el símbolo de un árbol del censo: la FORMA dice su
 * condición (círculo aprovechable, rombo semillero, triángulo bajo DMC,
 * cuadrado otra/sin condición), el RELLENO dice su estado (lleno en pie,
 * hueco y tachado talado, punteado descartado) y el color refuerza las dos.
 * Lo que vino después de la tala va en una INSIGNIA abajo a la derecha (tres
 * rayas: trozado · flecha hueca: despacho parcial · flecha llena: despachado ·
 * casita: en el CTP) y el desfase censo ≠ libro, en un triángulo con «!»
 * arriba a la izquierda. Al lado va la etiqueta de texto («114 · Trozado ×3»).
 *
 * Una sola geometría para dos lugares: el marcador de Leaflet (que recibe un
 * string HTML) y la leyenda (JSX, en `LothMapaArbolSimbolo`). Si divergen, la
 * leyenda explica un mapa que no es el que se ve.
 *
 * Los colores son tokens del DS en `style` (`var(--…)`): cambian con el modo
 * oscuro sin volver a pintar el mapa. Puro: sin React, sin DOM.
 */

import { CLASE_ARBOL_FORMA, CLASE_ARBOL_TOKEN, type ClaseArbol, type FormaArbol } from "@/lib/forestal/loth-mapa-arboles";
import { AVISO_TOKEN, ETAPA_TOKEN, type EtapaArbol } from "@/lib/forestal/loth-etapa-arbol";
import { estiloDeLado, type LadoEtiqueta } from "./loth-mapa-etiquetas";

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

/** La insignia de la etapa: un círculo abajo a la derecha con su dibujo adentro. */
export interface InsigniaEtapa {
  cx: number;
  cy: number;
  r: number;
  fondo: string;
  borde: string;
  /** Trazo del dibujo (lienzo 24 × 24). */
  dibujo: string;
  tinta: string;
}

const FLECHA = "M16.1 18.5h5.6M19.2 16.1l2.4 2.4-2.4 2.4";
const INSIGNIA = { cx: 19, cy: 18.5, r: 5.5 } as const;

/** Qué insignia lleva cada etapa (null: la forma y el relleno ya lo dicen). */
export function insigniaDeEtapa(etapa: EtapaArbol | null | undefined): InsigniaEtapa | null {
  if (!etapa) return null;
  const color = ETAPA_TOKEN[etapa];
  switch (etapa) {
    case "trozado":
      return { ...INSIGNIA, fondo: color, borde: HALO_ARBOL, dibujo: "M16.8 16.3v4.4M19 16.3v4.4M21.2 16.3v4.4", tinta: HALO_ARBOL };
    case "despachado_parcial":
      return { ...INSIGNIA, fondo: HALO_ARBOL, borde: color, dibujo: FLECHA, tinta: color };
    case "despachado":
      return { ...INSIGNIA, fondo: color, borde: HALO_ARBOL, dibujo: FLECHA, tinta: HALO_ARBOL };
    case "en_ctp":
      return { ...INSIGNIA, fondo: color, borde: HALO_ARBOL, dibujo: "M16.4 21v-3.1l2.6-2.1 2.6 2.1V21z", tinta: HALO_ARBOL };
    default:
      return null;
  }
}

/** El triángulo del aviso (censo ≠ libro), arriba a la izquierda, y su «!». */
export const AVISO_TRIANGULO = "M5 0.6 L9.9 9.3 H0.1 Z";
export const AVISO_SIGNO = "M5 3.4v2.8M5 7.6v.1";
export { AVISO_TOKEN };

function insigniaHtml(i: InsigniaEtapa): string {
  return `<circle cx="${i.cx}" cy="${i.cy}" r="${i.r}" style="fill:${i.fondo};stroke:${i.borde}" stroke-width="1.5"/><path d="${i.dibujo}" fill="none" style="stroke:${i.tinta}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const AVISO_HTML = `<path d="${AVISO_TRIANGULO}" style="fill:${AVISO_TOKEN};stroke:${HALO_ARBOL}" stroke-width="1.2" stroke-linejoin="round"/><path d="${AVISO_SIGNO}" fill="none" style="stroke:${HALO_ARBOL}" stroke-width="1.5" stroke-linecap="round"/>`;

/** La etiqueta de texto junto al punto. */
export interface ChipArbol {
  codigo: string;
  /** Lo que va después del código («Trozado ×3»); vacío = sólo el código. */
  texto: string;
  /** Color del borde izquierdo (la etapa) — o neutro con sólo el código. */
  color: string;
  aviso: boolean;
  lado: LadoEtiqueta;
}

/**
 * Clases de la etiqueta: fondo opaco de tarjeta, borde y sombra, para que se
 * lea igual sobre la imagen satelital y sobre la topográfica, en claro y en
 * oscuro. `aria-hidden`: el nombre accesible del marcador ya lo dice.
 */
const CHIP_CLASES =
  "absolute z-10 inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-l-[3px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-1.5 text-xs font-semibold leading-[18px] text-[var(--text-primary)] shadow-[var(--shadow-sm)]";

/** El `style` en línea de la etiqueta: su lado y el color de su etapa (lo usa también el re-ubicado). */
export function estiloChip(c: Pick<ChipArbol, "color">, lado: LadoEtiqueta, ladoMarcador: number): string {
  return `${estiloDeLado(lado, ladoMarcador)};border-left-color:${c.color}`;
}

export function chipArbolHtml(c: ChipArbol, ladoMarcador: number): string {
  const aviso = c.aviso
    ? `<svg aria-hidden="true" width="11" height="11" viewBox="0 0 10 10" style="overflow:visible;flex:none">${AVISO_HTML}</svg>`
    : "";
  const texto = c.texto ? `<span style="color:var(--text-secondary)">·</span><span>${escapar(c.texto)}</span>` : "";
  return `<span data-etq="${c.lado}" aria-hidden="true" class="${CHIP_CLASES}" style="${estiloChip(c, c.lado, ladoMarcador)}">${aviso}<b class="font-black">${escapar(c.codigo)}</b>${texto}</span>`;
}

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
  /** La etapa según el libro: su insignia abajo a la derecha. */
  etapa?: EtapaArbol;
  /** El censo y el libro no coinciden: triángulo con «!» arriba a la izquierda. */
  aviso?: boolean;
  /** La etiqueta de texto junto al punto (sin ella, ninguna). */
  chip?: ChipArbol | null;
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
  const ins = insigniaDeEtapa(o.etapa);
  const etapa = `${ins ? insigniaHtml(ins) : ""}${o.aviso ? AVISO_HTML : ""}`;
  const latido = o.latido
    ? `<span aria-hidden="true" class="pointer-events-none absolute inset-0 rounded-full border-2 animate-ping motion-reduce:animate-none" style="border-color:${RESALTE_ARBOL}"></span>`
    : "";
  const etiqueta = o.marcado ? `${o.etiqueta}, marcado` : o.etiqueta;
  return `<span class="relative block" style="width:${lado}px;height:${lado}px">${latido}<svg aria-hidden="true" width="${lado}" height="${lado}" viewBox="0 0 24 24" style="overflow:visible;display:block">${anillos}${forma}${tachado}${etapa}${badge}</svg>${
    o.chip ? chipArbolHtml(o.chip, lado) : ""
  }<span class="sr-only">${escapar(etiqueta)}</span></span>`;
}
