/**
 * Tope EXACTO de una Nota de Crédito contra su documento (venta del POS o pedido de la tienda).
 *
 * Se compara en céntimos y CON IGV: lo que el documento cobró menos la suma de `total` de sus notas
 * activas. Antes se sumaba la base (`monto`) y se comparaba con 1 céntimo de tolerancia por el
 * redondeo de partir el IGV nota por nota; con totales no hace falta tolerancia (09-10).
 *
 * Única excepción, a favor de que cuadre: cuando la nota viene por BASE (lo que escribe el contador)
 * y esa base cabe en la base que queda, su IGV redondeado puede pasarse 1 céntimo del saldo
 * (base 8,47 de una venta de 10,00 → 8,47 + 1,53). Ahí el IGV se ajusta para cerrar el saldo exacto,
 * que es el IGV que la venta cobró. Nunca se emite más de lo que el documento cobró.
 */
import type { DesgloseNotaCredito } from "@/lib/pos/reembolso";

const aCentimos = (soles: number): number => Math.round((Number.isFinite(soles) ? soles : 0) * 100);

export interface TopeNotaCredito {
  /** `false` = la nota se pasa de lo que queda del documento: responder 400. */
  ok: boolean;
  /** Desglose a guardar (el IGV puede venir ajustado 1 céntimo para cerrar el saldo exacto). */
  desglose: DesgloseNotaCredito;
  /** Lo que queda del documento CON IGV, antes de esta nota. */
  disponibleConIgv: number;
  /** Base (sin IGV) de lo que queda, para el mensaje del contador. */
  disponible: number;
}

export function topeNotaCredito(params: {
  /** Total cobrado del documento, CON IGV (`Sale.total` / `Order.total`). */
  totalDocumento: number;
  /** Suma de `total` (con IGV) de las notas activas del documento. */
  totalYaEmitido: number;
  /** Desglose de la nota pedida (`desgloseNotaCredito`). */
  pedido: DesgloseNotaCredito;
  /** Tasa del IGV (0,18; 0 = exonerado). */
  tasa: number;
  /** La nota vino por base: se permite cerrar el saldo ajustando su IGV. */
  porBase: boolean;
}): TopeNotaCredito {
  const t = Number.isFinite(params.tasa) && params.tasa >= 0 ? params.tasa : 0;
  const dispC = Math.max(0, aCentimos(params.totalDocumento) - aCentimos(params.totalYaEmitido));
  const baseDispC = Math.round(dispC / (1 + t));
  const disponibleConIgv = dispC / 100;
  const disponible = baseDispC / 100;
  const totalC = aCentimos(params.pedido.total);
  const baseC = aCentimos(params.pedido.monto);

  if (totalC <= dispC) {
    return { ok: true, desglose: params.pedido, disponibleConIgv, disponible };
  }
  if (params.porBase && baseC > 0 && baseC <= baseDispC) {
    return {
      ok: true,
      desglose: { monto: baseC / 100, igv: (dispC - baseC) / 100, total: dispC / 100 },
      disponibleConIgv,
      disponible,
    };
  }
  return { ok: false, desglose: params.pedido, disponibleConIgv, disponible };
}
