import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useChangelogBadge } from "@/app/admin/_hooks/useChangelogBadge";

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

describe("useChangelogBadge", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("retorna true cuando el usuario nunca vio el changelog", () => {
    const { result } = renderHook(() => useChangelogBadge());
    expect(result.current).toBe(true);
  });

  it("retorna true cuando la última versión vista no es la actual", () => {
    localStorageMock.setItem("changelog-last-seen", "1.0");
    const { result } = renderHook(() => useChangelogBadge());
    expect(result.current).toBe(true);
  });

  it("retorna false cuando el usuario ya vio la versión actual (2.5)", () => {
    localStorageMock.setItem("changelog-last-seen", "2.5");
    const { result } = renderHook(() => useChangelogBadge());
    expect(result.current).toBe(false);
  });
});
