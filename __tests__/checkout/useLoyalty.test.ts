import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useLoyalty,
  getTierDiscountPct,
  TIER_DISCOUNT,
} from "@/components/checkout/hooks/useLoyalty";
import { useCheckoutState } from "@/components/checkout/hooks/useCheckoutState";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getTierDiscountPct", () => {
  it("retorna 0 para tier null", () => {
    expect(getTierDiscountPct(null)).toBe(0);
  });

  it("retorna 0 para tier desconocido", () => {
    expect(getTierDiscountPct("bronce")).toBe(0);
  });

  it("retorna los porcentajes correctos por tier", () => {
    expect(getTierDiscountPct("plata")).toBe(2);
    expect(getTierDiscountPct("oro")).toBe(4);
    expect(getTierDiscountPct("diamante")).toBe(7);
  });

  it("la tabla TIER_DISCOUNT contiene los 3 niveles esperados", () => {
    expect(TIER_DISCOUNT).toEqual({ plata: 2, oro: 4, diamante: 7 });
  });
});

describe("useLoyalty", () => {
  it("carga puntos y tier al llamar fetchPoints", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ loyaltyPoints: 250, loyaltyTier: "oro" }),
    });

    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState();
      const loyalty = useLoyalty(dispatch);
      return { state, loyalty };
    });

    await act(async () => {
      await result.current.loyalty.fetchPoints("987654321");
    });

    await waitFor(() => {
      expect(result.current.state.loyalty.points).toBe(250);
    });
    expect(result.current.state.loyalty.tier).toBe("oro");
    expect(mockFetch).toHaveBeenCalledWith("/api/loyalty/987654321");
  });

  it("ignora teléfonos demasiado cortos", async () => {
    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState();
      const loyalty = useLoyalty(dispatch);
      return { state, loyalty };
    });

    await act(async () => {
      await result.current.loyalty.fetchPoints("123");
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.state.loyalty.points).toBeNull();
  });

  it("falla en silencio si la API tira error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => {
      const { state, dispatch } = useCheckoutState();
      const loyalty = useLoyalty(dispatch);
      return { state, loyalty };
    });

    await act(async () => {
      await result.current.loyalty.fetchPoints("987654321");
    });

    expect(result.current.state.loyalty.points).toBeNull();
    expect(result.current.state.loyalty.tier).toBeNull();
  });
});
