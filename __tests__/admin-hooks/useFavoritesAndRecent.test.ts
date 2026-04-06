import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFavoritesAndRecent } from "@/app/admin/_hooks/useFavoritesAndRecent";

// Mock localStorage
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

describe("useFavoritesAndRecent", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("inicializa con favoritos y recientes vacíos", () => {
    const { result } = renderHook(() => useFavoritesAndRecent());
    expect(result.current.favoriteTabs.size).toBe(0);
    expect(result.current.recentTabs).toEqual([]);
  });

  it("carga favoritos desde localStorage", () => {
    localStorageMock.setItem("admin_fav_tabs", JSON.stringify(["pedidos", "productos"]));
    const { result } = renderHook(() => useFavoritesAndRecent());
    expect(result.current.favoriteTabs.has("pedidos")).toBe(true);
    expect(result.current.favoriteTabs.has("productos")).toBe(true);
  });

  it("carga recientes desde localStorage", () => {
    localStorageMock.setItem("admin_recent_tabs", JSON.stringify(["clientes", "compras"]));
    const { result } = renderHook(() => useFavoritesAndRecent());
    expect(result.current.recentTabs).toEqual(["clientes", "compras"]);
  });

  it("toggleFavorite añade una tab al set", () => {
    const { result } = renderHook(() => useFavoritesAndRecent());
    act(() => result.current.toggleFavorite("inventario"));
    expect(result.current.favoriteTabs.has("inventario")).toBe(true);
  });

  it("toggleFavorite quita una tab si ya estaba", () => {
    const { result } = renderHook(() => useFavoritesAndRecent());
    act(() => result.current.toggleFavorite("inventario"));
    act(() => result.current.toggleFavorite("inventario"));
    expect(result.current.favoriteTabs.has("inventario")).toBe(false);
  });

  it("toggleFavorite persiste en localStorage", () => {
    const { result } = renderHook(() => useFavoritesAndRecent());
    act(() => result.current.toggleFavorite("plata"));
    const saved = JSON.parse(localStorageMock.getItem("admin_fav_tabs") || "[]");
    expect(saved).toContain("plata");
  });

  it("addRecent mueve la tab al inicio", () => {
    const { result } = renderHook(() => useFavoritesAndRecent());
    act(() => result.current.addRecent("compras"));
    act(() => result.current.addRecent("plata"));
    act(() => result.current.addRecent("clientes"));
    expect(result.current.recentTabs).toEqual(["clientes", "plata", "compras"]);
  });

  it("addRecent dedup: si la tab ya está la mueve al inicio sin duplicar", () => {
    const { result } = renderHook(() => useFavoritesAndRecent());
    act(() => result.current.addRecent("compras"));
    act(() => result.current.addRecent("plata"));
    act(() => result.current.addRecent("compras"));
    expect(result.current.recentTabs).toEqual(["compras", "plata"]);
  });

  it("addRecent limita a máximo 5 elementos", () => {
    const { result } = renderHook(() => useFavoritesAndRecent());
    act(() => result.current.addRecent("a" as never));
    act(() => result.current.addRecent("b" as never));
    act(() => result.current.addRecent("c" as never));
    act(() => result.current.addRecent("d" as never));
    act(() => result.current.addRecent("e" as never));
    act(() => result.current.addRecent("f" as never));
    expect(result.current.recentTabs).toHaveLength(5);
    expect(result.current.recentTabs[0]).toBe("f");
    expect(result.current.recentTabs).not.toContain("a");
  });

  it("addRecent persiste en localStorage", () => {
    const { result } = renderHook(() => useFavoritesAndRecent());
    act(() => result.current.addRecent("turnos"));
    const saved = JSON.parse(localStorageMock.getItem("admin_recent_tabs") || "[]");
    expect(saved).toContain("turnos");
  });
});
