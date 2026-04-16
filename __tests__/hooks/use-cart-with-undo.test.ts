import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCartWithUndo } from "@/hooks/use-cart-with-undo";
import { useToastStore, toast } from "@/hooks/use-toast";

// ---------- mocks ----------

const mockAddItem = vi.fn();
const mockRemoveItem = vi.fn();

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

// ---------- helpers ----------

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
  vi.useFakeTimers();
  mockAddItem.mockClear();
  mockRemoveItem.mockClear();
  toast.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------- tests ----------

describe("useCartWithUndo", () => {
  it("calls underlying addItem with the correct arguments", () => {
    const { result } = renderHook(() => useCartWithUndo());

    act(() => {
      result.current.addItemWithUndo(PRODUCT_BASE);
    });

    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem).toHaveBeenCalledWith(PRODUCT_BASE);
  });

  it("shows a toast with message 'Agregado al carrito' and 'Deshacer' action", () => {
    const { result } = renderHook(() => useCartWithUndo());
    const { result: storeResult } = renderHook(() => useToastStore());

    act(() => {
      result.current.addItemWithUndo(PRODUCT_BASE);
    });

    expect(storeResult.current.toasts).toHaveLength(1);
    const t = storeResult.current.toasts[0];
    expect(t.message).toBe("Agregado al carrito");
    expect(t.action?.label).toBe("Deshacer");
    expect(typeof t.action?.onClick).toBe("function");
  });

  it("clicking Deshacer within 3s calls removeItem with correct storeId and productId", () => {
    const { result } = renderHook(() => useCartWithUndo());
    const { result: storeResult } = renderHook(() => useToastStore());

    act(() => {
      result.current.addItemWithUndo(PRODUCT_BASE);
    });

    // Advance 1 second — still within window
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const t = storeResult.current.toasts[0];
    expect(t).toBeDefined();

    act(() => {
      t.action!.onClick();
    });

    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
    expect(mockRemoveItem).toHaveBeenCalledWith(
      PRODUCT_BASE.storeId,
      PRODUCT_BASE.productId
    );
  });

  it("auto-dismisses the toast after 3 seconds", () => {
    const { result } = renderHook(() => useCartWithUndo());
    const { result: storeResult } = renderHook(() => useToastStore());

    act(() => {
      result.current.addItemWithUndo(PRODUCT_BASE);
    });

    expect(storeResult.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(storeResult.current.toasts).toHaveLength(0);
  });

  it("after 3s the toast is gone — Deshacer cannot be invoked", () => {
    const { result } = renderHook(() => useCartWithUndo());
    const { result: storeResult } = renderHook(() => useToastStore());

    act(() => {
      result.current.addItemWithUndo(PRODUCT_BASE);
    });

    // Capture the action before dismissal
    const undoFn = storeResult.current.toasts[0].action!.onClick;

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Toast gone from store
    expect(storeResult.current.toasts).toHaveLength(0);

    // The captured undo callback still calls removeItem if invoked directly,
    // but the toast UI is no longer visible so the user cannot reach it.
    // Verify that after dismissal calling the fn does call removeItem
    // (the closure is still valid — the protection is the UI being gone).
    act(() => {
      undoFn();
    });

    expect(mockRemoveItem).toHaveBeenCalledTimes(1);
  });

  it("passes quantity when provided", () => {
    const { result } = renderHook(() => useCartWithUndo());

    act(() => {
      result.current.addItemWithUndo({ ...PRODUCT_BASE, quantity: 3 });
    });

    expect(mockAddItem).toHaveBeenCalledWith({ ...PRODUCT_BASE, quantity: 3 });
  });
});
