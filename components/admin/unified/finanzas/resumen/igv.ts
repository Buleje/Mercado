/**
 * Cómo se lee el IGV del mes en el Resumen: sólo lo registrado.
 *
 * Antes: ventas × 18/118 − gastos × 18/118, mostrado como «IGV a pagar». Un
 * derivado presentado como el dato (regla de la casa: nunca), con una tasa que
 * en la Amazonía puede ni aplicar. Ahora, si no hay ni un comprobante
 * electrónico ni un gasto con su IGV anotado, la pantalla lo dice.
 *
 * PURO.
 */

/** Lo que manda `/api/finanzas/igv-del-mes`. */
export interface IgvDelMes {
  mes: string;
  ventas: { igv: number; comprobantes: number };
  /** `exoneradas`: facturas del mes guardadas con IGV 0 (Ley 27037, Amazonía). */
  compras: { igv: number; conIgv: number; gastos: number; exoneradas?: number };
}

export type LecturaIgv =
  | { tipo: "sin_registro"; gastos: number }
  /**
   * Sin comprobantes emitidos y sin IGV en los gastos, PERO con facturas
   * exoneradas: «sin registro» sería falso — sí se anotó, y dice S/ 0.
   */
  | { tipo: "exoneradas"; facturas: number; gastos: number }
  | {
      tipo: "registrado";
      /** IGV de tus comprobantes (débito). */
      debito: number;
      /** IGV anotado en tus gastos (crédito). */
      credito: number;
      /** débito − crédito: positivo = a pagar; negativo = saldo a favor. */
      neto: number;
      comprobantes: number;
      conIgv: number;
      gastos: number;
      /** Facturas exoneradas del mes (IGV S/ 0): no suman crédito, pero están. */
      exoneradas: number;
    };

/** `null` = no se pudo leer (no es lo mismo que «no hay IGV»). */
export function leerIgv(d: IgvDelMes | null): LecturaIgv | null {
  if (!d) return null;
  const { ventas, compras } = d;
  const exoneradas = compras.exoneradas ?? 0;
  if (ventas.comprobantes === 0 && compras.conIgv === 0) {
    return exoneradas > 0
      ? { tipo: "exoneradas", facturas: exoneradas, gastos: compras.gastos }
      : { tipo: "sin_registro", gastos: compras.gastos };
  }
  return {
    tipo: "registrado",
    debito: ventas.igv,
    credito: compras.igv,
    neto: Math.round((ventas.igv - compras.igv) * 100) / 100,
    comprobantes: ventas.comprobantes,
    conIgv: compras.conIgv,
    gastos: compras.gastos,
    exoneradas,
  };
}

/** «Tu factura está exonerada» / «Tus 3 facturas están exoneradas». */
export function textoExoneradas(n: number): string {
  return n === 1 ? "Tu factura está exonerada" : `Tus ${n} facturas están exoneradas`;
}

/**
 * Qué decir en «IGV de tus gastos» cuando no hay crédito que sumar: exoneradas
 * (sí se anotó, y es S/ 0), sin gastos, o gastos sin el IGV anotado.
 */
export function igvDeGastosSinCredito(l: LecturaIgv): string {
  const exoneradas = l.tipo === "exoneradas" ? l.facturas : l.tipo === "registrado" ? l.exoneradas : 0;
  if (exoneradas > 0) return textoExoneradas(exoneradas);
  return l.gastos === 0 ? "Sin gastos este mes" : `Ningún gasto lo trae (0 de ${l.gastos})`;
}
