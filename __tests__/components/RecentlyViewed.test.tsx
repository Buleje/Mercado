/**
 * RecentlyViewed.getRecent() — saneamiento al hidratar desde localStorage.
 *
 * Protege contra el bug real visto en prod: TypeError "item.price.toFixed is
 * not a function" cuando entradas legacy tenían price como string o null.
 *
 * Cubre: price coerción, id inválido, name missing, array no-array, JSON roto.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { getRecent, trackView } from "@/components/RecentlyViewedSingleTenant";

const STORAGE_KEY = "buleje-recently-viewed";

function seed(raw: unknown) {
  if (raw === undefined) {
    localStorage.removeItem(STORAGE_KEY);
  } else if (typeof raw === "string") {
    localStorage.setItem(STORAGE_KEY, raw);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  }
}

describe("RecentlyViewed.getRecent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns [] when localStorage is empty", () => {
    expect(getRecent()).toEqual([]);
  });

  it("returns [] when stored value is not an array", () => {
    seed({ not: "array" });
    expect(getRecent()).toEqual([]);
  });

  it("returns [] when JSON is malformed", () => {
    seed("not-json-{[");
    expect(getRecent()).toEqual([]);
  });

  it("coerces price from string to number (legacy data)", () => {
    seed([
      { id: 1, name: "Arroz", price: "12.50", image: "/a.png", category: "", unit: "kg" },
    ]);
    const items = getRecent();
    expect(items).toHaveLength(1);
    expect(items[0].price).toBe(12.5);
    expect(typeof items[0].price).toBe("number");
  });

  it("defaults price to 0 when null/undefined/invalid", () => {
    seed([
      { id: 1, name: "A", price: null, image: "", category: "", unit: "" },
      { id: 2, name: "B", image: "", category: "", unit: "" },
      { id: 3, name: "C", price: "not-a-number", image: "", category: "", unit: "" },
    ]);
    const items = getRecent();
    // Todos deberían pasar (id + name válidos) y con price = 0.
    expect(items.every((i) => i.price === 0)).toBe(true);
  });

  it("drops entries without valid id or name", () => {
    seed([
      { id: 1, name: "Valid", price: 5, image: "", category: "", unit: "" },
      { name: "no-id", price: 5, image: "", category: "", unit: "" },
      { id: 2, price: 5, image: "", category: "", unit: "" },
      { id: "not-number", name: "bad-id", price: 5, image: "", category: "", unit: "" },
    ]);
    const items = getRecent();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(1);
  });

  it("does not crash when price.toFixed is called on the result", () => {
    // Regression: este es el bug original en consola.
    seed([
      { id: 1, name: "X", price: "99.9", image: "", category: "", unit: "" },
    ]);
    const items = getRecent();
    expect(() => items[0].price.toFixed(2)).not.toThrow();
    expect(items[0].price.toFixed(2)).toBe("99.90");
  });
});

describe("RecentlyViewed.trackView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes price to number before storing", () => {
    trackView({
      id: 1,
      name: "Test",
      category: "",
      // @ts-expect-error — simulando caller que pasa string
      price: "15.50",
      image: "",
      unit: "",
    });
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    expect(raw[0].price).toBe(15.5);
    expect(typeof raw[0].price).toBe("number");
  });

  it("prepends most recent and dedupes by id", () => {
    const base = { name: "n", category: "", price: 1, image: "", unit: "" };
    trackView({ id: 1, ...base });
    trackView({ id: 2, ...base });
    trackView({ id: 1, ...base, name: "Updated" });
    const items = getRecent();
    expect(items.map((i) => i.id)).toEqual([1, 2]);
    expect(items[0].name).toBe("Updated");
  });
});
