import { describe, expect, it } from "vitest";
import { parsearFilasTrozas } from "@/lib/forestal/cubicacion-trozas-import";
import { conVolumen, fueraDeRango } from "@/lib/forestal/cubicacion-trozas-formula";

/** La plantilla Oxapampina (08-10): Ø en pulgadas, largo en pies; quien importa recubica en PT. */
describe("importar trozas · plantilla Oxapampina", () => {
  const matriz = [
    ["Especie", "D1 (pulg)", "D2 (pulg)", "Largo (pies)", "Volumen (PT)"],
    ["Tornillo", 18, 22, 12, ""],
    ["Cedro", 20, "", 10, ""],
  ];

  it("reconoce el encabezado en pulgadas y pies y lee los números tal cual", () => {
    const r = parsearFilasTrozas(matriz);
    expect(r.errores).toEqual([]);
    expect(r.trozas.map((t) => [t.especie, t.d1, t.d2, t.largo])).toEqual([
      ["Tornillo", 18, 22, 12],
      ["Cedro", 20, 20, 10],
    ]);
  });

  it("recubicada con la fórmula Oxapampina da PT (Dp² × L ÷ 24,5) y no se marca rara", () => {
    const [t] = parsearFilasTrozas(matriz).trozas;
    const ox = conVolumen("oxapampina", t);
    expect(ox.pt).toBeCloseTo(195.92, 2); // Dp 20″ × 12′
    expect(ox.m3).toBe(0);
    expect(fueraDeRango("oxapampina", t.d1, t.d2, t.largo)).toBe(false);
  });
});
