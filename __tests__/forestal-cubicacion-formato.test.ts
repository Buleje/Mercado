/**
 * Cómo se escriben los números del lote: pie tablar ENTERO y m³ con TRES
 * decimales. Es la regla que pidió el patio y la que declara SERFOR — si un
 * componente vuelve a inventarse su propio `toLocaleString`, esto lo delata.
 */
import { describe, expect, it } from "vitest";
import {
  fmtM3, fmtPct, fmtPctSigno, fmtPiezas, fmtPt, fmtPtSigno, fmtSoles, fmtSolesSigno,
} from "@/lib/forestal/cubicacion-formato";

describe("pie tablar", () => {
  it("se muestra entero, sin decimales", () => {
    expect(fmtPt(1234.56)).toBe("1,235");
    expect(fmtPt(26.67)).toBe("27");
    expect(fmtPt(0)).toBe("0");
  });

  it("no escribe «−0» cuando el número es casi cero", () => {
    expect(fmtPt(-0.2)).toBe("0");
    expect(fmtPtSigno(-0.2)).toBe("0");
    expect(fmtPtSigno(0.4)).toBe("0");
  });

  it("marca el signo de las variaciones", () => {
    expect(fmtPtSigno(120.4)).toBe("+120");
    expect(fmtPtSigno(-45.6)).toBe("-46");
  });
});

describe("volumen", () => {
  it("siempre lleva tres decimales, aunque sean ceros", () => {
    expect(fmtM3(0.5)).toBe("0.500");
    expect(fmtM3(12)).toBe("12.000");
  });

  it("redondea al milímetro cúbico y no más allá", () => {
    expect(fmtM3(32.80349)).toBe("32.803");
    expect(fmtM3(1234.5678)).toBe("1,234.568");
  });
});

describe("dinero, porcentajes y piezas", () => {
  it("el dinero va a dos decimales, como la factura", () => {
    expect(fmtSoles(1234.5)).toBe("1,234.50");
    expect(fmtSolesSigno(12)).toBe("+12.00");
    expect(fmtSolesSigno(-12)).toBe("-12.00");
  });

  it("los porcentajes llevan un decimal", () => {
    expect(fmtPct(33.333)).toBe("33.3");
    expect(fmtPctSigno(2.55)).toBe("+2.6");
  });

  it("una pieza prorrateada se marca con «≈»", () => {
    expect(fmtPiezas(12)).toBe("12");
    expect(fmtPiezas(0.19)).toBe("≈ 0.19");
  });
});
