/**
 * lib/sunat/detraccion.ts
 *
 * Cálculo del SPOT (detracción) al vender MADERA — función PURA, sin I/O.
 * La importan el backend (lib/integrations/sunat.ts) y la vista previa; el
 * cliente NUNCA manda el porcentaje ni el monto (regla 6): sólo marca el bien
 * sujeto («008») y el servidor calcula todo acá.
 *
 * Cifras oficiales (citadas, NO inventadas — consultadas 18-10-2026):
 *  - Bien «Madera», Anexo II numeral 7; código del bien: Catálogo 54 UBL «008».
 *  - Tasa 4 % desde el 01-01-2015 (R.S. 343-2014/SUNAT). El XLS del anexo en
 *    sunat.gob.pe todavía dice 9 %: está desactualizado, NO usarlo.
 *  - Umbral: no se aplica si el importe de la operación es <= S/ 700,00, ni si
 *    el comprobante no da crédito fiscal (boleta) — art. 8 R.S. 183-2004/SUNAT
 *    (sustituido por art. 2 R.S. 032-2006/SUNAT).
 *  - Operaciones sujetas (Anexo 2): sólo «la venta GRAVADA con el IGV» (art. 7).
 *    Por eso una venta exonerada por la Amazonía (Ley 27037) NO lleva detracción.
 *  - Leyenda Catálogo 52 «2006»; medio de pago Catálogo 59 «001» (depósito).
 */

export const SPOT_MADERA = {
  codigoBien: "008", // Catálogo 54
  nubefactTipo: 8, // detraccion_tipo de Nubefact
  porcentaje: 4, // Anexo II num. 7, desde 01-01-2015 (R.S. 343-2014/SUNAT)
  umbralSoles: 700, // art. 8 R.S. 183-2004 (R.S. 032-2006): aplica si importe > 700
  leyenda: "2006", // Catálogo 52
  medioPago: "001", // Catálogo 59
  fuente:
    "https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones",
} as const;

export type MotivoDetraccion =
  | "aplica"
  | "importe_hasta_700"
  | "no_gravada"
  | "boleta_sin_credito_fiscal"
  | "bien_no_sujeto";

export interface DetraccionCalculada {
  aplica: boolean;
  motivo: MotivoDetraccion;
  codigoBien: "008" | null;
  /** 4 cuando aplica, 0 en el resto. */
  porcentaje: number;
  /** Importe de las líneas gravadas CON IGV (decisión técnica, la confirma el contador). */
  base: number;
  /** round2(base × 4 %). */
  monto: number;
  /** base − monto: lo que el cliente paga a Blas fuera del Banco de la Nación. */
  netoACobrar: number;
}

export interface EntradaDetraccion {
  tipoComprobante: "factura" | "boleta";
  /** Total de las líneas gravadas, con IGV incluido (de armarLineasComprobante). */
  totalGravadoConIgv: number;
  /**
   * Total del comprobante (gravada + exonerada + inafecta + IGV). Se usa para
   * `netoACobrar`: con una línea exonerada en la misma factura, el neto no es
   * base − monto. Si se omite, se asume una venta puramente gravada (= base).
   */
  total?: number;
  /** Bien sujeto a detracción. `null` = la venta no es de madera. */
  bienSujeto: "008" | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Decide si la venta lleva detracción y cuánto. Orden de las reglas:
 *  1. El bien no es madera («008»)      → bien_no_sujeto
 *  2. Boleta (no da crédito fiscal)     → boleta_sin_credito_fiscal
 *  3. Sin base gravada (exonerada/inaf) → no_gravada  (caso Amazonía, Ley 27037)
 *  4. Importe <= S/ 700                 → importe_hasta_700
 *  5. En otro caso                      → aplica (4 %)
 */
export function calcularDetraccion(i: EntradaDetraccion): DetraccionCalculada {
  const base = round2(Math.max(0, i.totalGravadoConIgv));
  // Total del comprobante; sin dato, una venta puramente gravada (= base).
  const total = round2(i.total != null ? i.total : i.totalGravadoConIgv);

  const inerte = (motivo: MotivoDetraccion): DetraccionCalculada => ({
    aplica: false,
    motivo,
    codigoBien: null,
    porcentaje: 0,
    base,
    monto: 0,
    netoACobrar: total,
  });

  if (i.bienSujeto !== SPOT_MADERA.codigoBien) return inerte("bien_no_sujeto");
  if (i.tipoComprobante === "boleta") return inerte("boleta_sin_credito_fiscal");
  if (base <= 0) return inerte("no_gravada");
  if (base <= SPOT_MADERA.umbralSoles) return inerte("importe_hasta_700");

  const monto = round2(base * (SPOT_MADERA.porcentaje / 100));
  return {
    aplica: true,
    motivo: "aplica",
    codigoBien: SPOT_MADERA.codigoBien,
    porcentaje: SPOT_MADERA.porcentaje,
    base,
    monto,
    // Neto = total del comprobante − lo depositado en el Banco de la Nación.
    netoACobrar: round2(total - monto),
  };
}
