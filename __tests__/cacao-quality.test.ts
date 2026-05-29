import { describe, it, expect } from "vitest";
import { cacaoGrade, cacaoFermentationIndex, cacaoLiquidacion, cumpleHumedad, cacaoMerma, cacaoProyeccionSeco, cacaoRendimiento, MERMA_TIPICA_PCT, cacaoVentaTotalPen, cacaoVentaMargen } from "@/lib/cacao/cacao-quality";

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

describe("cacaoMerma — pérdida húmedo→seco (beneficio v2)", () => {
  it("100 kg baba → 40 kg seco = 60% merma", () => {
    expect(cacaoMerma(100, 40)).toBe(60);
  });
  it("null si el seco supera al húmedo (dato inválido)", () => {
    expect(cacaoMerma(40, 100)).toBeNull();
  });
  it("null sin datos", () => {
    expect(cacaoMerma(null, 40)).toBeNull();
  });
});

describe("cacaoProyeccionSeco — kg seco esperado desde húmedo", () => {
  it("merma típica 60%: 100 kg húmedo → 40 kg seco", () => {
    expect(cacaoProyeccionSeco(100)).toBe(40);
    expect(MERMA_TIPICA_PCT).toBe(60);
  });
  it("merma custom 55%: 200 → 90", () => {
    expect(cacaoProyeccionSeco(200, 55)).toBe(90);
  });
  it("0 si no hay peso húmedo", () => {
    expect(cacaoProyeccionSeco(0)).toBe(0);
    expect(cacaoProyeccionSeco(null)).toBe(0);
  });
  it("clamp de merma fuera de rango (no negativos)", () => {
    expect(cacaoProyeccionSeco(100, 150)).toBe(1); // merma capada a 99%
  });
});

describe("cacaoRendimiento — kg seco / kg húmedo (%)", () => {
  it("100 húmedo → 40 seco = 40%", () => {
    expect(cacaoRendimiento(100, 40)).toBe(40);
  });
  it("null si seco supera húmedo (inválido)", () => {
    expect(cacaoRendimiento(40, 100)).toBeNull();
  });
  it("null sin datos", () => {
    expect(cacaoRendimiento(null, 40)).toBeNull();
  });
});

describe("cacaoVentaTotalPen — total de venta en soles", () => {
  it("PEN: 100 kg × S/13 = S/1300", () => {
    expect(cacaoVentaTotalPen(100, 13, "PEN")).toBe(1300);
  });
  it("USD: 100 kg × US$3.5 × 3.75 = S/1312.50", () => {
    expect(cacaoVentaTotalPen(100, 3.5, "USD", 3.75)).toBe(1312.5);
  });
  it("USD sin tipo de cambio → 0 (no se puede convertir)", () => {
    expect(cacaoVentaTotalPen(100, 3.5, "USD", null)).toBe(0);
  });
  it("0 sin peso o precio", () => {
    expect(cacaoVentaTotalPen(0, 13, "PEN")).toBe(0);
    expect(cacaoVentaTotalPen(100, 0, "PEN")).toBe(0);
  });
});

describe("cacaoVentaMargen — margen bruto vs costo de acopio", () => {
  it("vendo a S/1300 lo que costó S/950 (100kg×9.5) ≈ +36.8%", () => {
    expect(cacaoVentaMargen(1300, 100, 9.5)).toBe(36.8);
  });
  it("null sin datos válidos", () => {
    expect(cacaoVentaMargen(0, 100, 9.5)).toBeNull();
    expect(cacaoVentaMargen(1300, 100, 0)).toBeNull();
  });
});
