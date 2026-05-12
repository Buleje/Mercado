/**
 * __tests__/decimal-utils-full.test.ts
 *
 * Unit tests para lib/decimal-utils.ts — conversión Decimal → number.
 * CRÍTICO: este helper se usa en TODA query Prisma con campos monetarios.
 * Bug aquí = bug de dinero en TODAS las pantallas.
 */

import { describe, it, expect } from "vitest";
import {
  toNum,
  toNumOrZero,
  toFixedStr,
  toJsonNumber,
  sumDecimals,
} from "@/lib/decimal-utils";

// Mock Prisma.Decimal (no instanciamos prisma para mantener test puro)
class MockDecimal {
  constructor(private value: number) {}
  toNumber() { return this.value; }
  toFixed(d = 2) { return this.value.toFixed(d); }
  toString() { return this.value.toString(); }
}

describe("toNum — conversión base", () => {
  it("null → null", () => {
    expect(toNum(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(toNum(undefined)).toBeNull();
  });

  it("number primitivo → mismo number", () => {
    expect(toNum(19.99)).toBe(19.99);
    expect(toNum(0)).toBe(0);
    expect(toNum(-5.5)).toBe(-5.5);
  });

  it("string numérico → number parseado", () => {
    expect(toNum("19.99")).toBe(19.99);
    expect(toNum("0")).toBe(0);
    expect(toNum("-5.5")).toBe(-5.5);
  });

  it("string no numérico → null (no NaN leak)", () => {
    expect(toNum("not-a-number")).toBeNull();
    expect(toNum("abc123")).toBeNull(); // parseFloat("abc123") = NaN
  });

  it("string vacío → null", () => {
    expect(toNum("")).toBeNull();
  });

  it("Prisma.Decimal (con toNumber) → number", () => {
    const decimal = new MockDecimal(19.99);
    expect(toNum(decimal)).toBe(19.99);
  });

  it("objeto sin .toNumber() → null (no rompe)", () => {
    expect(toNum({} as unknown as null)).toBeNull();
  });
});

describe("toNumOrZero — fallback 0", () => {
  it("null → 0", () => {
    expect(toNumOrZero(null)).toBe(0);
  });

  it("undefined → 0", () => {
    expect(toNumOrZero(undefined)).toBe(0);
  });

  it("19.99 → 19.99 (passthrough)", () => {
    expect(toNumOrZero(19.99)).toBe(19.99);
  });

  it("Decimal(0) → 0 (no falso positivo de 0 como null)", () => {
    expect(toNumOrZero(new MockDecimal(0))).toBe(0);
  });

  it("string '0' → 0", () => {
    expect(toNumOrZero("0")).toBe(0);
  });

  it("string inválido → 0 (no NaN)", () => {
    expect(toNumOrZero("oops")).toBe(0);
  });
});

describe("toFixedStr — formato UI", () => {
  it("null → '0.00'", () => {
    expect(toFixedStr(null)).toBe("0.00");
  });

  it("19.99 → '19.99'", () => {
    expect(toFixedStr(19.99)).toBe("19.99");
  });

  it("19.999 → '20.00' (rounding bankers)", () => {
    expect(toFixedStr(19.999)).toBe("20.00");
  });

  it("decimals customizable", () => {
    expect(toFixedStr(19.99, 0)).toBe("20");
    expect(toFixedStr(19.99, 4)).toBe("19.9900");
  });

  it("Decimal large value (precisión PEN)", () => {
    expect(toFixedStr(new MockDecimal(99_999_999_999.99))).toBe("99999999999.99");
  });

  it("Decimal negativo (refund)", () => {
    expect(toFixedStr(-100.5)).toBe("-100.50");
  });
});

describe("toJsonNumber — alias semántico", () => {
  it("retorna lo mismo que toNumOrZero", () => {
    expect(toJsonNumber(19.99)).toBe(toNumOrZero(19.99));
    expect(toJsonNumber(null)).toBe(toNumOrZero(null));
    expect(toJsonNumber(new MockDecimal(50))).toBe(toNumOrZero(new MockDecimal(50)));
  });
});

describe("sumDecimals — suma multi-decimal", () => {
  it("retorna 0 sin argumentos", () => {
    expect(sumDecimals()).toBe(0);
  });

  it("suma 3 Decimals", () => {
    expect(sumDecimals(10, 20, 30)).toBe(60);
  });

  it("ignora null/undefined (los trata como 0)", () => {
    expect(sumDecimals(10, null, 20, undefined, 30)).toBe(60);
  });

  it("suma con mix de Prisma.Decimal + number + string", () => {
    expect(sumDecimals(new MockDecimal(10), 20, "30")).toBe(60);
  });

  it("suma con negativos (refunds)", () => {
    expect(sumDecimals(100, -50, -25)).toBe(25);
  });

  it("precisión floating-point en montos típicos (centavos)", () => {
    // 0.1 + 0.2 = 0.30000000000000004 en floating-point puro
    // sumDecimals NO corrige eso (es helper de conversión, no de aritmética exacta)
    const sum = sumDecimals(0.1, 0.2);
    expect(sum).toBeCloseTo(0.3, 5);
  });

  it("suma masiva (estress)", () => {
    const values = Array.from({ length: 1000 }, (_, i) => i + 0.01);
    const expected = (1000 * 999) / 2 + 1000 * 0.01;
    expect(sumDecimals(...values)).toBeCloseTo(expected, 1);
  });
});
