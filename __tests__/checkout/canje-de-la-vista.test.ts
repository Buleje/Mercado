/**
 * Canje de puntos de la vista previa (2026-10-08): mismas reglas que el
 * servidor (`maxPuntosCanjeables`, `solesPorPuntos`, 100 pts = S/ 1, tope 50 %).
 */
import { describe, it, expect } from "vitest";
import { canjeDeLaVista } from "@/components/checkout/hooks/checkout-submit-helpers";
import { maxPuntosCanjeables, solesPorPuntos, calcularTotalPedido } from "@/lib/pricing/total-pedido";

const verificado = { points: 2000, redemptionSoles: 0, sesionVerificada: true, telefono: "987654321" };

describe("reglas del canje", () => {
  it("100 pts = S/ 1 y 1 pt = 1 céntimo", () => {
    expect(solesPorPuntos(100)).toBe(1);
    expect(solesPorPuntos(1)).toBe(0.01);
    expect(solesPorPuntos(0)).toBe(0);
    expect(solesPorPuntos(-50)).toBe(0);
  });
  it("tope = el menor entre el saldo y el 50 % del total sin puntos", () => {
    expect(maxPuntosCanjeables(2000, 11)).toBe(550);
    expect(maxPuntosCanjeables(300, 11)).toBe(300);
    expect(maxPuntosCanjeables(0, 11)).toBe(0);
    expect(maxPuntosCanjeables(2000, 0)).toBe(0);
    expect(maxPuntosCanjeables(2000, 11.97)).toBe(599); // 5,985 → 5,99 al céntimo
  });
});

describe("canjeDeLaVista", () => {
  it("el deslizador va de a S/ 1 y no pasa del tope", () => {
    const v = canjeDeLaVista({ ...verificado, redemptionSoles: 9 }, "987654321", 11);
    expect(v).toEqual({ disponible: true, maxSoles: 5, puntos: 500, soles: 5 });
    expect(calcularTotalPedido({ subtotal: 11, descuentoPuntos: v.soles })).toBe(6);
  });
  it("+51 y espacios cuentan como el mismo teléfono", () => {
    expect(canjeDeLaVista({ ...verificado, redemptionSoles: 1 }, "+51 987 654 321", 11).puntos).toBe(100);
  });
  it.each([
    ["sin sesión verificada", { ...verificado, sesionVerificada: false }, "987654321"],
    ["sesión aún sin saber", { ...verificado, sesionVerificada: null }, "987654321"],
    ["los puntos son de OTRO teléfono", verificado, "912345678"],
    ["sin teléfono en el pedido", verificado, undefined],
  ])("%s → no hay canje", (_c, loyalty, tel) => {
    expect(canjeDeLaVista({ ...loyalty, redemptionSoles: 3 }, tel, 11)).toEqual({
      disponible: false,
      maxSoles: 0,
      puntos: 0,
      soles: 0,
    });
  });
});
