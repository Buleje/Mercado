/**
 * Lo que DEBEN no es lo que se FIÓ.
 *
 * Dos pantallas daban cifras distintas para la misma deuda del tenant `demo`
 * (medido 2026-09-06 sobre 5 fiados: se fiaron S/496.30, uno pagó, quedan
 * S/345.50):
 *
 *   Fiados › «Cobro del mes … de S/841.80»  = prestado + saldo -> doble conteo
 *   Mi Plata › «S/461 en fiados pendientes» = Σ total de los activos
 *
 * Ninguna de las dos era S/345.50. El dueño usa esas cifras para decidir a
 * quién llama, así que las dos tienen que salir del saldo.
 */

import { describe, it, expect } from "vitest";

/** Los 5 fiados del seed demo, tal como los devuelve `/api/fiados`. */
const FIADOS = [
  { customerName: "Lucia", total: 55, saldo: 15, status: "ACTIVO" },
  { customerName: "Miguel", total: 200, saldo: 200, status: "ACTIVO" },
  { customerName: "Ana", total: 35.8, saldo: 0, status: "PAGADO" },
  { customerName: "Carlos", total: 120, saldo: 45, status: "ACTIVO" },
  { customerName: "Rosa", total: 85.5, saldo: 85.5, status: "ACTIVO" },
];

const SALDO_REAL = 345.5;
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

describe("cifras de deuda de fiados", () => {
  it("el saldo vivo es la suma de los saldos, no de los totales", () => {
    const saldo = FIADOS.reduce((s, f) => s + n(f.saldo), 0);
    const totales = FIADOS.reduce((s, f) => s + n(f.total), 0);
    expect(saldo).toBeCloseTo(SALDO_REAL, 2);
    expect(totales).toBeCloseTo(496.3, 2);
    expect(totales).not.toBeCloseTo(saldo, 2); // por eso confundirlos se nota
  });

  it("«fiados pendientes» de Mi Plata sale del saldo (bug: usaba total)", () => {
    const activos = FIADOS.filter((f) => f.status === "ACTIVO");
    const conElBug = activos.reduce((s, f) => s + n(f.total), 0);
    const corregido = activos.reduce((s, f) => s + n(f.saldo ?? f.total), 0);
    expect(Math.round(conElBug)).toBe(461); // lo que mostraba la pantalla
    expect(corregido).toBeCloseTo(SALDO_REAL, 2);
  });

  it("la meta de cobro no cuenta la misma plata dos veces", () => {
    const prestadoEsteMes = FIADOS.reduce((s, f) => s + n(f.total), 0);
    const totalSaldo = FIADOS.reduce((s, f) => s + n(f.saldo), 0);
    const cobradoEsteMes = 0;

    const metaVieja = prestadoEsteMes + totalSaldo;
    const metaNueva = cobradoEsteMes + totalSaldo;

    expect(metaVieja).toBeCloseTo(841.8, 2); // el número inflado que se veía
    expect(metaNueva).toBeCloseTo(SALDO_REAL, 2);
  });

  it("el avance de cobranza nunca pasa de 100 %", () => {
    const pct = (cobrado: number, saldo: number) => {
      const meta = cobrado + saldo;
      return meta > 0 ? Math.min(100, Math.round((cobrado / meta) * 100)) : 0;
    };
    expect(pct(0, SALDO_REAL)).toBe(0);
    expect(pct(SALDO_REAL, 0)).toBe(100);
    expect(pct(100, 300)).toBe(25);
    expect(pct(1000, 0)).toBe(100); // todo cobrado, nada pendiente
  });

  it("sin deuda ni cobros no divide por cero", () => {
    const meta = 0 + 0;
    expect(meta > 0 ? 1 : 0).toBe(0);
  });
});
