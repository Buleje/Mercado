/**
 * gtf-salida-geometria — los renglones de una hoja del talonario, en mm del
 * PAPEL y ya con el perfil de la impresora, para la salida sin navegador
 * (PDF exacto y ESC/P directo). Misma geometría que el HTML de la matricial
 * (`gtf-matricial-print.ts`) y que la pantalla, escrita una sola vez:
 *
 *   · cada valor va en UNA línea (Brandon 16-10: «todos los valores siempre
 *     en línea recta por defecto»); el salto de línea del dato pasa a espacio.
 *     Con `varias` (sólo campos) se parte como `white-space: pre-wrap` +
 *     `overflow-wrap: anywhere`: en el espacio y la palabra que no entra,
 *     donde caiga;
 *   · `encajarValor`: si el valor de ESTA guía no entra en su ancho a su
 *     letra, se achica ése solo hasta que entre (`letraQueEntra`, piso
 *     `LETRA_MIN_ENCAJE_PT` = 20 cpi, el paso más angosto del ESC/P). La base
 *     se queda donde la ponía la letra de la caja: achicar no sube el texto;
 *   · interlineado `INTERLINEA`; alineación izq/centro/der y, si el texto no
 *     entra, al inicio (CSS Text 3: lo que desborda se alinea al inicio).
 *
 * Cada renglón trae su caja (bordes ya transformados) y su ancla: cada salida
 * calcula la X con SU ancho de letra (el PDF con Courier 0,6 em; la matricial
 * con su paso fijo), así el centrado y el «a la derecha» no se corren.
 * PURO: sin DOM y sin "use client" (lo usan la ruta del servidor y la pantalla).
 */

import type { Alineacion, CatalogoFormato, DisposicionHoja } from "./gtf-matricial-disposicion";
import { entraEnUnaLinea, mmPorCaracter } from "./gtf-matricial-disposicion";
import { INTERLINEA, ptAMm } from "./gtf-matricial-edicion";
import { aplicarX, aplicarY, type Transformacion } from "./gtf-matricial-perfiles";
import type { PaginaTalonario } from "./gtf-matricial-valores";

/**
 * Courier New (la del navegador): ascent 1705 y descent 615 sobre 2048. En una
 * línea de `INTERLINEA` em, la base queda a medio interlineado + ascent del
 * borde de arriba del renglón. El PDF dibuja en la base: así cae donde la
 * pantalla la mostró.
 */
const ASCENT_EM = 1705 / 2048;
const AREA_EM = (1705 + 615) / 2048;
export const BASE_EM = (INTERLINEA - AREA_EM) / 2 + ASCENT_EM;

export interface RenglonSalida {
  texto: string;
  letraPt: number;
  alinea: Alineacion;
  /** Bordes de la caja en el papel, con el perfil aplicado (mm). */
  izqMm: number;
  derMm: number;
  /** Borde de arriba del renglón y su línea de base, con el perfil (mm). */
  arribaMm: number;
  baseMm: number;
}

/** Parte un valor como lo parte el navegador con `pre-wrap` + `overflow-wrap:anywhere` en monoespaciada. */
export function partirRenglones(texto: string, maxCaracteres: number): string[] {
  const max = Math.max(1, Math.floor(maxCaracteres));
  const out: string[] = [];
  for (const parrafo of texto.split(/\r?\n/)) {
    let resto = parrafo;
    while (resto.length > max) {
      // Un espacio en la columna `max` «cuelga» fuera de la caja: se corta ahí.
      const corte = resto.lastIndexOf(" ", max);
      if (corte > 0) {
        out.push(resto.slice(0, corte));
        resto = resto.slice(corte + 1);
      } else {
        out.push(resto.slice(0, max));
        resto = resto.slice(max);
      }
    }
    out.push(resto);
  }
  return out;
}

/** La letra más chica a la que se achica un valor: 6 pt (Courier 0,6 em) = 20 cpi, el paso más angosto de la matricial. */
export const LETRA_MIN_ENCAJE_PT = 6;

/** Cómo se acomoda un valor en su caja: lo de su campo o columna. Lo que falta, de fábrica: una línea y encajar. */
export interface ModoValor {
  /** Partir en varios renglones (sólo campos). Falta = una sola línea. */
  varias?: boolean;
  /** Achicar la letra de ESTE valor si no entra. Falta = sí. */
  encajar?: boolean;
}

/** El valor en una línea: los saltos del dato pasan a espacio. */
export const enUnaLinea = (texto: string): string => texto.replace(/\s*\r?\n\s*/g, " ");

/**
 * La letra con la que `texto` entra en una línea de `anchoMm`: la de la caja
 * si entra; si no (y `encajar`), la más grande que entra, en décimas de pt
 * hacia abajo, con piso `LETRA_MIN_ENCAJE_PT` (o la de la caja, si ya es menor).
 */
export function letraQueEntra(texto: string, anchoMm: number, letraPt: number, encajar = true): number {
  if (!encajar || !texto || entraEnUnaLinea(texto, anchoMm, letraPt)) return letraPt;
  const exacta = (anchoMm + 0.01) / (texto.length * mmPorCaracter(1));
  return Math.max(Math.min(letraPt, LETRA_MIN_ENCAJE_PT), Math.floor(exacta * 10 + 1e-9) / 10);
}

/** El ancho que necesita `texto` a la letra más chica: lo justo para que entre (a la décima de mm, hacia arriba). */
export const anchoParaEntrar = (texto: string, letraPt = LETRA_MIN_ENCAJE_PT): number =>
  Math.ceil(enUnaLinea(texto).length * mmPorCaracter(letraPt) * 10 - 1e-9) / 10;

export interface Encaje {
  /** Los renglones que salen: uno solo, salvo `varias`. */
  lineas: string[];
  /** La letra con la que sale (≤ la de la caja). */
  letraPt: number;
  /** Se achicó para entrar en su ancho. */
  achicado: boolean;
  /** No entra ni achicado (o `encajar` apagado): en pantalla, amarillo. Con `varias`, nunca: se parte. */
  noEntra: boolean;
}

/** UNA fuente para «cuántos renglones y con qué letra»: pantalla, HTML de la matricial, PDF y ESC/P. */
export function encajarValor(texto: string, anchoMm: number, letraPt: number, modo: ModoValor = {}): Encaje {
  if (modo.varias) {
    const lineas = partirRenglones(texto, (anchoMm + 0.01) / mmPorCaracter(letraPt));
    return { lineas, letraPt, achicado: false, noEntra: false };
  }
  const linea = enUnaLinea(texto);
  const letra = letraQueEntra(linea, anchoMm, letraPt, modo.encajar ?? true);
  return { lineas: [linea], letraPt: letra, achicado: letra < letraPt, noEntra: !!linea && !entraEnUnaLinea(linea, anchoMm, letra) };
}

/** La X donde empieza el renglón, con el ancho de letra de quien imprime. */
export function xInicio(r: RenglonSalida, anchoCaracterMm: number): number {
  const ancho = r.texto.length * anchoCaracterMm;
  const caja = r.derMm - r.izqMm;
  if (r.alinea === "izq" || ancho >= caja) return r.izqMm;
  return r.alinea === "der" ? r.derMm - ancho : r.izqMm + (caja - ancho) / 2;
}

interface CajaValor {
  x: number;
  y: number;
  anchoMm: number;
  letraPt: number;
  alinea: Alineacion;
}

function renglonesDeCaja(c: CajaValor, valor: string, modo: ModoValor, t: Transformacion): RenglonSalida[] {
  const e = encajarValor(valor, c.anchoMm, c.letraPt, modo);
  const alto = ptAMm(e.letraPt) * INTERLINEA;
  /* La base es la de la letra de la caja: el valor achicado se apoya en el mismo renglón (su borde de arriba baja). */
  const base = ptAMm(c.letraPt) * BASE_EM;
  const arriba = base - ptAMm(e.letraPt) * BASE_EM;
  return e.lineas.map((texto, i) => ({
    texto,
    letraPt: e.letraPt,
    alinea: c.alinea,
    izqMm: aplicarX(t, c.x),
    derMm: aplicarX(t, c.x + c.anchoMm),
    arribaMm: aplicarY(t, c.y + arriba + i * alto),
    baseMm: aplicarY(t, c.y + base + i * alto),
  }));
}

/** Los renglones de UNA hoja: lo vacío y lo oculto no salen (lo mismo que `cajasDeLaPagina`). */
export function renglonesDeLaPagina(hoja: DisposicionHoja, cat: CatalogoFormato, p: PaginaTalonario, t: Transformacion): RenglonSalida[] {
  const out: RenglonSalida[] = [];
  for (const def of cat.campos) {
    const pos = hoja.campos[def.id];
    const valor = (p.campos[def.id] ?? "").trim();
    if (!pos?.visible || !valor) continue;
    out.push(...renglonesDeCaja(pos, valor, pos, t).filter((r) => r.texto !== ""));
  }
  const tabla = hoja.tabla;
  p.filas.slice(0, tabla.maxFilas).forEach((fila, i) => {
    for (const col of cat.columnas) {
      const pos = tabla.columnas[col.id];
      const valor = (fila[col.id] ?? "").trim();
      if (!pos?.visible || !valor) continue;
      const caja = { x: pos.x, y: tabla.y + i * tabla.altoFilaMm, anchoMm: pos.anchoMm, letraPt: tabla.letraPt, alinea: pos.alinea };
      out.push(...renglonesDeCaja(caja, valor, { encajar: pos.encajar }, t));
    }
  });
  return out;
}
