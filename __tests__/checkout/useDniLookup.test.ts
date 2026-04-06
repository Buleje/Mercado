import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDniLookup } from "@/components/checkout/hooks/useDniLookup";
import { useCheckoutState } from "@/components/checkout/hooks/useCheckoutState";

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(initialDni = "") {
  return renderHook(
    ({ dni }: { dni: string }) => {
      const { state, dispatch } = useCheckoutState();
      useDniLookup({ dni, dispatch });
      return state;
    },
    { initialProps: { dni: initialDni } }
  );
}

describe("useDniLookup", () => {
  it("muestra mensaje inicial cuando no hay DNI", () => {
    const { result } = setup("");
    expect(result.current.dniLookup.status).toBe("idle");
    expect(result.current.dniLookup.message).toContain("RENIEC");
  });

  it("muestra cuántos dígitos faltan cuando el DNI está incompleto", () => {
    const { result, rerender } = setup("");
    rerender({ dni: "1234" });
    expect(result.current.dniLookup.status).toBe("idle");
    expect(result.current.dniLookup.message).toContain("4 dígitos");
  });

  it("consulta RENIEC al alcanzar 8 dígitos y autocompleta nombre", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nombreCompleto: "JUAN PEREZ LOPEZ" }),
    });

    const { result, rerender } = setup("");
    rerender({ dni: "12345678" });

    await waitFor(
      () => {
        expect(result.current.dniLookup.status).toBe("success");
      },
      { timeout: 2000 }
    );
    expect(result.current.customer.name).toBe("JUAN PEREZ LOPEZ");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/reniec/dni/12345678",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("muestra fallback cuando RENIEC no encuentra el DNI", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "DNI no encontrado" }),
    });

    const { result, rerender } = setup("");
    rerender({ dni: "00000000" });

    await waitFor(
      () => {
        expect(result.current.dniLookup.status).toBe("error");
      },
      { timeout: 2000 }
    );
    expect(result.current.dniLookup.message).toBe("DNI no encontrado");
  });

  it("muestra fallback específico para 503 (RENIEC caído)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const { result, rerender } = setup("");
    rerender({ dni: "12345678" });

    await waitFor(
      () => {
        expect(result.current.dniLookup.status).toBe("error");
      },
      { timeout: 2000 }
    );
    expect(result.current.dniLookup.message).toContain("no disponible");
  });
});
