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
  compras: { igv: number; conIgv: number; gastos: number };
}

export type LecturaIgv =
  | { tipo: "sin_registro"; gastos: number }
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
    };

/** `null` = no se pudo leer (no es lo mismo que «no hay IGV»). */
export function leerIgv(d: IgvDelMes | null): LecturaIgv | null {
  if (!d) return null;
  const { ventas, compras } = d;
  if (ventas.comprobantes === 0 && compras.conIgv === 0) return { tipo: "sin_registro", gastos: compras.gastos };
  return {
    tipo: "registrado",
    debito: ventas.igv,
    credito: compras.igv,
    neto: Math.round((ventas.igv - compras.igv) * 100) / 100,
    comprobantes: ventas.comprobantes,
    conIgv: compras.conIgv,
    gastos: compras.gastos,
  };
}
