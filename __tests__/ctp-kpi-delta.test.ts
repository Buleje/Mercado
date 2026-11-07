/**
 * El delta que cuelga de cada flecha verde o roja de las siete pestañas.
 *
 * Se prueba la cuenta sola porque en pantalla depende de que exista un período
 * anterior con datos: en el tenant de prueba varias ventanas están en cero y el
 * caso que hay que cuidar —no inventar una lectura— no se ve.
 */

import { describe, it, expect } from "vitest";
import { deltaDeKpi } from "@/components/admin/forestal/CtpKpi";

describe("deltaDeKpi", () => {
  it("porcentaje: la variación contra el período anterior", () => {
    expect(deltaDeKpi(120, 100)).toBe(20);
    expect(deltaDeKpi(80, 100)).toBe(-20);
    expect(deltaDeKpi(100, 100)).toBe(0);
  });

  it("no inventa una lectura contra cero: «+∞ %» es dividir, no comparar", () => {
    expect(deltaDeKpi(50, 0)).toBeNull();
  });

  it("sin período anterior no hay delta", () => {
    expect(deltaDeKpi(50, null)).toBeNull();
    expect(deltaDeKpi(50, undefined)).toBeNull();
    expect(deltaDeKpi(null, 40)).toBeNull();
  });

  it("puntos: de 53 % a 56 % son 3 puntos, no «+5.7 %»", () => {
    expect(deltaDeKpi(56, 53, "puntos")).toBe(3);
    expect(deltaDeKpi(53, 56, "puntos")).toBe(-3);
  });

  it("en puntos sí se puede comparar contra cero: la resta no divide", () => {
    expect(deltaDeKpi(12, 0, "puntos")).toBe(12);
  });

  it("descarta lo que no es un número finito en vez de propagar NaN", () => {
    expect(deltaDeKpi(Number.NaN, 10)).toBeNull();
    expect(deltaDeKpi(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
