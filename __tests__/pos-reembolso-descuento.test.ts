/**
 * Devolución del POS con descuento global o trueque (lib/pos/reembolso.ts):
 * se devuelve lo que de verdad se cobró, nunca `price × cantidad` sin más.
 */
import { describe, it, expect } from "vitest";
import {
  baseDisponibleNotaCredito,
  calcularReembolso,
  desgloseNotaCredito,
  factorCobrado,
  planDevolucion,
  quedaPorLinea,
  topeReembolso,
} from "@/lib/pos/reembolso";

describe("calcularReembolso", () => {
  it("venta de S/ 24,90 con S/ 24,80 de trueque: devuelve como mucho S/ 0,10 (antes 24,90)", () => {
    const r = calcularReembolso({
      totalVenta: 0.1,
      lineasVenta: [{ price: 24.9, quantity: 1 }],
      devolver: [{ price: 24.9, quantity: 1 }],
    });
    expect(r.total).toBeLessThanOrEqual(0.1);
    expect(r.total).toBe(0.1);
  });

  it("trueque que cubrió todo (total 0): no se devuelve plata", () => {
    const r = calcularReembolso({
      totalVenta: 0,
      lineasVenta: [{ price: 12, quantity: 2 }],
      devolver: [{ price: 12, quantity: 2 }],
    });
    expect(r.total).toBe(0);
    expect(r.precioDevuelto(12)).toBe(0);
  });

  it("sin descuento global: devuelve price × cantidad como siempre", () => {
    const r = calcularReembolso({
      totalVenta: 30,
      lineasVenta: [{ price: 10, quantity: 2 }, { price: 5, quantity: 2 }],
      devolver: [{ price: 10, quantity: 1 }],
    });
    expect(r.factor).toBe(1);
    expect(r.total).toBe(10);
  });

  it("descuento del 10 %: cada línea se devuelve al 90 %", () => {
    const r = calcularReembolso({
      totalVenta: 27,
      lineasVenta: [{ price: 10, quantity: 2 }, { price: 5, quantity: 2 }],
      devolver: [{ price: 5, quantity: 2 }],
    });
    expect(r.total).toBe(9);
    expect(r.precioDevuelto(5)).toBeCloseTo(4.5, 10);
  });

  it("devoluciones parciales: la suma nunca pasa de lo cobrado", () => {
    const venta = { totalVenta: 10, lineasVenta: [{ price: 3.33, quantity: 3 }, { price: 0.02, quantity: 1 }] };
    const a = calcularReembolso({ ...venta, devolver: [{ price: 3.33, quantity: 3 }] });
    const b = calcularReembolso({ ...venta, devolver: [{ price: 0.02, quantity: 1 }], yaReembolsado: a.total });
    expect(Math.round((a.total + b.total) * 100)).toBeLessThanOrEqual(1000);
  });

  it("una devolución vieja que ya pagó de más deja el resto en 0", () => {
    const r = calcularReembolso({
      totalVenta: 0.1,
      lineasVenta: [{ price: 24.9, quantity: 2 }],
      devolver: [{ price: 24.9, quantity: 1 }],
      yaReembolsado: 24.9,
    });
    expect(r.total).toBe(0);
  });
});

describe("piezas", () => {
  it("factorCobrado: nunca > 1 ni < 0; suma vacía = 0", () => {
    expect(factorCobrado(50, 40)).toBe(1);
    expect(factorCobrado(-1, 40)).toBe(0);
    expect(factorCobrado(10, 0)).toBe(0);
    expect(factorCobrado(Number.NaN, 10)).toBe(0);
  });

  it("topeReembolso: redondea al céntimo y no pasa de lo que queda", () => {
    expect(topeReembolso(4.999, 10, 0)).toBe(5);
    expect(topeReembolso(8, 10, 7.5)).toBe(2.5);
    expect(topeReembolso(8, 10, 12)).toBe(0);
  });
});

describe("completaLaVenta", () => {
  it("tres tercios de S/ 10,00 suman S/ 10,00 exactos (antes 9,99)", () => {
    const venta = { totalVenta: 10, lineasVenta: [{ price: 3.34, quantity: 3 }] };
    const a = calcularReembolso({ ...venta, devolver: [{ price: 3.34, quantity: 1 }] });
    const b = calcularReembolso({ ...venta, devolver: [{ price: 3.34, quantity: 1 }], yaReembolsado: a.total });
    const c = calcularReembolso({ ...venta, devolver: [{ price: 3.34, quantity: 1 }], yaReembolsado: a.total + b.total, completaLaVenta: true });
    expect(Math.round((a.total + b.total + c.total) * 100)).toBe(1000);
  });
});

describe("planDevolucion", () => {
  const venta = [
    { productId: 1, price: 10, quantity: 2 },
    { productId: 1, price: 8, quantity: 1 },
    { productId: 2, price: 5, quantity: 1 },
  ];

  it("suma los repetidos del pedido y mide contra lo vendido menos lo devuelto", () => {
    const r = planDevolucion(venta, new Map([[1, 2]]), [{ productId: 1, qty: 1 }, { productId: 1, qty: 1 }]);
    expect(r).toEqual({ ok: false, motivo: "excede", productId: 1, pedida: 2, disponible: 1 });
  });

  it("lo ya devuelto consume las primeras líneas: lo que queda sale al precio de la última", () => {
    const r = planDevolucion(venta, new Map([[1, 2]]), [{ productId: 1, qty: 1 }]);
    expect(r.ok && r.lineas).toEqual([{ productId: 1, qty: 1, price: 8 }]);
    expect(r.ok && r.completaLaVenta).toBe(false);
  });

  it("producto ajeno a la venta = rechazo; devolver todo = completaLaVenta", () => {
    expect(planDevolucion(venta, new Map(), [{ productId: 9, qty: 1 }])).toMatchObject({ ok: false, motivo: "no_esta_en_la_venta" });
    const todo = planDevolucion(venta, new Map([[1, 1]]), [{ productId: 1, qty: 2 }, { productId: 2, qty: 1 }]);
    expect(todo.ok && todo.completaLaVenta).toBe(true);
  });

  it("quedaPorLinea: el tope de cada línea del POS", () => {
    expect(quedaPorLinea(venta, new Map([[1, 2], [2, 1]]))).toEqual([0, 1, 0]);
  });
});

describe("nota de crédito al céntimo", () => {
  it("base 8,47 → IGV 1,52 y total 9,99 (antes 9,9946)", () => {
    expect(desgloseNotaCredito({ base: 8.47 }, 0.18)).toEqual({ monto: 8.47, igv: 1.52, total: 9.99 });
  });

  it("lo devuelto con IGV manda: S/ 10,00 → 8,47 + 1,53 = 10,00", () => {
    const d = desgloseNotaCredito({ totalConIgv: 10 }, 0.18);
    expect(d).toEqual({ monto: 8.47, igv: 1.53, total: 10 });
    expect(Math.round((d.monto + d.igv) * 100)).toBe(1000);
  });

  it("negocio exonerado (tasa 0): la base es el total", () => {
    expect(desgloseNotaCredito({ totalConIgv: 23.6 }, 0)).toEqual({ monto: 23.6, igv: 0, total: 23.6 });
  });

  it("tope en base: venta de S/ 23,60 con IGV deja S/ 20,00 de base (antes dejaba 23,60)", () => {
    expect(baseDisponibleNotaCredito(23.6, 0, 0.18)).toBe(20);
    expect(baseDisponibleNotaCredito(23.6, 10, 0.18)).toBe(10);
    expect(baseDisponibleNotaCredito(23.6, 25, 0.18)).toBe(0);
  });
});
