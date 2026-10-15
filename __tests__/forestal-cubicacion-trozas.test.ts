/**
 * Cubicación de trozas (rolliza) por Smalian SERFOR — la herramienta con la que
 * se verifica en patio lo que declara la GTF antes de firmar el ingreso.
 */
import { describe, expect, it } from "vitest";
import {
  clasificarTrozaPorDiametro, compararConGtf, cubicarTroza, partirEnTrozas, tipoDeTroza, totalesTrozas,
} from "@/lib/forestal/cubicacion-trozas";
import { smalianVolume, volumenSerforCm } from "@/lib/forestal/loth-constants";

describe("cubicarTroza (Smalian SERFOR, ADR-492)", () => {
  it("0.7854 × Ø medio² × largo — no el promedio de las áreas (la pura daba 0.4830)", () => {
    // D1=40cm, D2=50cm, L=3m → 0.7854 · 0.45² · 3 = 0.4771 m³
    expect(cubicarTroza(40, 3, 50)).toBe(0.4771);
  });

  it("es la misma cuenta que smalianVolume del Libro TH (una sola fuente)", () => {
    expect(cubicarTroza(62, 4, 50)).toBe(smalianVolume(0.62, 0.5, 4));
    expect(volumenSerforCm(62, 50, 4)).toBe(smalianVolume(0.62, 0.5, 4));
  });

  it("con un solo diámetro colapsa al cilindro", () => {
    // D=40cm, L=3m → 0.7854·0.4²·3 = 0.377 m³
    expect(cubicarTroza(40, 3)).toBeCloseTo(0.377, 3);
    expect(cubicarTroza(40, 3, 0)).toBeCloseTo(cubicarTroza(40, 3), 6);
  });

  it("medidas inválidas dan 0, no NaN", () => {
    expect(cubicarTroza(0, 3)).toBe(0);
    expect(cubicarTroza(40, 0)).toBe(0);
  });

  it("una troza grande de la selva: 80/90 cm × 8 m", () => {
    // 0.7854 · 0.85² · 8 = 4.5396 m³ (la pura daba 4.5553)
    expect(cubicarTroza(80, 8, 90)).toBe(4.5396);
  });
});

describe("Smalian SERFOR: la constante es 0.7854 exacta (ADR-492)", () => {
  it("62 y 50 cm × 4 m = 0.7854 × 0.56² × 4 = 0.9852 m³", () => {
    expect(volumenSerforCm(62, 50, 4)).toBe(0.9852);
    expect(smalianVolume(0.62, 0.5, 4)).toBe(Math.round(0.7854 * 0.56 * 0.56 * 4 * 10000) / 10000);
  });

  it("no usa π/4: con 100 cm × 100 m la diferencia se ve en el 4.º decimal", () => {
    // 0.7854 · 1² · 100 = 78.54 exacto; π/4 daría 78.5398.
    expect(volumenSerforCm(100, 100, 100)).toBe(78.54);
  });

  it("sin D2 (o en 0) la troza es pareja: D2 = D1", () => {
    expect(volumenSerforCm(60, null, 5)).toBe(volumenSerforCm(60, 60, 5));
    expect(volumenSerforCm(60, 0, 5)).toBe(volumenSerforCm(60, 60, 5));
    expect(volumenSerforCm(0, 60, 5)).toBe(0);
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

describe("categoría por diámetro (tipo de troza)", () => {
  it("clasifica por el diámetro MENOR: delgada, media, gruesa", () => {
    expect(clasificarTrozaPorDiametro(20)).toBe("Delgada");
    expect(clasificarTrozaPorDiametro(24.9)).toBe("Delgada");
    expect(clasificarTrozaPorDiametro(25)).toBe("Media");
    expect(clasificarTrozaPorDiametro(40)).toBe("Media");
    expect(clasificarTrozaPorDiametro(40.1)).toBe("Gruesa");
    expect(clasificarTrozaPorDiametro(80)).toBe("Gruesa");
  });

  it("tipoDeTroza: el forzado a mano gana sobre la categoría derivada", () => {
    expect(tipoDeTroza({ d1: 80 })).toBe("Gruesa");
    expect(tipoDeTroza({ d1: 80, tipo: "Delgada" })).toBe("Delgada");
  });
});
