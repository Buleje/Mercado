/**
 * lib/caja/efectivo-esperado.ts — lo que el aviso de caja abierta necesita
 * además de la fórmula del arqueo.
 *
 * La fórmula (apertura + ventas en efectivo + ingresos − egresos, todo EN
 * EFECTIVO) vive en UN solo lugar: `saldoEsperadoDeCaja`
 * (lib/caja/saldo-esperado). Acá sólo se re-exporta con el nombre que usan el
 * aviso y el arqueo, para que no nazca una segunda cuenta.
 *
 * Puro y client-safe, para testearlo.
 */

import { saldoEsperadoDeCaja, type MovimientoDeCaja, type SaldoEsperado } from "./saldo-esperado";

export type MovimientoCaja = MovimientoDeCaja;
export type CuentaCaja = SaldoEsperado;

export function cuentaEfectivoCaja(apertura: number, movimientos: Iterable<MovimientoCaja>): CuentaCaja {
  return saldoEsperadoDeCaja(apertura, Array.from(movimientos));
}

/**
 * Cuántas VENTAS hay, no cuántos movimientos: un pago mixto deja una línea por
 * medio con el mismo `saleId` (app/api/sales). Las líneas sin `saleId` (cargas
 * manuales) cuentan una cada una. Entra agrupado por `saleId`.
 */
export function contarVentas(grupos: Iterable<{ saleId: string | null; movimientos: number }>): number {
  let total = 0;
  for (const g of grupos) total += g.saleId ? 1 : Math.max(0, g.movimientos);
  return total;
}
