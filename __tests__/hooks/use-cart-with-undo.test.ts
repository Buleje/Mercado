import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * useCartWithUndo — tests contra el contrato actual (2026-04-24).
 *
 * Historia: el hook llamaba a `toast.show()` con una action "Deshacer" y un
 * timer de 3s. En 2026-04 se reemplazo ese toast por un drawer lateral
 * (<AddedToCartDrawer> + `useAddedToCartDrawer().open(...)`).
 *
 * Los tests ahora verifican que:
 *  1. `useMarketplaceCart.addItem` recibe el payload limpio (sin description
 *     ni variations — esos campos son solo del drawer).
 *  2. `useAddedToCartDrawer.open` recibe el snapshot completo del producto
 *     (incluyendo description y variations si se pasaron).
 */

const mockAddItem = vi.fn();
const mockRemoveItem = vi.fn();
const mockOpenDrawer = vi.fn();

vi.mock("@/hooks/use-marketplace-cart", () => ({
  useMarketplaceCart: () => ({
    addItem: mockAddItem,
    removeItem: mockRemoveItem,
    items: [],
    byStore: {},
    itemCount: 0,
    totalByStore: {},
    grandTotal: 0,
    updateQuantity: vi.fn(),
    clearStore: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

vi.mock("@/components/marketplace/AddedToCartDrawer", () => ({
  useAddedToCartDrawer: () => ({
    open: mockOpenDrawer,
    close: vi.fn(),
  }),
}));

import { useCartWithUndo } from "@/hooks/use-cart-with-undo";

const PRODUCT_BASE = {
  storeId: "store-1",
  storeName: "Bodega La Fe",
  storeSlug: "bodega-la-fe",
  storeProductId: "sp-42",
  productId: 42,
  name: "Arroz costeño 5kg",
  price: 18.5,
  image: null,
  unit: "bolsa",
} as const;

beforeEach(() => {
  mockAddItem.mockClear();
  mockRemoveItem.mockClear();
  mockOpenDrawer.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCartWithUndo", () => {
  it("calls underlying addItem with the correct arguments", () => {
    const { result } = renderHook(() => useCartWithUndo());

    act(() => {
      result.current.addItemWithUndo(PRODUCT_BASE);
    });

    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem).toHaveBeenCalledWith(PRODUCT_BASE);
  });

  it("opens the AddedToCartDrawer with the product snapshot", () => {
    const { result } = renderHook(() => useCartWithUndo());

    act(() => {
      result.current.addItemWithUndo(PRODUCT_BASE);
    });

    expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
    expect(mockOpenDrawer).toHaveBeenCalledWith({
      storeId: "store-1",
      storeName: "Bodega La Fe",
      storeSlug: "bodega-la-fe",
      productId: 42,
      storeProductId: "sp-42",
      name: "Arroz costeño 5kg",
      price: 18.5,
      image: null,
      unit: "bolsa",
      description: null,
      variations: undefined,
    });
  });

  it("strips description and variations before calling addItem (cart payload vs drawer snapshot)", () => {
    const { result } = renderHook(() => useCartWithUndo());

    act(() => {
      result.current.addItemWithUndo({
        ...PRODUCT_BASE,
        description: "1kg de arroz",
        variations: [{ label: "Marca", value: "Costeño" }],
      });
    });

    // addItem recibe el payload del cart (sin description/variations)
    expect(mockAddItem).toHaveBeenCalledWith(PRODUCT_BASE);

    // openDrawer recibe el snapshot completo (con description + variations)
    expect(mockOpenDrawer).toHaveBeenCalledWith({
      storeId: "store-1",
      storeName: "Bodega La Fe",
      storeSlug: "bodega-la-fe",
      productId: 42,
      storeProductId: "sp-42",
      name: "Arroz costeño 5kg",
      price: 18.5,
      image: null,
      unit: "bolsa",
      description: "1kg de arroz",
      variations: [{ label: "Marca", value: "Costeño" }],
    });
  });

  it("passes quantity when provided", () => {
    const { result } = renderHook(() => useCartWithUndo());

    act(() => {
      result.current.addItemWithUndo({ ...PRODUCT_BASE, quantity: 3 });
    });

    expect(mockAddItem).toHaveBeenCalledWith({ ...PRODUCT_BASE, quantity: 3 });
  });

  it("handles null description gracefully", () => {
    const { result } = renderHook(() => useCartWithUndo());

    act(() => {
      result.current.addItemWithUndo({ ...PRODUCT_BASE, description: null });
    });

    expect(mockOpenDrawer).toHaveBeenCalledWith(
      expect.objectContaining({ description: null }),
    );
  });
});
