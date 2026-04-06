/**
 * __tests__/currency-extended.test.ts
 *
 * Extended unit tests for lib/currency.ts
 * Covers: formatCurrency, formatCurrencyCompact, parseCurrency,
 * calculateDiscount, applyDiscount, formatPriceRange, roundPrice, isValidPrice,
 * formatCurrencyForReceipt.
 */

import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatCurrencyCompact,
  parseCurrency,
  calculateDiscount,
  applyDiscount,
  formatPriceRange,
  roundPrice,
  isValidPrice,
  formatCurrencyForReceipt,
  CURRENCY_CONFIG,
} from "@/lib/currency";

// ── CURRENCY_CONFIG ───────────────────────────────────────────────────────────

describe("CURRENCY_CONFIG", () => {
  it("uses PEN code and S/ symbol", () => {
    expect(CURRENCY_CONFIG.code).toBe("PEN");
    expect(CURRENCY_CONFIG.symbol).toBe("S/");
  });
});

// ── formatCurrency ────────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats a basic amount with S/ prefix", () => {
    const result = formatCurrency(25.5);
    expect(result).toContain("S/");
    expect(result).toContain("25");
  });

  it("formats zero correctly", () => {
    expect(formatCurrency(0)).toContain("0.00");
  });

  it("omits symbol when withSymbol is false", () => {
    const result = formatCurrency(25.5, { withSymbol: false });
    expect(result).not.toContain("S/");
    expect(result).toContain("25");
  });

  it("returns 'S/ 0.00' for null input", () => {
    expect(formatCurrency(null)).toBe("S/ 0.00");
  });

  it("returns 'S/ 0.00' for undefined input", () => {
    expect(formatCurrency(undefined)).toBe("S/ 0.00");
  });

  it("returns 'S/ 0.00' for NaN string", () => {
    expect(formatCurrency("not-a-number")).toBe("S/ 0.00");
  });

  it("parses a numeric string correctly", () => {
    const result = formatCurrency("50.75");
    expect(result).toContain("50");
  });

  it("uses custom decimal places when specified", () => {
    const result = formatCurrency(25.5, { withSymbol: false, decimals: 0 });
    expect(result).not.toContain(".");
  });
});

// ── formatCurrencyCompact ─────────────────────────────────────────────────────

describe("formatCurrencyCompact", () => {
  it("shows 'K' suffix for thousands", () => {
    expect(formatCurrencyCompact(1200)).toContain("K");
  });

  it("shows exact K value (1K for 1000)", () => {
    const result = formatCurrencyCompact(1000);
    expect(result).toContain("1K");
  });

  it("shows 'M' suffix for millions", () => {
    expect(formatCurrencyCompact(4_500_000)).toContain("M");
  });

  it("shows rounded number for amounts below 1000", () => {
    const result = formatCurrencyCompact(850);
    expect(result).toContain("850");
    expect(result).not.toContain("K");
  });

  it("returns 'S/ 0' for null", () => {
    expect(formatCurrencyCompact(null)).toBe("S/ 0");
  });

  it("includes S/ prefix", () => {
    expect(formatCurrencyCompact(5000)).toContain("S/");
  });
});

// ── parseCurrency ─────────────────────────────────────────────────────────────

describe("parseCurrency", () => {
  it("parses 'S/ 25.50' correctly", () => {
    expect(parseCurrency("S/ 25.50")).toBe(25.5);
  });

  it("parses '1,250.00' (US format) correctly", () => {
    expect(parseCurrency("1,250.00")).toBe(1250);
  });

  it("returns 0 for null", () => {
    expect(parseCurrency(null)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseCurrency("")).toBe(0);
  });

  it("returns 0 for invalid string", () => {
    expect(parseCurrency("invalid")).toBe(0);
  });

  it("parses comma-decimal format '25,50'", () => {
    expect(parseCurrency("25,50")).toBeCloseTo(25.5);
  });
});

// ── calculateDiscount ─────────────────────────────────────────────────────────

describe("calculateDiscount", () => {
  it("calculates 20% of 100 as 20", () => {
    expect(calculateDiscount(100, 20)).toBe(20);
  });

  it("calculates 10% of 50 as 5", () => {
    expect(calculateDiscount(50, 10)).toBe(5);
  });

  it("returns 0 when price is 0", () => {
    expect(calculateDiscount(0, 20)).toBe(0);
  });

  it("returns 0 when discountPercent is 0", () => {
    expect(calculateDiscount(100, 0)).toBe(0);
  });

  it("returns full price when discountPercent > 100", () => {
    expect(calculateDiscount(100, 150)).toBe(100);
  });

  it("returns 0 when price is negative", () => {
    expect(calculateDiscount(-10, 20)).toBe(0);
  });
});

// ── applyDiscount ─────────────────────────────────────────────────────────────

describe("applyDiscount", () => {
  it("returns 80 for 100 with 20% discount", () => {
    expect(applyDiscount(100, 20)).toBe(80);
  });

  it("returns 45 for 50 with 10% discount", () => {
    expect(applyDiscount(50, 10)).toBe(45);
  });

  it("never returns negative price", () => {
    expect(applyDiscount(10, 110)).toBeGreaterThanOrEqual(0);
  });

  it("returns original price when discount is 0", () => {
    expect(applyDiscount(75, 0)).toBe(75);
  });
});

// ── formatPriceRange ──────────────────────────────────────────────────────────

describe("formatPriceRange", () => {
  it("returns a range string for different min/max", () => {
    const result = formatPriceRange(10, 50);
    expect(result).toContain("10");
    expect(result).toContain("50");
    expect(result).toContain("-");
  });

  it("returns a single price when min === max", () => {
    const result = formatPriceRange(25, 25);
    expect(result).not.toContain("-");
    expect(result).toContain("25");
  });
});

// ── roundPrice ────────────────────────────────────────────────────────────────

describe("roundPrice", () => {
  it("rounds to nearest 0.50 (half strategy) — above 0.25", () => {
    expect(roundPrice(12.37, "half")).toBe(12.5);
  });

  it("rounds to 0 (half strategy) — below 0.25", () => {
    expect(roundPrice(12.10, "half")).toBe(12);
  });

  it("rounds to .90 (ninety strategy)", () => {
    expect(roundPrice(12.37, "ninety")).toBe(12.9);
  });

  it("rounds to .99 (ninetynine strategy)", () => {
    expect(roundPrice(12.37, "ninetynine")).toBe(12.99);
  });

  it("rounds to nearest whole number (whole strategy)", () => {
    expect(roundPrice(12.5, "whole")).toBe(13);
    expect(roundPrice(12.4, "whole")).toBe(12);
  });

  it("defaults to 'half' strategy", () => {
    expect(roundPrice(12.37)).toBe(12.5);
  });
});

// ── isValidPrice ──────────────────────────────────────────────────────────────

describe("isValidPrice", () => {
  it("returns true for a positive price with defaults", () => {
    expect(isValidPrice(10)).toBe(true);
  });

  it("returns true for price = 0 with default min = 0", () => {
    expect(isValidPrice(0)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isValidPrice(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isValidPrice(undefined)).toBe(false);
  });

  it("returns false for NaN", () => {
    expect(isValidPrice(NaN)).toBe(false);
  });

  it("returns false when price is below min", () => {
    expect(isValidPrice(-1, 0)).toBe(false);
  });

  it("returns false when price is above max", () => {
    expect(isValidPrice(101, 0, 100)).toBe(false);
  });

  it("returns true when price is exactly at min", () => {
    expect(isValidPrice(5, 5, 100)).toBe(true);
  });

  it("returns true when price is exactly at max", () => {
    expect(isValidPrice(100, 0, 100)).toBe(true);
  });
});

// ── formatCurrencyForReceipt ──────────────────────────────────────────────────

describe("formatCurrencyForReceipt", () => {
  it("formats without thousands separator", () => {
    const result = formatCurrencyForReceipt(1250);
    expect(result).toBe("S/ 1250.00");
  });

  it("formats zero as 'S/ 0.00'", () => {
    expect(formatCurrencyForReceipt(0)).toBe("S/ 0.00");
  });

  it("returns 'S/ 0.00' for null", () => {
    expect(formatCurrencyForReceipt(null)).toBe("S/ 0.00");
  });

  it("returns 'S/ 0.00' for undefined", () => {
    expect(formatCurrencyForReceipt(undefined)).toBe("S/ 0.00");
  });

  it("parses numeric strings", () => {
    expect(formatCurrencyForReceipt("25.5")).toBe("S/ 25.50");
  });
});
