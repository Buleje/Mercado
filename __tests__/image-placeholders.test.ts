import { describe, it, expect } from "vitest";
import {
  generateShimmerPlaceholder,
  generateColorPlaceholder,
  productImagePlaceholder,
  BLUR_DATA_URL,
  PRODUCT_PLACEHOLDER,
} from "../lib/image-placeholders";

describe("Image Placeholders", () => {
  describe("generateShimmerPlaceholder", () => {
    it("should generate a base64 encoded SVG shimmer", () => {
      const result = generateShimmerPlaceholder(400, 300);
      
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(typeof result).toBe("string");
    });

    it("should use default dimensions when not provided", () => {
      const result = generateShimmerPlaceholder();
      
      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(result).toBeTruthy();
    });

    it("should contain shimmer gradient animation", () => {
      const result = generateShimmerPlaceholder(400, 400);
      const decoded = Buffer.from(
        result.replace("data:image/svg+xml;base64,", ""),
        "base64"
      ).toString();

      expect(decoded).toContain("linearGradient");
      expect(decoded).toContain("animate");
      expect(decoded).toContain("attributeName=\"x\"");
    });

    it("should respect custom dimensions", () => {
      const width = 800;
      const height = 600;
      const result = generateShimmerPlaceholder(width, height);
      const decoded = Buffer.from(
        result.replace("data:image/svg+xml;base64,", ""),
        "base64"
      ).toString();

      expect(decoded).toContain(`width="${width}"`);
      expect(decoded).toContain(`height="${height}"`);
    });
  });

  describe("generateColorPlaceholder", () => {
    it("should generate a data URL with the specified color", () => {
      const color = "#ff0000";
      const result = generateColorPlaceholder(color);

      expect(result).toMatch(/^data:image\/svg\+xml,/);
      expect(result).toContain(encodeURIComponent(color));
    });

    it("should handle different color formats", () => {
      const colors = ["#fff", "#000000", "rgb(255,0,0)", "currentColor"];
      
      colors.forEach((color) => {
        const result = generateColorPlaceholder(color);
        expect(result).toBeTruthy();
        expect(result).toMatch(/^data:image\/svg\+xml,/);
      });
    });

    it("should create a valid SVG structure", () => {
      const result = generateColorPlaceholder("#cccccc");
      const decoded = decodeURIComponent(
        result.replace("data:image/svg+xml,", "")
      );

      expect(decoded).toContain("<svg");
      expect(decoded).toContain("xmlns=");
      expect(decoded).toContain("<rect");
      expect(decoded).toContain("fill=");
    });
  });

  describe("productImagePlaceholder", () => {
    it("should return a base64 encoded shopping bag icon", () => {
      const result = productImagePlaceholder();

      expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(typeof result).toBe("string");
    });

    it("should contain shopping bag SVG elements", () => {
      const result = productImagePlaceholder();
      const decoded = Buffer.from(
        result.replace("data:image/svg+xml;base64,", ""),
        "base64"
      ).toString();

      expect(decoded).toContain("<svg");
      expect(decoded).toContain("viewBox=\"0 0 400 400\"");
      expect(decoded).toContain("<path"); // Shopping bag icon paths
      expect(decoded).toContain("stroke=\"#0f766e\"");
    });

    it("should be reusable and consistent", () => {
      const result1 = productImagePlaceholder();
      const result2 = productImagePlaceholder();

      expect(result1).toBe(result2);
    });
  });

  describe("BLUR_DATA_URL constant", () => {
    it("should be a valid base64 data URL", () => {
      expect(BLUR_DATA_URL).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it("should be immediately usable", () => {
      expect(typeof BLUR_DATA_URL).toBe("string");
      expect(BLUR_DATA_URL.length).toBeGreaterThan(0);
    });

    it("should decode to valid SVG", () => {
      const decoded = Buffer.from(
        BLUR_DATA_URL.replace("data:image/svg+xml;base64,", ""),
        "base64"
      ).toString();

      expect(decoded).toContain("<svg");
      expect(decoded).toContain("</svg>");
    });
  });

  describe("PRODUCT_PLACEHOLDER constant", () => {
    it("should be a valid base64 data URL", () => {
      expect(PRODUCT_PLACEHOLDER).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it("should be immediately usable as image src", () => {
      expect(typeof PRODUCT_PLACEHOLDER).toBe("string");
      expect(PRODUCT_PLACEHOLDER.length).toBeGreaterThan(0);
    });

    it("should contain shopping bag icon", () => {
      const decoded = Buffer.from(
        PRODUCT_PLACEHOLDER.replace("data:image/svg+xml;base64,", ""),
        "base64"
      ).toString();

      expect(decoded).toContain("<path");
      expect(decoded).toContain("#0f766e");
    });
  });

  describe("Integration scenarios", () => {
    it("should work with next/image placeholder prop", () => {
      const shimmer = generateShimmerPlaceholder(600, 400);
      const color = generateColorPlaceholder("#e9ecef");
      const product = productImagePlaceholder();

      // All should be valid data URLs for next/image
      [shimmer, color, product, BLUR_DATA_URL, PRODUCT_PLACEHOLDER].forEach(
        (placeholder) => {
          expect(placeholder).toMatch(/^data:image\//);
          expect(placeholder.length).toBeLessThan(10000); // Reasonable size for inline
        }
      );
    });

    it("should generate different shimmers for different sizes", () => {
      const small = generateShimmerPlaceholder(100, 100);
      const large = generateShimmerPlaceholder(1000, 1000);

      expect(small).not.toBe(large);
      expect(small.length).toBeLessThan(large.length);
    });

    it("should handle edge cases gracefully", () => {
      // Very small dimensions
      expect(() => generateShimmerPlaceholder(1, 1)).not.toThrow();
      
      // Very large dimensions
      expect(() => generateShimmerPlaceholder(5000, 5000)).not.toThrow();
      
      // Special characters in color
      expect(() => generateColorPlaceholder("rgba(255,255,255,0.5)")).not.toThrow();
    });
  });

  describe("Performance", () => {
    it("should generate placeholders quickly", () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        generateShimmerPlaceholder(400, 400);
      }
      
      const end = performance.now();
      const duration = end - start;

      // Should generate 100 placeholders in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    it("should produce consistent output for same inputs", () => {
      const results = Array.from({ length: 5 }, () =>
        generateShimmerPlaceholder(400, 300)
      );

      const allSame = results.every((r) => r === results[0]);
      expect(allSame).toBe(true);
    });
  });
});
