import { describe, it, expect } from "vitest";
import { computeFinanceKpis, netoPorPagar } from "@/lib/finance/finance-kpis";

const period = { from: "2026-06-01", to: "2026-06-30" };

describe("netoPorPagar", () => {
  it("amount − paidAmount, nunca negativo", () => {
    expect(netoPorPagar({ amount: 100, paidAmount: 30, status: "parcial" })).toBe(70);
    expect(netoPorPagar({ amount: 100, paidAmount: 120, status: "parcial" })).toBe(0);
  });
  it("pagado → 0", () => {
    expect(netoPorPagar({ amount: 100, paidAmount: 0, status: "pagado" })).toBe(0);
  });
});

describe("computeFinanceKpis (fuente única)", () => {
  const rows = {
    orders: [
      { total: 100, status: "entregado", createdAt: "2026-06-10" }, // cuenta
      { total: 50, status: "confirmado", createdAt: "2026-06-15" }, // cuenta
      { total: 999, status: "pendiente", createdAt: "2026-06-15" }, // NO (status)
      { total: 999, status: "entregado", createdAt: "2026-05-15" }, // NO (fuera de período)
    ],
    sales: [
      { total: 40, createdAt: "2026-06-12" }, // cuenta
      { total: 999, createdAt: "2026-07-01" }, // NO (fuera de período)
    ],
    payables: [
      { amount: 200, paidAmount: 50, status: "parcial" }, // 150
      { amount: 80, paidAmount: 80, status: "pagado" }, // 0
    ],
    fiados: [{ saldo: 30 }, { saldo: 20 }],
    expenses: [
      { amount: 25, date: "2026-06-05" }, // cuenta
      { amount: 999, date: "2026-05-05" }, // NO (fuera)
    ],
    products: [
      { stock: 10, price: 5, costPrice: 3, active: true }, // venta 50, costo 30
      { stock: 4, price: 2, active: true }, // venta 8, costo 8 (sin costPrice → usa price)
      { stock: 99, price: 9, active: false }, // NO (inactivo)
    ],
  };

  const k = computeFinanceKpis(rows, period);

  it("ingresos = Order(concretada, en período) + Sale(en período)", () => {
    expect(k.ingresos).toBe(190); // 100 + 50 + 40
  });
  it("gastos solo del período", () => {
    expect(k.gastos).toBe(25);
  });
  it("utilidadBruta = ingresos − gastos", () => {
    expect(k.utilidadBruta).toBe(165);
  });
  it("porPagar = neto de payables (sin pagados)", () => {
    expect(k.porPagar).toBe(150);
  });
  it("deudaFiados = suma de saldos", () => {
    expect(k.deudaFiados).toBe(50);
  });
  it("stock valorizado solo de activos (venta y costo)", () => {
    expect(k.stockValorVenta).toBe(58); // 50 + 8
    expect(k.stockValorCosto).toBe(38); // 30 + 8
  });
});
