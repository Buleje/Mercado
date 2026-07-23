/**
 * Cubicación de trozas (rolliza) por Smalian — la herramienta con la que se
 * verifica en patio lo que declara la GTF antes de firmar el ingreso.
 */
import { describe, expect, it } from "vitest";
import {
  compararConGtf, cubicarTroza, partirEnTrozas, totalesTrozas,
} from "@/lib/forestal/cubicacion-trozas";

describe("cubicarTroza (Smalian)", () => {
  it("promedia las áreas de las dos caras", () => {
    // D1=40cm, D2=50cm, L=3m → ((π/4·0.4² + π/4·0.5²)/2)·3 = (π/4)·0.205·3 = 0.483 m³
    expect(cubicarTroza(40, 3, 50)).toBeCloseTo(0.483, 4);
  });

  it("con un solo diámetro colapsa al cilindro", () => {
    // D=40cm, L=3m → π/4·0.4²·3 = 0.377 m³
    expect(cubicarTroza(40, 3)).toBeCloseTo(0.377, 3);
    expect(cubicarTroza(40, 3, 0)).toBeCloseTo(cubicarTroza(40, 3), 6);
  });

  it("medidas inválidas dan 0, no NaN", () => {
    expect(cubicarTroza(0, 3)).toBe(0);
    expect(cubicarTroza(40, 0)).toBe(0);
  });

  it("una troza grande de la selva: 80/90 cm × 8 m", () => {
    // ((π/4·0.8² + π/4·0.9²)/2)·8 = 4.5553 m³
    expect(cubicarTroza(80, 8, 90)).toBeCloseTo(4.5553, 3);
  });
});

describe("partirEnTrozas (dictado en tríos D1·D2·L)", () => {
  it("parte una frase larga en trozas y arrastra el resto", () => {
    const { trozas, resto } = partirEnTrozas([40, 45, 3, 50, 55, 4, 60]);
    expect(trozas).toHaveLength(2);
    expect(trozas[0]).toMatchObject({ d1: 40, d2: 45, largo: 3, sospechosa: false });
    expect(resto).toEqual([60]);
  });

  it("marca sospechosa la troza con largo imposible (¿dictado corrido?)", () => {
    const { trozas } = partirEnTrozas([40, 45, 30]); // ¿30 m de largo? no existe
    expect(trozas[0].sospechosa).toBe(true);
  });

  it("marca sospechosa la troza con diámetro de ramita", () => {
    const { trozas } = partirEnTrozas([4, 45, 3]);
    expect(trozas[0].sospechosa).toBe(true);
  });

  it("acepta decimales en el largo", () => {
    const { trozas } = partirEnTrozas([40, 42, 3.5]);
    expect(trozas[0].largo).toBe(3.5);
    expect(trozas[0].sospechosa).toBe(false);
  });
});

describe("totales y comparación contra la GTF", () => {
  const filas = [
    { id: "a", d1: 40, d2: 50, largo: 3, m3: cubicarTroza(40, 3, 50) },
    { id: "b", d1: 60, d2: 60, largo: 4, m3: cubicarTroza(60, 4) },
  ];

  it("suma m³ del lote", () => {
    const t = totalesTrozas(filas);
    expect(t.trozas).toBe(2);
    expect(t.m3).toBeCloseTo(filas[0].m3 + filas[1].m3, 4);
  });

  it("delta contra la guía: negativo = llegó menos de lo declarado", () => {
    const cmp = compararConGtf(9.5, 10);
    expect(cmp?.deltaM3).toBeCloseTo(-0.5, 4);
    expect(cmp?.deltaPct).toBeCloseTo(-5, 2);
  });

  it("sin m³ de guía no hay comparación (null, no división por cero)", () => {
    expect(compararConGtf(9.5, 0)).toBeNull();
  });
});
