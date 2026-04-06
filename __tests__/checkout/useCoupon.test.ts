import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCoupon } from "@/components/checkout/hooks/useCoupon";
import {
  useCheckoutState,
} from "@/components/checkout/hooks/useCheckoutState";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(initialCode = "") {
  const { result } = renderHook(() => {
    const { state, dispatch } = useCheckoutState();
    const coupon = useCoupon({
      state: { ...state.coupon, code: initialCode },
      cartTotal: 100,
      dispatch,
    });
    return { state, dispatch, coupon };
  });
  return result;
}

describe("useCoupon", () => {
  it("aplica un cupón válido", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ discount: 10 }),
    });

    const result = setup("DESC10");
    await act(async () => {
      await result.current.coupon.validate();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/coupons/validate",
      expect.objectContaining({ method: "POST" })
    );
    await waitFor(() => {
      expect(result.current.state.coupon.applied).toBe(true);
    });
    expect(result.current.state.coupon.discount).toBe(10);
    expect(result.current.state.coupon.msg).toContain("10.00");
    expect(result.current.state.coupon.validating).toBe(false);
  });

  it("rechaza un cupón inválido sin aplicar descuento", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Cupón expirado" }),
    });

    const result = setup("EXPIRADO");
    await act(async () => {
      await result.current.coupon.validate();
    });

    await waitFor(() => {
      expect(result.current.state.coupon.applied).toBe(false);
    });
    expect(result.current.state.coupon.discount).toBe(0);
    expect(result.current.state.coupon.msg).toBe("Cupón expirado");
  });

  it("muestra mensaje genérico si la API tira error de red", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));

    const result = setup("DESC10");
    await act(async () => {
      await result.current.coupon.validate();
    });

    await waitFor(() => {
      expect(result.current.state.coupon.msg).toBe("Error al validar");
    });
    expect(result.current.state.coupon.applied).toBe(false);
    expect(result.current.state.coupon.validating).toBe(false);
  });

  it("no llama a la API si el código está vacío", async () => {
    const result = setup("");
    await act(async () => {
      await result.current.coupon.validate();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("remove() limpia el cupón aplicado", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ discount: 5 }),
    });

    const result = setup("DESC5");
    await act(async () => {
      await result.current.coupon.validate();
    });
    await waitFor(() =>
      expect(result.current.state.coupon.applied).toBe(true)
    );

    act(() => result.current.coupon.remove());

    expect(result.current.state.coupon.applied).toBe(false);
    expect(result.current.state.coupon.discount).toBe(0);
    expect(result.current.state.coupon.code).toBe("");
  });
});
