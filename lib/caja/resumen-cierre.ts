/**
 * lib/caja/resumen-cierre.ts — los números del correo de cierre de caja.
 *
 * El correo llevaba su propia copia de la cuenta (restaba cualquier egreso, en
 * cualquier medio): con un adelanto pagado por Yape, sus renglones no sumaban
 * el «Efectivo esperado» que el mismo correo mostraba. Ahora el desglose sale de
 * `saldoEsperadoDeCaja` — la función del cierre, de la pantalla de caja y del
 * Resumen de Mi Plata — y lo de otros medios va aparte (`otrosMedios`).
 *
 * PURO: la ruta lo arma con la caja que devolvió el cierre; el test lo cruza
 * contra el cierre real.
 */
import { otrosMediosDeCaja, saldoEsperadoDeCaja, type MovimientoDeCaja, type OtrosMedios } from "@/lib/caja/saldo-esperado";

export interface CajaParaResumen {
  id: string;
  openedAt: string;
  closedAt?: string;
  openingAmount: number;
  closingAmount?: number;
  expectedAmount?: number;
  difference?: number;
  movements: ReadonlyArray<MovimientoDeCaja>;
}

export interface ResumenCierreDeCaja {
  registerId: string;
  openedAt: string;
  closedAt: string;
  openingAmount: number;
  closingAmount: number;
  /** El que fijó el cierre bajo el lock de la caja. */
  expectedAmount: number;
  difference: number;
  salesEfectivo: number;
  /** Ventas por Yape, tarjeta, fiado…: no están en el cajón. */
  salesDigital: number;
  salesCount: number;
  /** Ingresos EN EFECTIVO. */
  totalIn: number;
  /** Egresos EN EFECTIVO. */
  totalOut: number;
  /** Ingresos y egresos por otro medio: la línea «no está en el cajón». */
  otrosMedios: OtrosMedios;
  notes?: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function resumenCierreDeCaja(reg: CajaParaResumen, contado: number, notas?: string, ahora: Date = new Date()): ResumenCierreDeCaja {
  const saldo = saldoEsperadoDeCaja(reg.openingAmount, reg.movements);
  const otros = otrosMediosDeCaja(reg.movements);
  const esperado = reg.expectedAmount ?? saldo.esperado;
  return {
    registerId: reg.id,
    openedAt: reg.openedAt,
    closedAt: reg.closedAt ?? ahora.toISOString(),
    openingAmount: reg.openingAmount,
    closingAmount: reg.closingAmount ?? contado,
    expectedAmount: esperado,
    difference: reg.difference ?? r2(contado - esperado),
    salesEfectivo: saldo.ventasEfectivo,
    salesDigital: otros.ventas,
    salesCount: reg.movements.filter((m) => m.type === "venta").length,
    totalIn: saldo.ingresos,
    totalOut: saldo.egresos,
    otrosMedios: otros,
    ...(notas ? { notes: notas } : {}),
  };
}
