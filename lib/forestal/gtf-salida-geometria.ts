/**
 * gtf-salida-geometria — los renglones de una hoja del talonario, en mm del
 * PAPEL y ya con el perfil de la impresora, para la salida sin navegador
 * (PDF exacto y ESC/P directo). Misma geometría que el HTML de la matricial
 * (`gtf-matricial-print.ts`), escrita una sola vez para los dos:
 *
 *   · campos: parten renglón como `white-space: pre-wrap` +
 *     `overflow-wrap: anywhere` (en el espacio; la palabra que no entra, donde
 *     caiga), a lo que entra en el ancho con la letra de la caja;
 *   · celdas de la tabla: UNA línea (invadirían la fila de abajo);
 *   · interlineado `INTERLINEA`; alineación izq/centro/der y, si el texto no
 *     entra, al inicio (CSS Text 3: lo que desborda se alinea al inicio).
 *
 * Cada renglón trae su caja (bordes ya transformados) y su ancla: cada salida
 * calcula la X con SU ancho de letra (el PDF con Courier 0,6 em; la matricial
 * con su paso fijo), así el centrado y el «a la derecha» no se corren.
 * PURO: sin DOM y sin "use client" (lo usa la ruta del servidor).
 */

import type { Alineacion, CatalogoFormato, DisposicionHoja } from "./gtf-matricial-disposicion";
import { mmPorCaracter } from "./gtf-matricial-disposicion";
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

function renglonesDeCaja(c: CajaValor, valor: string, unaLinea: boolean, t: Transformacion): RenglonSalida[] {
  const lineas = unaLinea ? [valor.replace(/\s*\r?\n\s*/g, " ")] : partirRenglones(valor, (c.anchoMm + 0.01) / mmPorCaracter(c.letraPt));
  const alto = ptAMm(c.letraPt) * INTERLINEA;
  const base = ptAMm(c.letraPt) * BASE_EM;
  return lineas.map((texto, i) => ({
    texto,
    letraPt: c.letraPt,
    alinea: c.alinea,
    izqMm: aplicarX(t, c.x),
    derMm: aplicarX(t, c.x + c.anchoMm),
    arribaMm: aplicarY(t, c.y + i * alto),
    baseMm: aplicarY(t, c.y + i * alto + base),
  }));
}

/** Los renglones de UNA hoja: lo vacío y lo oculto no salen (lo mismo que `cajasDeLaPagina`). */
export function renglonesDeLaPagina(hoja: DisposicionHoja, cat: CatalogoFormato, p: PaginaTalonario, t: Transformacion): RenglonSalida[] {
  const out: RenglonSalida[] = [];
  for (const def of cat.campos) {
    const pos = hoja.campos[def.id];
    const valor = (p.campos[def.id] ?? "").trim();
    if (!pos?.visible || !valor) continue;
    out.push(...renglonesDeCaja(pos, valor, false, t).filter((r) => r.texto !== ""));
  }
  const tabla = hoja.tabla;
  p.filas.slice(0, tabla.maxFilas).forEach((fila, i) => {
    for (const col of cat.columnas) {
      const pos = tabla.columnas[col.id];
      const valor = (fila[col.id] ?? "").trim();
      if (!pos?.visible || !valor) continue;
      const caja = { x: pos.x, y: tabla.y + i * tabla.altoFilaMm, anchoMm: pos.anchoMm, letraPt: tabla.letraPt, alinea: pos.alinea };
      out.push(...renglonesDeCaja(caja, valor, true, t));
    }
  });
  return out;
}
