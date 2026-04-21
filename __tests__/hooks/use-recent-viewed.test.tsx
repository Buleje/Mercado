/**
 * useRecentViewed — regresión del bug real: entries con `price: "12.50"` (string)
 * en localStorage rompían `.toFixed()` en el render del marketplace.
 *
 * Este hook ahora pasa por useValidatedLocalStorage + MarketplaceRecentViewedArraySchema,
 * que coerciona price string → number y filtra entries con shape inválido.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRecentViewed } from "@/hooks/use-recent-viewed";

const KEY = "marketplace:recent-viewed:v1";

function seed(raw: unknown) {
  if (raw === undefined) {
    localStorage.removeItem(KEY);
  } else if (typeof raw === "string") {
    localStorage.setItem(KEY, raw);
  } else {
    localStorage.setItem(KEY, JSON.stringify(raw));
  }
}

describe("useRecentViewed", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns [] when nothing stored", () => {
    const { result } = renderHook(() => useRecentViewed());
    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it("coerces legacy price string into number (regression)", () => {
    seed([
      {
        productId: 1,
        storeSlug: "main",
        storeName: "Bodega",
        name: "Arroz",
        price: "12.50",
        image: "/img.png",
        viewedAt: Date.now(),
      },
    ]);
    const { result } = renderHook(() => useRecentViewed());
    expect(result.current.items).toHaveLength(1);
    expect(typeof result.current.items[0].price).toBe("number");
    expect(() => result.current.items[0].price.toFixed(2)).not.toThrow();
    expect(result.current.items[0].price.toFixed(2)).toBe("12.50");
  });

  it("drops entries with invalid shape", () => {
    seed([
      { productId: 1, storeSlug: "main", name: "Valid", price: 5, viewedAt: 0, storeName: "", image: null },
      { productId: 0, storeSlug: "main", name: "BadId", price: 5, viewedAt: 0, storeName: "", image: null },
      { storeSlug: "main", name: "NoId", price: 5, viewedAt: 0, storeName: "", image: null },
      { productId: 2, name: "NoSlug", price: 5, viewedAt: 0, storeName: "", image: null },
    ]);
    const { result } = renderHook(() => useRecentViewed());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe(1);
  });

  it("returns [] on malformed JSON", () => {
    seed("not-json-{[");
    const { result } = renderHook(() => useRecentViewed());
    expect(result.current.items).toEqual([]);
  });

  it("track() normalizes price to number before persisting", () => {
    const { result } = renderHook(() => useRecentViewed());
    act(() => {
      result.current.track({
        productId: 99,
        storeSlug: "main",
        storeName: "Bodega San Martin",
        name: "Aceite",
        // @ts-expect-error simulating legacy caller passing string
        price: "9.90",
        image: null,
      });
    });
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    expect(raw[0].price).toBe(9.9);
    expect(typeof raw[0].price).toBe("number");
  });

  it("track() deduplicates by productId + storeSlug and prepends most recent", () => {
    const { result } = renderHook(() => useRecentViewed());
    act(() => {
      result.current.track({ productId: 1, storeSlug: "s1", storeName: "S1", name: "A", price: 1, image: null });
      result.current.track({ productId: 2, storeSlug: "s1", storeName: "S1", name: "B", price: 2, image: null });
      result.current.track({ productId: 1, storeSlug: "s1", storeName: "S1", name: "A updated", price: 1, image: null });
    });
    const items = result.current.items;
    expect(items).toHaveLength(2);
    expect(items[0].productId).toBe(1);
    expect(items[0].name).toBe("A updated");
    expect(items[1].productId).toBe(2);
  });

  it("clear() empties the store", () => {
    const { result } = renderHook(() => useRecentViewed());
    act(() => {
      result.current.track({ productId: 1, storeSlug: "s1", storeName: "S1", name: "A", price: 1, image: null });
    });
    expect(result.current.items).toHaveLength(1);
    act(() => result.current.clear());
    expect(result.current.items).toEqual([]);
  });
});
