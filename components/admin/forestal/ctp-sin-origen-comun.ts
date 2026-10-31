/**
 * Lo chico que comparten las líneas de «¿De qué trozas salió?» y la tanda
 * (ADR-447): plurales, fechas cortas, el pie tablar y juntar guías o corridas.
 *
 * PURO y client-safe.
 */
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import type { DiagnosticoCorrida, GuiaDelArreglo } from "@/lib/forestal/vincular-trozas";

export const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const de = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
/** «AAAA-MM-DD» → «dd/mm». */
export const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** Pie tablar del producto: el m³ de la corrida sale de su cantidad (en pt, ÷ `PT_POR_M3`). */
export const ptDe = (m3: number) => m3 * PT_POR_M3;
export const sumaM3 = (cs: readonly Pick<DiagnosticoCorrida, "m3Producido">[]) =>
  r4(cs.reduce((a, c) => a + (c.m3Producido || 0), 0));
export const especiesDe = (cs: readonly Pick<DiagnosticoCorrida, "especie">[]) =>
  [...new Set(cs.map((c) => c.especie?.trim()).filter(Boolean))];
/** «a, b y c». */
export const enLista = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

/** Agrupa por una clave, en el orden en que aparece cada una. */
export function agrupar<T>(xs: readonly T[], clave: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = clave(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return [...m.entries()];
}

/**
 * Una guía que nombran varias corridas, una sola vez: sus filas juntas y la
 * llegada propuesta más temprana (la misma regla que `simularArreglos`).
 */
export function guiasUnicas(gs: readonly GuiaDelArreglo[]): GuiaDelArreglo[] {
  const por = new Map<string, GuiaDelArreglo>();
  for (const g of gs) {
    const prev = por.get(g.gtfNumber);
    if (!prev) {
      por.set(g.gtfNumber, { ...g, woodEntryIds: [...g.woodEntryIds] });
      continue;
    }
    prev.woodEntryIds = [...new Set([...prev.woodEntryIds, ...g.woodEntryIds])];
    prev.trozas = Math.max(prev.trozas, g.trozas);
    prev.m3 = Math.max(prev.m3, g.m3);
    if (g.propuesta && (!prev.propuesta || g.propuesta < prev.propuesta)) {
      prev.propuesta = g.propuesta;
      prev.fuente = g.fuente;
    }
    prev.sirve = prev.sirve || g.sirve;
  }
  return [...por.values()].sort((a, b) => a.gtfNumber.localeCompare(b.gtfNumber));
}
