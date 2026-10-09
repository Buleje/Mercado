/**
 * Devolución del POS con descuento global o trueque (lib/pos/reembolso.ts):
 * se devuelve lo que de verdad se cobró, nunca `price × cantidad` sin más.
 */
import { describe, it, expect } from "vitest";
import { calcularReembolso, factorCobrado, topeReembolso } from "@/lib/pos/reembolso";

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
