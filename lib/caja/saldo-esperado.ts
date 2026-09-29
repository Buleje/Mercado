/**
 * lib/caja/saldo-esperado.ts — cuánto efectivo DEBERÍA haber en una caja.
 *
 *   esperado = apertura + ventas en efectivo + ingresos − egresos
 *
 * Es la misma cuenta que hace `CashRegistersDB.close()` al cerrar (y que
 * `CashRegisterTab` y `TurnosModule` repiten en pantalla). Acá queda pura para
 * poder mostrarla con la caja todavía ABIERTA: el Resumen de Mi Plata la usa
 * como el efectivo del negocio en vez de inventarlo.
 *
 * Los movimientos `apertura`, `cierre` y `arqueo` no mueven plata: la apertura
 * ya está en `openingAmount` y el arqueo es un conteo, no una entrada.
 *
 * Medido 2026-09-28 en el negocio real: caja abierta desde el 11/06 con
 * 100 + 120 + 1 230 − 7 874 = −6 424. Tres adelantos pagados desde la caja
 * (3 642 + 3 217 + 1 000) sacaron más de lo que la caja tenía registrado: una
 * caja física no puede tener menos seis mil soles, así que el veredicto es
 * «imposible» (`veredictoArqueo`).
 *
 * PURO y client-safe.
 */

export interface MovimientoDeCaja {
  type: string;
  method: string;
  amount: number;
}

export interface SaldoEsperado {
  apertura: number;
  ventasEfectivo: number;
  ingresos: number;
  egresos: number;
  esperado: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function saldoEsperadoDeCaja(apertura: number, movimientos: ReadonlyArray<MovimientoDeCaja>): SaldoEsperado {
  let ventasEfectivo = 0;
  let ingresos = 0;
  let egresos = 0;
  for (const m of movimientos) {
    const monto = num(m.amount);
    if (m.type === "venta" && m.method === "efectivo") ventasEfectivo += monto;
    else if (m.type === "ingreso") ingresos += monto;
    else if (m.type === "egreso") egresos += monto;
  }
  const a = num(apertura);
  return {
    apertura: r2(a),
    ventasEfectivo: r2(ventasEfectivo),
    ingresos: r2(ingresos),
    egresos: r2(egresos),
    esperado: r2(a + ventasEfectivo + ingresos - egresos),
  };
}
