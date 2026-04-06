import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHiddenTabs } from "@/app/admin/_hooks/useHiddenTabs";

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

describe("useHiddenTabs", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("inicializa con set vacío", () => {
    const { result } = renderHook(() => useHiddenTabs());
    expect(result.current.hiddenTabs.size).toBe(0);
  });

  it("carga tabs ocultas desde localStorage", () => {
    localStorageMock.setItem("admin_hidden_tabs", JSON.stringify(["analytics-pro", "plan"]));
    const { result } = renderHook(() => useHiddenTabs());
    expect(result.current.hiddenTabs.has("analytics-pro")).toBe(true);
    expect(result.current.hiddenTabs.has("plan")).toBe(true);
    expect(result.current.hiddenTabs.size).toBe(2);
  });

  it("toggleHideTab oculta una tab nueva", () => {
    const { result } = renderHook(() => useHiddenTabs());
    act(() => result.current.toggleHideTab("clientes"));
    expect(result.current.hiddenTabs.has("clientes")).toBe(true);
  });

  it("toggleHideTab muestra una tab que ya estaba oculta", () => {
    localStorageMock.setItem("admin_hidden_tabs", JSON.stringify(["pedidos"]));
    const { result } = renderHook(() => useHiddenTabs());
    expect(result.current.hiddenTabs.has("pedidos")).toBe(true);
    act(() => result.current.toggleHideTab("pedidos"));
    expect(result.current.hiddenTabs.has("pedidos")).toBe(false);
  });

  it("toggleHideTab persiste en localStorage", () => {
    const { result } = renderHook(() => useHiddenTabs());
    act(() => result.current.toggleHideTab("compras"));
    const saved = JSON.parse(localStorageMock.getItem("admin_hidden_tabs") || "[]");
    expect(saved).toContain("compras");
  });

  it("toggleHideTab maneja JSON corrupto en localStorage gracefully", () => {
    localStorageMock.setItem("admin_hidden_tabs", "{not valid json");
    const { result } = renderHook(() => useHiddenTabs());
    expect(result.current.hiddenTabs.size).toBe(0);
  });
});
