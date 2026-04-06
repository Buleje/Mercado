import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClearDataFlow } from "@/app/admin/_hooks/useClearDataFlow";

describe("useClearDataFlow", () => {
  it("inicializa con el wizard cerrado en paso 1", () => {
    const { result } = renderHook(() => useClearDataFlow());
    expect(result.current.showClearConfirm).toBe(false);
    expect(result.current.clearConfirmStep).toBe(1);
    expect(result.current.clearConfirmText).toBe("");
    expect(result.current.clearingData).toBe(false);
  });

  it("inicializa con las 13 categorías por defecto seleccionadas", () => {
    const { result } = renderHook(() => useClearDataFlow());
    const expectedCategories = [
      "products", "customers", "orders", "sales", "suppliers", "promotions",
      "cash", "reviews", "expenses", "returns", "activity", "cms", "notifications",
    ];
    expectedCategories.forEach((cat) => {
      expect(result.current.clearCategories.has(cat)).toBe(true);
    });
    expect(result.current.clearCategories.size).toBe(13);
  });

  it("setShowClearConfirm cambia la visibilidad del modal", () => {
    const { result } = renderHook(() => useClearDataFlow());
    act(() => result.current.setShowClearConfirm(true));
    expect(result.current.showClearConfirm).toBe(true);
    act(() => result.current.setShowClearConfirm(false));
    expect(result.current.showClearConfirm).toBe(false);
  });

  it("setClearConfirmStep avanza por los 3 pasos", () => {
    const { result } = renderHook(() => useClearDataFlow());
    act(() => result.current.setClearConfirmStep(2));
    expect(result.current.clearConfirmStep).toBe(2);
    act(() => result.current.setClearConfirmStep(3));
    expect(result.current.clearConfirmStep).toBe(3);
  });

  it("setClearConfirmText guarda el texto de confirmación", () => {
    const { result } = renderHook(() => useClearDataFlow());
    act(() => result.current.setClearConfirmText("BORRAR TODO"));
    expect(result.current.clearConfirmText).toBe("BORRAR TODO");
  });

  it("setClearingData marca el flag de ejecución en curso", () => {
    const { result } = renderHook(() => useClearDataFlow());
    act(() => result.current.setClearingData(true));
    expect(result.current.clearingData).toBe(true);
  });

  it("setClearCategories permite reemplazar el set de categorías", () => {
    const { result } = renderHook(() => useClearDataFlow());
    act(() => result.current.setClearCategories(new Set(["products", "orders"])));
    expect(result.current.clearCategories.size).toBe(2);
    expect(result.current.clearCategories.has("products")).toBe(true);
    expect(result.current.clearCategories.has("orders")).toBe(true);
    expect(result.current.clearCategories.has("customers")).toBe(false);
  });
});
