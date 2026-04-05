import { describe, it, expect } from "vitest";
import { products, categories, slugify, getProductBySlug as _getProductBySlug, getProductSlug as _getProductSlug } from "@/data/products";

describe("products data", () => {
  // Products are now managed in the database — the static array is intentionally empty.
  // These tests verify the module structure and utility functions.

  it("has products as an array (empty — products are now in DB)", () => {
    expect(Array.isArray(products)).toBe(true);
    // Static array was emptied when products moved to database management
    expect(products.length).toBe(0);
  });

  it("each product (if any) has required fields", () => {
    for (const p of products) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("name");
      expect(p).toHaveProperty("category");
      expect(p).toHaveProperty("price");
      expect(p).toHaveProperty("unit");
      expect(typeof p.id).toBe("number");
      expect(typeof p.name).toBe("string");
      expect(p.price).toBeGreaterThan(0);
    }
  });

  it("has no duplicate ids", () => {
    const ids = products.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has categories defined", () => {
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    // Verify each category has required fields
    for (const c of categories) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("label");
      expect(c).toHaveProperty("emoji");
    }
  });

  it("slugify utility works correctly", () => {
    expect(slugify("Arroz Extra")).toBe("arroz-extra");
    expect(slugify("Plátano de Seda")).toBe("platano-de-seda");
    expect(slugify("  Café Molido  ")).toBe("cafe-molido");
  });
});
