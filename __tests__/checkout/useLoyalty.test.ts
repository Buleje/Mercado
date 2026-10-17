import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useLoyalty } from "@/components/checkout/hooks/useLoyalty";
import { useCheckoutState } from "@/components/checkout/hooks/useCheckoutState";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// El descuento por «tier» (plata 2 % / oro 4 % / diamante 6 %) se retiró del
// checkout el 2026-10-08: el servidor no lo cobraba y todo pedido con tier caía
// en 422. El descuento automático lo cotiza el servidor
// (`calcularDescuentoAutomatico`); useLoyalty solo carga puntos y tier.
describe("useLoyalty", () => {
  it("carga puntos y tier al llamar fetchPoints", async () => {
    // fetchPoints hace primero un pre-check de sesión en /api/auth/customer/me
    // antes de llamar al endpoint de loyalty (para evitar 401 en consola).
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true }),
      })
      .mockResolvedValueOnce({
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
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/loyalty/987654321",
      expect.objectContaining({ credentials: "include" }),
    );
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
