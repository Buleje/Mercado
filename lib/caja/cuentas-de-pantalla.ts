/**
 * lib/caja/cuentas-de-pantalla.ts — los números que muestra la pantalla de caja.
 *
 * `CashRegisterTab` y `TurnosModule` llevaban cada una su copia de la cuenta del
 * esperado (restaban cualquier egreso, también los de Yape). Ahora las dos
 * llaman a esto, que es `saldoEsperadoDeCaja` — la función del cierre, del
 * correo y del Resumen de Mi Plata — más la línea de lo que pasó por otro
 * medio. El test `caja-mismo-esperado-en-todos-lados` cruza las cuatro.
 *
 * PURO y client-safe.
 */
import {
  lineaFueraDelCajon,
  otrosMediosDeCaja,
  saldoEsperadoDeCaja,
  type MovimientoDeCaja,
  type OtrosMedios,
} from "@/lib/caja/saldo-esperado";

export interface CuentasDePantalla {
  salesEfectivo: number;
  /** Ventas por Yape, tarjeta, fiado… */
  salesDigital: number;
  salesCount: number;
  /** Ingresos EN EFECTIVO. */
  totalIn: number;
  /** Egresos EN EFECTIVO. */
  totalOut: number;
  expectedCash: number;
  otrosMedios: OtrosMedios;
  /** «Por Yape: salieron S/ 80.00 — no está en el cajón», o `null`. */
  fueraDelCajon: string | null;
}

export function cuentasDeCajaParaPantalla(
  apertura: number,
  movimientos: ReadonlyArray<MovimientoDeCaja>,
  formato: (n: number) => string,
): CuentasDePantalla {
  const saldo = saldoEsperadoDeCaja(apertura, movimientos);
  const otrosMedios = otrosMediosDeCaja(movimientos);
  return {
    salesEfectivo: saldo.ventasEfectivo,
    salesDigital: otrosMedios.ventas,
    salesCount: movimientos.filter((m) => m.type === "venta").length,
    totalIn: saldo.ingresos,
    totalOut: saldo.egresos,
    expectedCash: saldo.esperado,
    otrosMedios,
    fueraDelCajon: lineaFueraDelCajon(otrosMedios, formato),
  };
}
