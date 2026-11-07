/**
 * «Se parece a 4 papeles de esa carpeta»: cada papel es el conjunto de sus
 * palabras con peso (las que salen en todos los papeles del negocio pesan poco;
 * las raras, mucho) y dos papeles se parecen según cuánto peso comparten
 * (coseno). Puro, para `sugerir-carpeta.ts`.
 */

import { VACIAS, palabras } from "./sugerir-carpeta-texto";

export interface Perfil {
  id: string;
  name: string;
  palabras: Set<string>;
  norma: number;
}

/** Con las primeras ~6.000 letras alcanza para saber de qué habla un papel. */
const TOPE = 6000;

export function palabrasDe(texto: string): Set<string> {
  const s = new Set<string>();
  for (const p of palabras(texto.slice(0, TOPE))) {
    if (p.f.length >= 4 && !VACIAS.has(p.n) && !/^\d+$/.test(p.n)) s.add(p.f);
  }
  return s;
}

const peso = (t: string, df: ReadonlyMap<string, number>, n: number) => Math.log(1 + n / (1 + (df.get(t) ?? 0))) ** 2;

export function normaDe(s: ReadonlySet<string>, df: ReadonlyMap<string, number>, n: number): number {
  let suma = 0;
  for (const t of s) suma += peso(t, df, n);
  return Math.sqrt(suma);
}

/** 0 = nada en común, 1 = las mismas palabras. */
export function similitud(
  a: { palabras: ReadonlySet<string>; norma: number },
  b: { palabras: ReadonlySet<string>; norma: number },
  df: ReadonlyMap<string, number>,
  n: number,
): number {
  if (!a.norma || !b.norma) return 0;
  const [chico, grande] = a.palabras.size <= b.palabras.size ? [a.palabras, b.palabras] : [b.palabras, a.palabras];
  let comun = 0;
  for (const t of chico) if (grande.has(t)) comun += peso(t, df, n);
  return comun / (a.norma * b.norma);
}
