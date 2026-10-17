/**
 * Textos de los avisos del Libro CTP › Ingresos y del Inicio forestal sobre
 * guías. Puro: lo comparten los componentes y el test.
 */

export interface ConteoGuiasTh {
  /** Las que se pueden traer con todo (`lista: true`). */
  listas: number;
  /** Las que no se pueden, y por qué (cada una con su motivo). */
  conMotivo: number;
}

export function contarGuiasTh(guias: readonly { lista: boolean }[]): ConteoGuiasTh {
  const listas = guias.filter((g) => g.lista).length;
  return { listas, conMotivo: guias.length - listas };
}

/** «1 guía de tu Libro TH por ingresar» / «3 guías de tu Libro TH por ingresar». */
export function textoChipGuiasTh(listas: number): string {
  return `${listas} ${listas === 1 ? "guía" : "guías"} de tu Libro TH por ingresar`;
}

/** Lo que va en el `title` del chip: las que esperan y las que no se pueden traer. */
export function detalleChipGuiasTh({ listas, conMotivo }: ConteoGuiasTh): string {
  const base = `Abre «Nuevo ingreso» con ${listas === 1 ? "la guía" : "las guías"} de tu Libro TH para traerla${listas === 1 ? "" : "s"} con todo.`;
  if (conMotivo === 0) return base;
  return `${base} ${conMotivo} más no se ${conMotivo === 1 ? "puede" : "pueden"} traer todavía; la razón sale al elegirla.`;
}

/** «1 guía sin sus papeles de ley» / «4 guías sin sus papeles de ley». */
export function textoAvisoPapeles(n: number): string {
  return `${n} ${n === 1 ? "guía" : "guías"} sin sus papeles de ley`;
}

/** De `faltantesPorGuia`: cuántas guías no tienen alguno de sus papeles de ley y cuáles. */
export function guiasSinPapeles(faltan: Record<string, readonly string[]>): string[] {
  return Object.entries(faltan)
    .filter(([, f]) => f.length > 0)
    .map(([gtf]) => gtf)
    .sort();
}
