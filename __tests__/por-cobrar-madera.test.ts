/**
 * «Todo lo que me deben» con la madera adentro.
 *
 * Desde que la guía de salida anota la venta en la cuenta corriente del cliente
 * (ADR-322), el tablero consolidado mentía por omisión: el aserradero vendía a
 * crédito y la pantalla decía cero. Lo que se prueba acá es la cuenta del
 * bucket, que es donde estaba el riesgo — un saldo NEGATIVO (plata que le
 * debemos a la parte) no puede restar de lo que nos deben.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const movs = vi.hoisted(() => ({ rows: [] as { parteId: string; tipo: string; monto: number }[] }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    fiado: { aggregate: async () => ({ _sum: { saldo: 0 }, _count: 0 }) },
    adelanto: { aggregate: async () => ({ _sum: { saldoPendiente: 0 }, _count: 0 }) },
    prestamoCuota: { aggregate: async () => ({ _sum: { monto: 0 } }) },
    prestamo: { count: async () => 0 },
    forestCuentaMov: { findMany: async () => movs.rows },
  },
}));

const { PorCobrarDB } = await import("@/lib/db/por-cobrar.db");

beforeEach(() => {
  movs.rows = [];
});

describe("la madera despachada a cuenta entra en lo que me deben", () => {
  it("suma cargos menos abonos por cliente", async () => {
    movs.rows = [
      { parteId: "a", tipo: "cargo", monto: 5000 },
      { parteId: "a", tipo: "abono", monto: 2000 },
      { parteId: "b", tipo: "cargo", monto: 1200 },
    ];
    const r = await PorCobrarDB.getSummary("t1");
    expect(r.madera).toEqual({ total: 4200, count: 2 });
    expect(r.totalGeneral).toBe(4200);
  });

  it("el cliente que ya pagó todo no cuenta como deudor", async () => {
    movs.rows = [
      { parteId: "a", tipo: "cargo", monto: 5000 },
      { parteId: "a", tipo: "abono", monto: 5000 },
    ];
    const r = await PorCobrarDB.getSummary("t1");
    expect(r.madera).toEqual({ total: 0, count: 0 });
  });

  it("un saldo a favor de la parte NO resta de lo que me deben", async () => {
    /* Le adelantamos plata a un proveedor (saldo negativo para nosotros) y otro
       cliente nos debe: el tablero de cobranza tiene que decir 1.200, no 200.
       Dos deudas de signo contrario no se compensan acá. */
    movs.rows = [
      { parteId: "proveedor", tipo: "abono", monto: 1000 },
      { parteId: "cliente", tipo: "cargo", monto: 1200 },
    ];
    const r = await PorCobrarDB.getSummary("t1");
    expect(r.madera).toEqual({ total: 1200, count: 1 });
  });

  it("sin movimientos forestales el bucket es cero y no rompe el total", async () => {
    const r = await PorCobrarDB.getSummary("t1");
    expect(r.madera).toEqual({ total: 0, count: 0 });
    expect(r.totalGeneral).toBe(0);
  });
});
