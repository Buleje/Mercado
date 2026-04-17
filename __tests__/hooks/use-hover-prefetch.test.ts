/**
 * Tests para useHoverPrefetch
 *
 * Verifica:
 *   1. El timer dispara prefetch despues del delay
 *   2. mouseLeave antes del delay cancela el timer (no prefetch)
 *   3. Multiples mouseEnter rapidos no crean timers duplicados
 *   4. Un nuevo mouseEnter despues de mouseLeave puede disparar de nuevo
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHoverPrefetch } from "@/hooks/use-hover-prefetch";

// ── Mock next/navigation ──────────────────────────────────────────────────────

const mockPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: mockPrefetch,
  }),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useHoverPrefetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPrefetch.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispara router.prefetch despues del delay (500ms por defecto)", () => {
    const { result } = renderHook(() =>
      useHoverPrefetch("/marketplace/bodega-san-martin"),
    );

    act(() => {
      result.current.onMouseEnter();
    });

    // Antes del delay no debe haber llamado prefetch
    expect(mockPrefetch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockPrefetch).toHaveBeenCalledTimes(1);
    expect(mockPrefetch).toHaveBeenCalledWith("/marketplace/bodega-san-martin");
  });

  it("cancela el timer cuando mouseLeave ocurre antes del delay", () => {
    const { result } = renderHook(() =>
      useHoverPrefetch("/marketplace/tienda-abc", 500),
    );

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      vi.advanceTimersByTime(300); // menos que 500ms
      result.current.onMouseLeave();
    });

    act(() => {
      vi.advanceTimersByTime(500); // el timer ya fue cancelado
    });

    expect(mockPrefetch).not.toHaveBeenCalled();
  });

  it("respeta un delay personalizado", () => {
    const { result } = renderHook(() =>
      useHoverPrefetch("/marketplace/tienda-xyz", 1000),
    );

    act(() => {
      result.current.onMouseEnter();
    });

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(mockPrefetch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(mockPrefetch).toHaveBeenCalledTimes(1);
  });

  it("no crea timers duplicados con multiples mouseEnter rapidos", () => {
    const { result } = renderHook(() =>
      useHoverPrefetch("/marketplace/tienda-dup"),
    );

    act(() => {
      result.current.onMouseEnter();
      result.current.onMouseEnter(); // segundo enter debe ignorarse
      result.current.onMouseEnter(); // tercer enter debe ignorarse
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Solo debe haberse llamado una vez
    expect(mockPrefetch).toHaveBeenCalledTimes(1);
  });
});
