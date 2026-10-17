/**
 * gtf-talonario-plantilla-svg — la plantilla del talonario (`plantillaTalonario`)
 * traducida a SVG en TEXTO, UNA sola traducción para los dos lados:
 *
 *   · la pantalla (el diseñador, `gtf-matricial-plantilla.tsx`), con los tokens
 *     `--gtf-*` de globals.css (claro y oscuro);
 *   · el papel (la «Hoja de prueba en papel blanco», `htmlHojaPruebaBlanca`),
 *     con tinta gris oscura o celeste y rayas finas, sin rellenos: a contraluz
 *     se tiene que ver el talonario debajo.
 *
 * Así un punteado, una franja, un texto estirado a su medida del papel
 * (`textLength`) y el folio en rojo se dibujan igual en los dos: lo que se ve
 * en el diseñador es lo que sale en la prueba. Los colores son PARÁMETRO: los
 * del papel viven acá (un módulo lib), nunca como hex sueltos en un TSX.
 *
 * PURO y client-safe: sin React ni DOM.
 */

import { esc } from "./ctp-documento-print";
import type { PlantillaHoja, TintaPlantilla, TrazoPlantilla } from "./gtf-talonario-plantilla";

export interface EstiloPlantilla {
  /** Rótulos, rayas y títulos. */
  tinta: string;
  /** Punteados y rayas finas de la tabla (encima se lee el valor). */
  linea: string;
  /** Relleno de franjas y cabeceras; `none` en papel. */
  franja: string;
  /** El N° prenumerado. */
  folio: string;
  /** Tope del grosor de toda raya, en mm (en papel: finas, para ver si caen sobre las del talonario). */
  grosorMax?: number;
}

/** Letra de la imprenta (sans), la misma en pantalla y en papel. */
export const FUENTE_PLANTILLA = "Arial, Helvetica, sans-serif";
export const MM_POR_PT = 25.4 / 72;
/** Punteado del renglón: puntos de 0,4 mm cada 0,9 mm (el de la imprenta). */
const PUNTEADO = "0.4 0.5";
const ANCLA = { izq: "start", centro: "middle", der: "end" } as const;

/** Pantalla: los tokens del talonario (cambian solos con el tema). */
export const ESTILO_PANTALLA: EstiloPlantilla = {
  tinta: "var(--gtf-tinta)",
  linea: "var(--gtf-linea)",
  franja: "var(--gtf-franja)",
  folio: "var(--gtf-folio)",
};

export type TintaPapel = "gris" | "celeste";

/**
 * Papel blanco: gris oscuro (se distingue de las rayas celestes del talonario
 * al ponerla encima) o celeste (la de la imprenta). Sin rellenos y con rayas de
 * 0,2 mm como máximo.
 */
export const ESTILO_PAPEL: Record<TintaPapel, EstiloPlantilla> = {
  gris: { tinta: "#3d3d3d", linea: "#7a7a7a", franja: "none", folio: "#3d3d3d", grosorMax: 0.2 },
  celeste: { tinta: "#16759f", linea: "#5aa9cc", franja: "none", folio: "#c2272d", grosorMax: 0.2 },
};

/** mm con 3 decimales y sin ceros de más. */
const n = (v: number): string => String(Math.round(v * 1000) / 1000);

function colorDeTexto(e: EstiloPlantilla, tinta: TintaPlantilla | undefined): string {
  return tinta === "folio" ? e.folio : e.tinta;
}

/** Un trazo de la plantilla como elemento SVG. */
export function trazoSvg(t: TrazoPlantilla, e: EstiloPlantilla): string {
  const grosor = (v: number): string => n(e.grosorMax != null ? Math.min(v, e.grosorMax) : v);
  switch (t.t) {
    case "linea": {
      /* Las rayas finas (punteados y renglones de la tabla) van más claras: encima se lee el valor. */
      const fina = !!t.punteado || t.grosor <= 0.2;
      const ancho = t.punteado ? Math.max(t.grosor, 0.3) : t.grosor;
      const punteado = t.punteado ? ` stroke-dasharray="${PUNTEADO}" stroke-linecap="round"` : "";
      return `<line x1="${n(t.x1)}" y1="${n(t.y1)}" x2="${n(t.x2)}" y2="${n(t.y2)}" stroke="${fina ? e.linea : e.tinta}" stroke-width="${grosor(ancho)}"${punteado}/>`;
    }
    case "rect":
      return `<rect x="${n(t.x)}" y="${n(t.y)}" width="${n(t.w)}" height="${n(t.h)}"${t.radio ? ` rx="${n(t.radio)}"` : ""} fill="${t.relleno ? e.franja : "none"}" stroke="${e.tinta}" stroke-width="${grosor(t.grosor)}"/>`;
    case "casilla":
      return `<rect x="${n(t.x)}" y="${n(t.y)}" width="${n(t.w)}" height="${n(t.h)}" fill="none" stroke="${e.tinta}" stroke-width="${grosor(0.3)}"/>`;
    case "texto": {
      /* Con `ancho`, el texto se estira o encoge a su medida del papel: no corre al renglón de al lado. */
      const medida = t.ancho ? ` textLength="${n(t.ancho)}" lengthAdjust="spacingAndGlyphs"` : "";
      return `<text x="${n(t.x)}" y="${n(t.y)}" font-size="${n(t.pt * MM_POR_PT)}" font-weight="${t.peso ?? 400}" text-anchor="${ANCLA[t.alinea ?? "izq"]}" fill="${colorDeTexto(e, t.tinta)}"${medida}>${esc(t.s)}</text>`;
    }
  }
}

/** Los trazos de la hoja, uno detrás de otro (el contenido de un `<svg>` o `<g>` en mm). */
export function trazosPlantillaSvg(p: PlantillaHoja, e: EstiloPlantilla): string {
  return p.trazos.map((t) => trazoSvg(t, e)).join("");
}

/** La plantilla en un grupo con su letra (para meterla en otro SVG, como la hoja de prueba). */
export function grupoPlantillaSvg(p: PlantillaHoja, e: EstiloPlantilla): string {
  return `<g data-plantilla-talonario="1" font-family="${FUENTE_PLANTILLA}">${trazosPlantillaSvg(p, e)}</g>`;
}
