import { describe, it, expect } from "vitest";
import { cacaoGrade, cacaoFermentationIndex, cacaoLiquidacion, cumpleHumedad } from "@/lib/cacao/cacao-quality";

/** Lógica de calidad/liquidación de cacao (ADR-128). Referencias NTP-ISO 2451 / 1114 / 2291. */

describe("cacaoGrade — clasificación por defectos (NTP-ISO 2451) + humedad", () => {
  it("Grado I: mohoso ≤3, pizarroso ≤3, humedad ≤7.5", () => {
    expect(cacaoGrade({ pctMohoso: 1, pctPizarroso: 2, humedadPct: 6.8 })).toBe("I");
  });
  it("Grado II: dentro de los límites más altos", () => {
    expect(cacaoGrade({ pctMohoso: 4, pctPizarroso: 7, humedadPct: 8 })).toBe("II");
  });
  it("fuera_norma: excede límites del Grado II (humedad alta + mohoso/pizarroso)", () => {
    expect(cacaoGrade({ pctMohoso: 6, pctPizarroso: 12, humedadPct: 9.2 })).toBe("fuera_norma");
  });
  it("humedad sobre 8% degrada a fuera de norma aunque el corte sea bueno", () => {
    expect(cacaoGrade({ pctMohoso: 0, pctPizarroso: 0, humedadPct: 9 })).toBe("fuera_norma");
  });
  it("retorna null si no hay datos de corte ni humedad", () => {
    expect(cacaoGrade({})).toBeNull();
  });
});

describe("cacaoFermentationIndex — bien fermentado + violeta", () => {
  it("suma marrón + violeta", () => {
    expect(cacaoFermentationIndex({ pctBienFermentado: 75, pctVioleta: 18 })).toBe(93);
  });
  it("0 sin datos", () => {
    expect(cacaoFermentationIndex({})).toBe(0);
  });
});

describe("cacaoLiquidacion — (precio + premio) × peso", () => {
  it("120 kg × (9.5 + 0.5) = 1200", () => {
    expect(cacaoLiquidacion(120, 9.5, 0.5)).toBe(1200);
  });
  it("sin premio: 40 × 8 = 320", () => {
    expect(cacaoLiquidacion(40, 8)).toBe(320);
  });
  it("redondea a 2 decimales", () => {
    expect(cacaoLiquidacion(33.33, 9.99, 0)).toBe(332.97);
  });
});

describe("cumpleHumedad — meta ≤ 7% (NTP 208.040)", () => {
  it("6.8 cumple, 7.5 no", () => {
    expect(cumpleHumedad(6.8)).toBe(true);
    expect(cumpleHumedad(7.5)).toBe(false);
  });
});
