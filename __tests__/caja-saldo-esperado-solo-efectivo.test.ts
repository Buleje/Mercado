/**
 * El arqueo cuenta sólo el efectivo (F4, 3ª pasada de seguridad de ADR-448).
 *
 * Antes el cierre restaba como efectivo cualquier egreso: un adelanto pagado por
 * Yape «sacaba» del cajón plata que nunca salió de ahí, y el arqueo daba
 * faltante por el monto exacto. Ahora ingresos y egresos siguen la regla de las
 * ventas; lo que pasó por otro medio va aparte (`otrosMediosDeCaja`).
 *
 * `CashRegistersDB.close` y el Resumen de Mi Plata usan ESTA función: el caso de
 * base real que prueba que dan lo mismo está en `caja-cierre-carrera-db.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { medioDeMovimiento, otrosMediosDeCaja, saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";

describe("saldoEsperadoDeCaja — sólo el efectivo va al cajón", () => {
  it("un egreso por Yape no se resta del esperado y se ve aparte", () => {
    const movs = [
      { type: "ingreso", method: "efectivo", amount: 300 },
      { type: "egreso", method: "yape", amount: 80 },
      { type: "egreso", method: "efectivo", amount: 50 },
    ];
    const s = saldoEsperadoDeCaja(100, movs);
    expect(s).toEqual({ apertura: 100, ventasEfectivo: 0, ingresos: 300, egresos: 50, esperado: 350 });
    expect(otrosMediosDeCaja(movs)).toEqual({ ventas: 0, ingresos: 0, egresos: 80, porMetodo: { yape: { ventas: 0, ingresos: 0, egresos: 80 } } });
  });

  it("un ingreso por transferencia tampoco suma al cajón", () => {
    const movs = [
      { type: "ingreso", method: "transferencia", amount: 1200 },
      { type: "venta", method: "tarjeta", amount: 45.5 },
      { type: "venta", method: "efectivo", amount: 20 },
    ];
    expect(saldoEsperadoDeCaja(0, movs).esperado).toBe(20);
    const otros = otrosMediosDeCaja(movs);
    expect(otros.ingresos).toBe(1200);
    expect(otros.ventas).toBe(45.5);
    expect(Object.keys(otros.porMetodo).sort()).toEqual(["tarjeta", "transferencia"]);
  });

  it("el medio se lee sin mayúsculas ni espacios; vacío es efectivo (default de la columna)", () => {
    expect(medioDeMovimiento(" Efectivo ")).toBe("efectivo");
    expect(medioDeMovimiento("")).toBe("efectivo");
    expect(medioDeMovimiento("YAPE")).toBe("yape");
    const movs = [
      { type: "egreso", method: "EFECTIVO", amount: 10 },
      { type: "egreso", method: "Yape", amount: 7 },
    ];
    expect(saldoEsperadoDeCaja(0, movs).esperado).toBe(-10);
    expect(otrosMediosDeCaja(movs).porMetodo).toEqual({ yape: { ventas: 0, ingresos: 0, egresos: 7 } });
  });

  it("apertura, cierre y arqueo no mueven plata; los céntimos se redondean", () => {
    const movs = [
      { type: "apertura", method: "efectivo", amount: 50 },
      { type: "arqueo", method: "efectivo", amount: 999 },
      { type: "cierre", method: "efectivo", amount: 999 },
      { type: "venta", method: "efectivo", amount: 0.1 },
      { type: "venta", method: "efectivo", amount: 0.2 },
    ];
    expect(saldoEsperadoDeCaja(50, movs).esperado).toBe(50.3);
    expect(otrosMediosDeCaja(movs)).toEqual({ ventas: 0, ingresos: 0, egresos: 0, porMetodo: {} });
  });

  it("un medio llamado «__proto__» no toca el prototipo compartido", () => {
    const otros = otrosMediosDeCaja([{ type: "egreso", method: "__proto__", amount: 5 }]);
    expect(Object.getOwnPropertyNames(otros.porMetodo)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).egresos).toBeUndefined();
    expect(saldoEsperadoDeCaja(0, [{ type: "constructor", method: "efectivo", amount: 9 }]).esperado).toBe(0);
  });

  it("con todo en efectivo (los 13 ingresos/egresos reales de Blas y los demás negocios) el número no cambia", () => {
    /* La caja real de Blas del 28-09: 100 + 120 + 1 230 − 7 874. */
    const movs = [
      { type: "venta", method: "efectivo", amount: 120 },
      { type: "ingreso", method: "efectivo", amount: 1230 },
      { type: "egreso", method: "efectivo", amount: 7874 },
    ];
    expect(saldoEsperadoDeCaja(100, movs).esperado).toBe(-6424);
  });
});
