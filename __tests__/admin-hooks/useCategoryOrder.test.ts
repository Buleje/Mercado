import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCategoryOrder } from "@/app/admin/_hooks/useCategoryOrder";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("useCategoryOrder", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("inicializa con array vacío", () => {
    const { result } = renderHook(() => useCategoryOrder());
    expect(result.current.categoryOrder).toEqual([]);
  });

  it("carga el orden desde localStorage", () => {
    localStorageMock.setItem("admin_category_order", JSON.stringify(["finanzas", "operaciones"]));
    const { result } = renderHook(() => useCategoryOrder());
    expect(result.current.categoryOrder).toEqual(["finanzas", "operaciones"]);
  });

  it("saveCategoryOrder actualiza y persiste", () => {
    const { result } = renderHook(() => useCategoryOrder());
    act(() => result.current.saveCategoryOrder(["a", "b", "c"]));
    expect(result.current.categoryOrder).toEqual(["a", "b", "c"]);
    const saved = JSON.parse(localStorageMock.getItem("admin_category_order") || "[]");
    expect(saved).toEqual(["a", "b", "c"]);
  });

  it("maneja JSON corrupto gracefully", () => {
    localStorageMock.setItem("admin_category_order", "garbage");
    const { result } = renderHook(() => useCategoryOrder());
    expect(result.current.categoryOrder).toEqual([]);
  });
});
