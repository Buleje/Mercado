/**
 * Lector de lo que se pega desde Excel en la planilla «Anotar D1 y D2».
 * Puro: sin React ni red. Cada línea trae `código  D1  D2 [largo …]` separado
 * por tab, `;` o espacios; acepta coma decimal y una fila de encabezado.
 *
 * Match del código: primero exacto (trim + mayúsculas); si no, sin guiones,
 * barras ni espacios. No hay más equivalencias que esas.
 */

import { MAX_DIAMETRO_CM } from "./medidas-troza";

export interface PiezaPegable {
  id: string;
  codificacion?: string | null;
  codigoPlanta?: string | null;
}

export interface MedidasPegadas {
  asignadas: Map<string, { d1: number; d2: number }>;
  /** Códigos pegados que no son de ninguna pieza de la planilla. */
  sinPieza: string[];
  /** Códigos que venían más de una vez (queda la primera línea). */
  repetidos: string[];
  /** Códigos con un D1/D2 que no es un diámetro (≤ 0 o > MAX_DIAMETRO_CM). */
  invalidas: string[];
}

const NUMERO = /^\d+(?:[.,]\d+)?$/;
const aNumero = (s: string): number => Number(s.replace(",", "."));
const exacto = (s: string) => s.trim().toUpperCase();
const flojo = (s: string) => exacto(s).replace(/[-/\s]+/g, "");

/** Parte una línea: tab o `;` si hay; si no, espacios. */
function celdas(linea: string): string[] {
  const sep = /[\t;]/.test(linea) ? /[\t;]+/ : /\s+/;
  return linea.trim().split(sep).map((c) => c.trim()).filter((c) => c !== "");
}

/** ¿El texto pegado es de varias casillas (salto de línea o tab)? */
export const pareceTablaPegada = (texto: string): boolean => /[\n\t]/.test(texto.trim());

export function leerMedidasPegadas(texto: string, piezas: readonly PiezaPegable[]): MedidasPegadas {
  const porExacto = new Map<string, string>();
  const porFlojo = new Map<string, string>();
  for (const p of piezas) {
    for (const c of [p.codificacion, p.codigoPlanta]) {
      if (!c || !c.trim()) continue;
      if (!porExacto.has(exacto(c))) porExacto.set(exacto(c), p.id);
      if (!porFlojo.has(flojo(c))) porFlojo.set(flojo(c), p.id);
    }
  }

  const out: MedidasPegadas = { asignadas: new Map(), sinPieza: [], repetidos: [], invalidas: [] };
  const vistos = new Set<string>();
  const sumar = (lista: string[], c: string) => { if (!lista.includes(c)) lista.push(c); };

  for (const linea of texto.split(/\r?\n/)) {
    const cs = celdas(linea);
    if (cs.length < 3) continue;
    const [codigo, ...resto] = cs;
    /* Las dos primeras numéricas después del código; el resto (largo…) se ignora. */
    const nums = resto.filter((c) => NUMERO.test(c)).map(aNumero);
    if (nums.length < 2) continue; // encabezado o basura
    const [d1, d2] = nums;
    const id = porExacto.get(exacto(codigo)) ?? porFlojo.get(flojo(codigo));
    if (!id) { sumar(out.sinPieza, codigo); continue; }
    if (vistos.has(id)) { sumar(out.repetidos, codigo); continue; }
    const bien = (v: number) => v > 0 && v <= MAX_DIAMETRO_CM;
    if (!bien(d1) || !bien(d2)) { sumar(out.invalidas, codigo); continue; }
    vistos.add(id);
    out.asignadas.set(id, { d1, d2 });
  }
  return out;
}
