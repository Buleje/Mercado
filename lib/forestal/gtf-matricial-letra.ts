/**
 * La letra de TODA una hoja del talonario de una vez (Brandon 16-10: «en
 * lista y guía, individualmente, cambiar el tamaño de todos los textos»).
 * Cada hoja —guía y lista— tiene la suya: se cambia la que está abierta.
 * Subir o bajar conserva la diferencia entre valores (el título a 10 y el
 * resto a 9 siguen a un punto); «todas iguales» las deja parejas.
 */

import type { DisposicionHoja } from "./gtf-matricial-disposicion";

/** Los mismos topes que la «Letra» de un campo (`mm(5, 24)` del esquema). */
export const LETRA_HOJA_MIN_PT = 5;
export const LETRA_HOJA_MAX_PT = 24;
export const PASO_LETRA_HOJA_PT = 0.5;

const acotar = (pt: number) => Math.min(LETRA_HOJA_MAX_PT, Math.max(LETRA_HOJA_MIN_PT, Math.round(pt * 100) / 100));

/** Las letras que se imprimen: la de cada campo visible y la de la tabla si alguna columna sale. */
export function letrasDeLaHoja(h: DisposicionHoja): number[] {
  const campos = Object.values(h.campos)
    .filter((c) => c.visible)
    .map((c) => c.letraPt);
  const tabla = Object.values(h.tabla.columnas).some((c) => c.visible) ? [h.tabla.letraPt] : [];
  const todas = [...campos, ...tabla];
  return todas.length ? todas : [h.tabla.letraPt];
}

/** La letra que más se repite (con empate, la menor): lo que muestra «Todas iguales a». */
export function letraMasUsada(letras: number[]): number {
  const cuenta = new Map<number, number>();
  for (const l of letras) cuenta.set(l, (cuenta.get(l) ?? 0) + 1);
  return [...cuenta].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? LETRA_HOJA_MIN_PT;
}

/** «9 pt» o «7–10 pt». */
export function textoLetras(letras: number[]): string {
  const [min, max] = [Math.min(...letras), Math.max(...letras)];
  const f = (n: number) => String(n).replace(".", ",");
  return min === max ? `${f(min)} pt` : `${f(min)}–${f(max)} pt`;
}

export type CambioDeLetra = { sumar: number } | { igual: number };

/**
 * La letra de todos los campos (también los ocultos: si se prenden, salen
 * parejos) y de la tabla, sumada o igualada, dentro de los topes.
 */
export function letraDeTodaLaHoja(h: DisposicionHoja, cambio: CambioDeLetra): Pick<DisposicionHoja, "campos" | "tabla"> {
  const nueva = (pt: number) => acotar("igual" in cambio ? cambio.igual : pt + cambio.sumar);
  return {
    campos: Object.fromEntries(Object.entries(h.campos).map(([k, c]) => [k, { ...c, letraPt: nueva(c.letraPt) }])),
    tabla: { ...h.tabla, letraPt: nueva(h.tabla.letraPt) },
  };
}
