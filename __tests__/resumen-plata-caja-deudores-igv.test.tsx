/**
 * El Resumen de Mi Plata ya no inventa: caja real, deudores por saldo, IGV
 * sólo registrado. Los casos son los del negocio real (Blas, 2026-09-28),
 * medidos por SELECT de sólo lectura.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { saldoEsperadoDeCaja } from "@/lib/caja/saldo-esperado";
import { veredictoArqueo } from "@/lib/caja/arqueo-veredicto";
import { efectivoConocido, type CajaDelResumen as Caja } from "@/hooks/use-caja-abierta";
import { mayoresDeudores, totalQueTeDeben, mayoresAcreedores, totalQueDebes } from "@/components/admin/unified/finanzas/resumen/deudores";
import { leerIgv } from "@/components/admin/unified/finanzas/resumen/igv";
import { calcHealthScore } from "@/components/admin/finanzas/shared";
import CajaDelResumen from "@/components/admin/unified/finanzas/resumen/CajaDelResumen";

/** Los 12 movimientos de la caja abierta de Blas desde el 11/06. */
const MOVS_BLAS = [
  { type: "apertura", method: "efectivo", amount: 100 },
  { type: "venta", method: "efectivo", amount: 35 },
  { type: "ingreso", method: "efectivo", amount: 20 },
  { type: "egreso", method: "efectivo", amount: 15 },
  { type: "arqueo", method: "efectivo", amount: 140 },
  { type: "venta", method: "efectivo", amount: 50 },
  { type: "venta", method: "efectivo", amount: 35 },
  { type: "ingreso", method: "efectivo", amount: 10 },
  { type: "egreso", method: "efectivo", amount: 3642 },
  { type: "egreso", method: "efectivo", amount: 3217 },
  { type: "egreso", method: "efectivo", amount: 1000 },
  { type: "ingreso", method: "efectivo", amount: 1200 },
];

describe("caja: el efectivo sale de la caja abierta, no de ingresos × 0,3", () => {
  it("Blas: 100 + 120 + 1 230 − 7 874 = −6 424 → imposible", () => {
    const s = saldoEsperadoDeCaja(100, MOVS_BLAS);
    expect(s).toEqual({ apertura: 100, ventasEfectivo: 120, ingresos: 1230, egresos: 7874, esperado: -6424 });
    expect(veredictoArqueo({ expectedAmount: s.esperado, countedAmount: null })).toBe("imposible");
  });

  it("una venta con Yape no es efectivo de la caja; el arqueo no suma", () => {
    const s = saldoEsperadoDeCaja(50, [{ type: "venta", method: "yape", amount: 80 }, { type: "arqueo", method: "efectivo", amount: 50 }]);
    expect(s.esperado).toBe(50);
  });

  it("efectivo conocido: sólo con caja abierta y monto posible", () => {
    const base = { abierta: true as const, id: "c", desde: "2026-06-11T07:41:20.789Z", movimientos: 12, apertura: 100, ventasEfectivo: 120, ingresos: 1230, egresos: 7874 };
    expect(efectivoConocido({ ...base, esperado: -6424, veredicto: "imposible" })).toBeNull();
    expect(efectivoConocido({ ...base, esperado: 300, veredicto: "pendiente" })).toBe(300);
    expect(efectivoConocido({ abierta: false })).toBeNull();
    expect(efectivoConocido(null)).toBeNull();
  });

  it("sin efectivo la liquidez no se inventa: el puntaje sale de margen y deudas", () => {
    const sin = calcHealthScore({ ingresos: 1000, gastos: 500, efectivo: null, gastosMensuales: 500, fiadosVencidos: 0, payablesVencidos: 0 });
    expect(sin.liquidez).toBeNull();
    expect(sin.liquidezConocida).toBe(false);
    expect(sin.total).toBe(100); // 33 + 34 de 67 posibles
    const con = calcHealthScore({ ingresos: 1000, gastos: 500, efectivo: 1500, gastosMensuales: 500, fiadosVencidos: 0, payablesVencidos: 0 });
    expect(con.liquidez).toBe(3);
    expect(con.total).toBe(100);
  });
});

describe("la línea de caja del Resumen", () => {
  const uso = (caja: Caja | null, extra: Partial<{ cargando: boolean; error: boolean }> = {}) => ({
    caja, cargando: false, error: false, recargar: () => {}, ...extra,
  });

  it("caja imposible: dice qué hacer, cuánto espera y desde cuándo", () => {
    render(<CajaDelResumen {...uso({ abierta: true, id: "c", desde: "2026-06-11T07:41:20.789Z", movimientos: 12, apertura: 100, ventasEfectivo: 120, ingresos: 1230, egresos: 7874, esperado: -6424, veredicto: "imposible" })} />);
    expect(screen.getByText("Cierra o arquea la caja: espera un saldo negativo")).toBeTruthy();
    expect(screen.getByText(/−S\/ 6,424\.00/)).toBeTruthy();
    expect(screen.getByText(/abierta desde el jueves 11\/06/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cuadrar caja" })).toBeTruthy();
  });

  it("sin caja abierta lo dice, sin monto", () => {
    render(<CajaDelResumen {...uso({ abierta: false })} />);
    expect(screen.getByText("No hay una caja abierta")).toBeTruthy();
    expect(screen.queryByText(/S\//)).toBeNull();
  });

  it("si no se pudo leer, no afirma que no hay caja", () => {
    render(<CajaDelResumen {...uso(null, { error: true })} />);
    expect(screen.getByText("No se pudo leer la caja.")).toBeTruthy();
    expect(screen.queryByText("No hay una caja abierta")).toBeNull();
  });
});

describe("deudores: la tarjeta y la lista suman el SALDO", () => {
  it("Blas: fiado de 50 con 20 pagados → la lista dice 30, igual que la tarjeta", () => {
    const fiados = [{ customerName: "Cliente Blas", total: 50, saldo: 30, balance: 30, status: "ACTIVO" }];
    const ahora = new Date("2026-09-28T12:00:00Z");
    expect(totalQueTeDeben(fiados)).toBe(30);
    expect(mayoresDeudores(fiados, ahora)).toEqual([{ name: "Cliente Blas", monto: 30, vencido: false }]);
  });

  it("un fiado VENCIDO cuenta y sale marcado; uno pagado del todo no aparece", () => {
    const fiados = [
      { customerName: "Rosa", total: 150, saldo: 150, status: "VENCIDO" },
      { customerName: "Luis", total: 80, saldo: 0, status: "ACTIVO" },
    ];
    expect(mayoresDeudores(fiados, new Date())).toEqual([{ name: "Rosa", monto: 150, vencido: true }]);
  });
});

describe("proveedores: la tarjeta y la lista suman lo que FALTA pagar", () => {
  const ahora = new Date("2026-09-28T12:00:00Z");
  const cuentas = [
    { supplierName: "Maderera Ucayali", amount: 1000, paidAmount: 700, status: "parcial", dueDate: "2026-10-15" },
    { supplierName: "Grifo", amount: 250, paidAmount: 250, status: "pagado", dueDate: "2026-08-01" },
    { supplierName: "Ferretería", amount: 400, paidAmount: 0, status: "pendiente", dueDate: "2026-09-01" },
  ];

  it("1 000 con 700 pagados deben 300; la pagada no suma ni aparece", () => {
    expect(totalQueDebes(cuentas)).toBe(700); // 300 + 0 + 400 (antes: 1 650)
    expect(mayoresAcreedores(cuentas, ahora)).toEqual([
      { name: "Ferretería", monto: 400, vencido: true },
      { name: "Maderera Ucayali", monto: 300, vencido: false },
    ]);
  });
});

describe("IGV: sólo lo registrado", () => {
  it("0 comprobantes y 0 de 1 gasto con IGV → sin registro (nada de 18/118)", () => {
    expect(leerIgv({ mes: "2026-09", ventas: { igv: 0, comprobantes: 0 }, compras: { igv: 0, conIgv: 0, gastos: 1 } })).toEqual({ tipo: "sin_registro", gastos: 1 });
  });

  it("con comprobantes y gastos con IGV: débito − crédito", () => {
    const l = leerIgv({ mes: "2026-09", ventas: { igv: 180, comprobantes: 3 }, compras: { igv: 54, conIgv: 2, gastos: 5 } });
    expect(l).toMatchObject({ tipo: "registrado", debito: 180, credito: 54, neto: 126 });
  });

  it("si no se pudo leer es null, no «sin IGV»", () => {
    expect(leerIgv(null)).toBeNull();
  });
});
