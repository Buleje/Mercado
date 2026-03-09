import { describe, it, expect } from "vitest";
import { products } from "@/data/products";

describe("products data", () => {
  it("has products array with entries", () => {
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
  });

  it("each product has required fields", () => {
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

  it("has products with badges", () => {
    const withBadge = products.filter(p => p.badge);
    expect(withBadge.length).toBeGreaterThan(0);
  });
});
