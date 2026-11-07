/**
 * Un servicio no se agota (bug real del POS, 2026-09-11).
 *
 * En el tenant real, «Aserrado de madera» —un SERVICIO de S/ 50— aparecía
 * deshabilitado y con cartel «Agotado» porque su stock es 0. El schema dice que
 * un servicio NO lleva stock; el POS lo leía como mercadería terminada en diez
 * lugares distintos.
 */

import { describe, expect, it } from "vitest";
import { estaAgotado, sePuedeVender } from "@/lib/pos/stock-vendible";

describe("estaAgotado", () => {
  it("un servicio con stock 0 se puede vender igual", () => {
    expect(estaAgotado({ type: "service", stock: 0 })).toBe(false);
    expect(sePuedeVender({ type: "service", stock: 0 })).toBe(true);
  });

  it("un servicio sin stock declarado tampoco se agota", () => {
    expect(estaAgotado({ type: "service", stock: null })).toBe(false);
    expect(estaAgotado({ type: "service" })).toBe(false);
  });

  it("la mercadería en cero SÍ está agotada — eso no cambió", () => {
    expect(estaAgotado({ type: "product", stock: 0 })).toBe(true);
    expect(estaAgotado({ stock: 0 })).toBe(true);
    expect(estaAgotado({ stock: -2 })).toBe(true);
  });

  it("la mercadería con stock se vende", () => {
    expect(estaAgotado({ type: "product", stock: 3 })).toBe(false);
  });

  it("stock null (no lo lleva) no es agotado: es «no se controla»", () => {
    expect(estaAgotado({ type: "product", stock: null })).toBe(false);
    expect(estaAgotado({})).toBe(false);
  });

  it("el tipo se compara sin importar mayúsculas: viene de la base", () => {
    expect(estaAgotado({ type: "SERVICE", stock: 0 })).toBe(false);
  });
});
