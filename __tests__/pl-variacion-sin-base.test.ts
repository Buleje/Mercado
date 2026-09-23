import { describe, it, expect } from "vitest";

/**
 * «NaN% vs mes anterior» (visto en el tenant QA, que arranca sin ingresos).
 *
 * La tarjeta de Ganancias y pérdidas calculaba la variación como
 * `(actual - base) / base`, y con el mes anterior en **0** eso es una división
 * por cero: en pantalla salía `NaN%`. Un `+∞%` tampoco significaría nada.
 *
 * La regla: **sin base no hay variación** y la línea no se pinta. Este test fija
 * la regla; la función vive en `components/admin/PLTab.tsx`.
 */
function variacionMensual(actual?: number, base?: number): number | undefined {
  if (actual == null || base == null) return undefined;
  if (!Number.isFinite(actual) || !Number.isFinite(base) || base === 0) return undefined;
  const v = ((actual - base) / Math.abs(base)) * 100;
  return Number.isFinite(v) ? v : undefined;
}

describe("variación contra el mes anterior", () => {
  it("sin mes anterior no hay porcentaje (era «NaN%»)", () => {
    expect(variacionMensual(1000, 0)).toBeUndefined();
    expect(variacionMensual(0, 0)).toBeUndefined();
  });

  it("sin alguno de los dos meses tampoco", () => {
    expect(variacionMensual(undefined, 500)).toBeUndefined();
    expect(variacionMensual(500, undefined)).toBeUndefined();
  });

  it("con base real calcula la variación de siempre", () => {
    expect(variacionMensual(150, 100)).toBe(50);
    expect(variacionMensual(50, 100)).toBe(-50);
  });

  it("con base NEGATIVA la flecha no se invierte (divide por el valor absoluto)", () => {
    // El mes pasado se perdió 100; este mes se perdió 50 → mejoró: +50 %.
    expect(variacionMensual(-50, -100)).toBe(50);
    // Y si se perdió más, empeoró.
    expect(variacionMensual(-150, -100)).toBe(-50);
  });

  it("un dato roto no se convierte en un número inventado", () => {
    expect(variacionMensual(Number.NaN, 100)).toBeUndefined();
    expect(variacionMensual(100, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
