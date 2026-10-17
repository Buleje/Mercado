/**
 * El descuento de la venta, repartido entre sus líneas (Rentabilidad = Ganancias).
 * Caso real: `main`, venta del 09/10/2026 — Arroz Costeño 5 kg S/ 24.90 cobrado
 * S/ 0.10 (descuentoMonto 24.80, costo 18.29).
 */
import { describe, expect, it } from "vitest";
import { cobradoPorLinea, repartirDescuento } from "@/lib/finance/repartir-descuento";

const suma = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe("repartirDescuento", () => {
  it("la venta de main: S/ 24.90 cobrada S/ 0.10 cuenta S/ 0.10, no S/ 24.90", () => {
    expect(repartirDescuento([24.9], 0.1)).toEqual([0.1]);
  });

  it("dos líneas: en proporción al subtotal y la suma cierra exacta con el total", () => {
    // 30 + 10 = 40, cobrado 30 → descuento 10: 7.50 y 2.50.
    expect(repartirDescuento([30, 10], 30)).toEqual([22.5, 7.5]);
    // Con céntimos que no dividen parejo: 10 + 10 + 10 cobrado 20.00 (descuento 10.00).
    const tres = repartirDescuento([10, 10, 10], 20);
    expect(suma(tres)).toBe(20);
    // El céntimo que sobra del redondeo va a la primera línea del empate.
    expect(tres).toEqual([6.66, 6.67, 6.67]);
  });

  it("sin descuento, o con un total MAYOR (delivery), cada línea queda con su subtotal", () => {
    expect(repartirDescuento([4.5, 3.6], 8.1)).toEqual([4.5, 3.6]);
    expect(repartirDescuento([4.5, 3.6], 13.1)).toEqual([4.5, 3.6]);
  });

  it("un descuento mayor que las líneas no deja montos negativos", () => {
    expect(repartirDescuento([5, 5], -3)).toEqual([0, 0]);
  });
});

describe("cobradoPorLinea", () => {
  it("reparte cada documento por separado y respeta el orden de las líneas", () => {
    const neto = cobradoPorLinea([
      { doc: "v1", totalDoc: 0.1, price: 24.9, quantity: 1 },
      { doc: "v2", totalDoc: 30, price: 15, quantity: 2 },
      { doc: "v2", totalDoc: 30, price: 10, quantity: 1 },
    ]);
    expect(neto).toEqual([0.1, 22.5, 7.5]);
    // Rentabilidad = Ganancias: lo cobrado por línea suma el total de cada venta.
    expect(suma(neto)).toBe(30.1);
  });
});
