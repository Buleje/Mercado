import { describe, it, expect } from "vitest";
import {
  CURRENCY_CONFIG,
  formatCurrency,
  formatCurrencyCompact,
  parseCurrency,
  calculateDiscount,
  applyDiscount,
  formatPriceRange,
  roundPrice,
  isValidPrice,
  formatCurrencyForReceipt,
} from "../lib/currency";

describe("Currency Utilities", () => {
  describe("CURRENCY_CONFIG", () => {
    it("should have correct configuration for PEN", () => {
      expect(CURRENCY_CONFIG.code).toBe("PEN");
      expect(CURRENCY_CONFIG.symbol).toBe("S/");
      expect(CURRENCY_CONFIG.locale).toBe("es-PE");
      expect(CURRENCY_CONFIG.decimals).toBe(2);
    });
  });

  describe("formatCurrency", () => {
    it("should format positive numbers correctly", () => {
      expect(formatCurrency(25.5)).toBe("S/ 25.50");
      expect(formatCurrency(100)).toBe("S/ 100.00");
      expect(formatCurrency(1250.75)).toBe("S/ 1,250.75");
    });

    it("should format zero", () => {
      expect(formatCurrency(0)).toBe("S/ 0.00");
    });

    it("should handle null and undefined", () => {
      expect(formatCurrency(null)).toBe("S/ 0.00");
      expect(formatCurrency(undefined)).toBe("S/ 0.00");
    });

    it("should handle string numbers", () => {
      expect(formatCurrency("25.5")).toBe("S/ 25.50");
      expect(formatCurrency("1250")).toBe("S/ 1,250.00");
    });

    it("should handle invalid inputs", () => {
      expect(formatCurrency("invalid")).toBe("S/ 0.00");
      expect(formatCurrency(NaN)).toBe("S/ 0.00");
    });

    it("should support withSymbol option", () => {
      expect(formatCurrency(25.5, { withSymbol: false })).toBe("25.50");
      expect(formatCurrency(1250, { withSymbol: false })).toBe("1,250.00");
    });

    it("should support custom decimals", () => {
      expect(formatCurrency(25.556, { decimals: 3 })).toBe("S/ 25.556");
      expect(formatCurrency(25.5, { decimals: 0 })).toBe("S/ 26");
    });

    it("should handle large numbers with thousands separators", () => {
      expect(formatCurrency(1000000)).toBe("S/ 1,000,000.00");
      expect(formatCurrency(123456.78)).toBe("S/ 123,456.78");
    });
  });

  describe("formatCurrencyCompact", () => {
    it("should format small numbers normally", () => {
      expect(formatCurrencyCompact(100)).toBe("S/ 100");
      expect(formatCurrencyCompact(850)).toBe("S/ 850");
    });

    it("should compact thousands", () => {
      expect(formatCurrencyCompact(1200)).toBe("S/ 1.2K");
      expect(formatCurrencyCompact(15000)).toBe("S/ 15K");
    });

    it("should compact millions", () => {
      expect(formatCurrencyCompact(1500000)).toBe("S/ 1.5M");
      expect(formatCurrencyCompact(4200000)).toBe("S/ 4.2M");
    });

    it("should handle null and invalid inputs", () => {
      expect(formatCurrencyCompact(null)).toBe("S/ 0");
      expect(formatCurrencyCompact(undefined)).toBe("S/ 0");
      expect(formatCurrencyCompact("invalid")).toBe("S/ 0");
    });
  });

  describe("parseCurrency", () => {
    it("should parse standard format", () => {
      expect(parseCurrency("S/ 25.50")).toBe(25.5);
      expect(parseCurrency("25.50")).toBe(25.5);
      expect(parseCurrency("100")).toBe(100);
    });

    it("should parse with thousands separators (US format)", () => {
      expect(parseCurrency("1,250.50")).toBe(1250.5);
      expect(parseCurrency("S/ 1,250.50")).toBe(1250.5);
    });

    it("should parse Peruvian format (period for thousands)", () => {
      expect(parseCurrency("1.250,50")).toBe(1250.5);
      expect(parseCurrency("S/ 1.250,50")).toBe(1250.5);
    });

    it("should handle comma as decimal separator", () => {
      expect(parseCurrency("25,50")).toBe(25.5);
      expect(parseCurrency("S/ 25,50")).toBe(25.5);
    });

    it("should handle null and invalid inputs", () => {
      expect(parseCurrency(null)).toBe(0);
      expect(parseCurrency(undefined)).toBe(0);
      expect(parseCurrency("")).toBe(0);
      expect(parseCurrency("invalid")).toBe(0);
    });

    it("should handle edge cases", () => {
      expect(parseCurrency("S/ 0")).toBe(0);
      expect(parseCurrency("S/ 0.00")).toBe(0);
      expect(parseCurrency("  25.50  ")).toBe(25.5);
    });
  });

  describe("calculateDiscount", () => {
    it("should calculate discount correctly", () => {
      expect(calculateDiscount(100, 20)).toBe(20);
      expect(calculateDiscount(50, 10)).toBe(5);
      expect(calculateDiscount(200, 25)).toBe(50);
    });

    it("should handle zero and negative values", () => {
      expect(calculateDiscount(100, 0)).toBe(0);
      expect(calculateDiscount(0, 20)).toBe(0);
      expect(calculateDiscount(-100, 20)).toBe(0);
      expect(calculateDiscount(100, -20)).toBe(0);
    });

    it("should cap at 100% discount", () => {
      expect(calculateDiscount(100, 100)).toBe(100);
      expect(calculateDiscount(100, 150)).toBe(100);
    });

    it("should handle decimal percentages", () => {
      expect(calculateDiscount(100, 12.5)).toBe(12.5);
      expect(calculateDiscount(80, 7.5)).toBe(6);
    });
  });

  describe("applyDiscount", () => {
    it("should apply discount correctly", () => {
      expect(applyDiscount(100, 20)).toBe(80);
      expect(applyDiscount(50, 10)).toBe(45);
      expect(applyDiscount(200, 25)).toBe(150);
    });

    it("should not go below zero", () => {
      expect(applyDiscount(100, 100)).toBe(0);
      expect(applyDiscount(100, 150)).toBe(0);
    });

    it("should handle zero discount", () => {
      expect(applyDiscount(100, 0)).toBe(100);
    });
  });

  describe("formatPriceRange", () => {
    it("should format range correctly", () => {
      expect(formatPriceRange(10, 50)).toBe("S/ 10.00 - S/ 50.00");
      expect(formatPriceRange(100, 500)).toBe("S/ 100.00 - S/ 500.00");
    });

    it("should handle same min and max", () => {
      expect(formatPriceRange(25, 25)).toBe("S/ 25.00");
    });

    it("should handle decimal ranges", () => {
      expect(formatPriceRange(10.5, 50.75)).toBe("S/ 10.50 - S/ 50.75");
    });
  });

  describe("roundPrice", () => {
    it("should round to half strategy", () => {
      expect(roundPrice(12.37, "half")).toBe(12.5);
      expect(roundPrice(12.23, "half")).toBe(12);
      expect(roundPrice(12.8, "half")).toBe(12.5);
    });

    it("should round to ninety strategy", () => {
      expect(roundPrice(12.37, "ninety")).toBe(12.9);
      expect(roundPrice(15.01, "ninety")).toBe(15.9);
    });

    it("should round to ninetynine strategy", () => {
      expect(roundPrice(12.37, "ninetynine")).toBe(12.99);
      expect(roundPrice(15.01, "ninetynine")).toBe(15.99);
    });

    it("should round to whole strategy", () => {
      expect(roundPrice(12.37, "whole")).toBe(12);
      expect(roundPrice(12.67, "whole")).toBe(13);
    });

    it("should default to half strategy", () => {
      expect(roundPrice(12.37)).toBe(12.5);
    });
  });

  describe("isValidPrice", () => {
    it("should validate positive numbers", () => {
      expect(isValidPrice(25.5)).toBe(true);
      expect(isValidPrice(100)).toBe(true);
      expect(isValidPrice(0)).toBe(true);
    });

    it("should invalidate null and undefined", () => {
      expect(isValidPrice(null)).toBe(false);
      expect(isValidPrice(undefined)).toBe(false);
      expect(isValidPrice(NaN)).toBe(false);
    });

    it("should respect min constraint", () => {
      expect(isValidPrice(5, 10)).toBe(false);
      expect(isValidPrice(10, 10)).toBe(true);
      expect(isValidPrice(15, 10)).toBe(true);
    });

    it("should respect max constraint", () => {
      expect(isValidPrice(50, 0, 100)).toBe(true);
      expect(isValidPrice(100, 0, 100)).toBe(true);
      expect(isValidPrice(150, 0, 100)).toBe(false);
    });

    it("should respect both min and max", () => {
      expect(isValidPrice(50, 10, 100)).toBe(true);
      expect(isValidPrice(5, 10, 100)).toBe(false);
      expect(isValidPrice(150, 10, 100)).toBe(false);
    });
  });

  describe("formatCurrencyForReceipt", () => {
    it("should format without thousands separator", () => {
      expect(formatCurrencyForReceipt(1250.5)).toBe("S/ 1250.50");
      expect(formatCurrencyForReceipt(25.5)).toBe("S/ 25.50");
    });

    it("should always use 2 decimals", () => {
      expect(formatCurrencyForReceipt(100)).toBe("S/ 100.00");
      expect(formatCurrencyForReceipt(25)).toBe("S/ 25.00");
    });

    it("should handle string inputs", () => {
      expect(formatCurrencyForReceipt("25.5")).toBe("S/ 25.50");
    });

    it("should handle null and invalid inputs", () => {
      expect(formatCurrencyForReceipt(null)).toBe("S/ 0.00");
      expect(formatCurrencyForReceipt(undefined)).toBe("S/ 0.00");
      expect(formatCurrencyForReceipt("invalid")).toBe("S/ 0.00");
    });
  });

  describe("Integration scenarios", () => {
    it("should handle full e-commerce flow", () => {
      // Product price
      const productPrice = 45.99;
      expect(formatCurrency(productPrice)).toBe("S/ 45.99");

      // Apply 10% discount
      const discountedPrice = applyDiscount(productPrice, 10);
      expect(discountedPrice).toBeCloseTo(41.39, 2);
      expect(formatCurrency(discountedPrice)).toBe("S/ 41.39");

      // Cart total (3 items)
      const cartTotal = discountedPrice * 3;
      expect(formatCurrency(cartTotal)).toBe("S/ 124.17");

      // Receipt format
      expect(formatCurrencyForReceipt(cartTotal)).toBe("S/ 124.17");
    });

    it("should parse and reformat consistently", () => {
      const original = "S/ 1,250.75";
      const parsed = parseCurrency(original);
      const reformatted = formatCurrency(parsed);
      
      expect(reformatted).toBe("S/ 1,250.75");
    });

    it("should validate and round prices", () => {
      let price = 12.374;
      
      // Round to psychological price point
      price = roundPrice(price, "ninetynine");
      expect(price).toBe(12.99);
      
      // Validate
      expect(isValidPrice(price, 0, 100)).toBe(true);
      
      // Format
      expect(formatCurrency(price)).toBe("S/ 12.99");
    });
  });
});
