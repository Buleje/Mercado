/**
 * Fórmula Oxapampa (Brandon, 2026-09-26): pt = Dp² × L / 24.5, con las puntas
 * en pulgadas y el largo en pies. Es el pt con el que se paga la madera, el
 * flete y el servicio — si la cuenta se corre un decimal, se paga mal.
 */
import { describe, expect, it } from "vitest";
import {
  DIVISOR_OXAPAMPA,
  diametroPromedioPulg,
  ptDeTroza,
  ptOxapampa,
  redondearPt,
  resumenOxapampa,
  totalPtOxapampa,
} from "@/lib/forestal/cubicacion-oxapampa";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";

describe("ptOxapampa", () => {
  it("el ejemplo del dueño: (Dp × Dp × L) / 24.5 con Dp = promedio de las puntas", () => {
    // 18" y 22" → Dp 20"; 12 pies → 400 × 12 / 24.5 = 195.918…
    expect(DIVISOR_OXAPAMPA).toBe(24.5);
    expect(ptOxapampa({ d1Pulg: 18, d2Pulg: 22, largoPies: 12 })).toBe(195.92);
    // La pantalla lo muestra entero.
    expect(fmtPt(ptOxapampa({ d1Pulg: 18, d2Pulg: 22, largoPies: 12 })!)).toBe("196");
  });

  it("es la misma cuenta que escribirla a mano, redondeada a 2 decimales", () => {
    const dp = (23.5 + 19.25) / 2;
    expect(ptOxapampa({ d1Pulg: 23.5, d2Pulg: 19.25, largoPies: 10.5 })).toBe(
      Math.round(((dp * dp * 10.5) / 24.5) * 100) / 100,
    );
  });

  it("no depende del orden de las puntas (el tronco es cónico hacia cualquier lado)", () => {
    expect(ptOxapampa({ d1Pulg: 30, d2Pulg: 24, largoPies: 16 })).toBe(
      ptOxapampa({ d1Pulg: 24, d2Pulg: 30, largoPies: 16 }),
    );
  });

  it("con UNA sola punta no hay PT: la fórmula es el promedio de AMBAS (media medida = sin cubicar)", () => {
    expect(diametroPromedioPulg({ d1Pulg: 20 })).toBe(20);
    expect(ptOxapampa({ d1Pulg: 20, largoPies: 12 })).toBeNull();
    expect(ptOxapampa({ d1Pulg: null, d2Pulg: 20, largoPies: 12 })).toBeNull();
    /* Revisión 26-09: 22″ sola daba 237 pt, 21 % más que con 22″ y 18″ (196). */
    expect(ptOxapampa({ d1Pulg: 22, d2Pulg: 18, largoPies: 12 })).toBe(195.92);
  });

  it("sin largo o sin ninguna punta, no hay pt (null, nunca 0)", () => {
    expect(ptOxapampa({ d1Pulg: 18, d2Pulg: 22 })).toBeNull();
    expect(ptOxapampa({ d1Pulg: 18, d2Pulg: 22, largoPies: null })).toBeNull();
    expect(ptOxapampa({ largoPies: 12 })).toBeNull();
    expect(ptOxapampa({})).toBeNull();
  });

  it("un valor ≤ 0 o no numérico anula la cuenta: una punta mal tipeada no se ignora en silencio", () => {
    expect(ptOxapampa({ d1Pulg: 0, d2Pulg: 22, largoPies: 12 })).toBeNull();
    expect(ptOxapampa({ d1Pulg: -18, d2Pulg: 22, largoPies: 12 })).toBeNull();
    expect(ptOxapampa({ d1Pulg: 18, d2Pulg: 22, largoPies: 0 })).toBeNull();
    expect(ptOxapampa({ d1Pulg: 18, d2Pulg: 22, largoPies: -3 })).toBeNull();
    expect(ptOxapampa({ d1Pulg: Number.NaN, d2Pulg: 22, largoPies: 12 })).toBeNull();
    expect(ptOxapampa({ d1Pulg: 18, d2Pulg: Number.POSITIVE_INFINITY, largoPies: 12 })).toBeNull();
  });

  it("redondea a 2 decimales sin el error de coma flotante", () => {
    expect(redondearPt(1.005)).toBe(1.01);
    expect(redondearPt(195.918367)).toBe(195.92);
  });
});

describe("totalPtOxapampa y resumen", () => {
  it("suma el pt CONGELADO antes que recalcular: un cambio de fórmula no reescribe lo pagado", () => {
    // La pieza guardó 190 pt (otra fórmula de antes); sus medidas darían 195.92.
    const congelada = { oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: 190 };
    expect(ptDeTroza(congelada)).toBe(190);
    expect(totalPtOxapampa([congelada])).toBe(190);
  });

  it("si no hay pt guardado, lo saca de las medidas; las sin cubicar no suman", () => {
    const trozas = [
      { oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, oxPt: null },
      { oxD1Pulg: 20, oxD2Pulg: 20, oxLargoPies: 12 },
      /* Media medida (una sola punta) = sin cubicar. */
      { oxD1Pulg: 20, oxD2Pulg: null, oxLargoPies: 12 },
      { oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null, oxPt: null },
      {},
    ];
    expect(totalPtOxapampa(trozas)).toBe(391.84);
    expect(resumenOxapampa(trozas)).toEqual({ pt: 391.84, cubicadas: 2, sinCubicar: 3 });
  });

  it("lista vacía = 0 pt, 0 cubicadas", () => {
    expect(totalPtOxapampa([])).toBe(0);
    expect(resumenOxapampa([])).toEqual({ pt: 0, cubicadas: 0, sinCubicar: 0 });
  });
});
