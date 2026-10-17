// @vitest-environment jsdom
/**
 * «Esperando tu OK» no se esconde por un 429: si la lectura de aprobaciones falla,
 * el hook conserva el último valor (antes lo leía como 0 y la tarjeta desaparecía
 * con la aprobación todavía viva).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contarPendientes, usePendientesOK } from "@/components/admin/comandos-ia/historial/use-recibos";

const respuesta = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("usePendientesOK", () => {
  it("con 429 (o sin red) se queda con el último valor", async () => {
    // La 4.ª lectura (la que trae 0 de verdad) espera a que la soltemos.
    let soltar: () => void = () => {};
    const cuarta = new Promise<Response>((r) => {
      soltar = () => r(respuesta(200, { count: 0, pending: [] }));
    });
    const cola: Array<() => Promise<Response>> = [
      async () => respuesta(200, { count: 2, pending: [{}, {}] }),
      async () => respuesta(429, { error: "Too many requests" }),
      async () => {
        throw new TypeError("Failed to fetch");
      },
      () => cuarta,
    ];
    const fetchMock = vi.fn(() => (cola.shift() ?? (() => new Promise<Response>(() => {})))());
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePendientesOK(50));
    await waitFor(() => expect(result.current).toBe(2));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4));
    expect(result.current).toBe(2);

    act(() => soltar());
    await waitFor(() => expect(result.current).toBe(0));
  });

  it("401/403 = sin permiso → 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(401, { error: "No autorizado" })));
    const { result } = renderHook(() => usePendientesOK(10_000));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current).toBe(0);
  });
});

describe("contarPendientes", () => {
  it("lee count, cae a pending.length y devuelve null si no hay dato", () => {
    expect(contarPendientes({ count: 3 })).toBe(3);
    expect(contarPendientes({ pending: [1, 2] })).toBe(2);
    expect(contarPendientes({ error: "x" })).toBeNull();
    expect(contarPendientes(null)).toBeNull();
  });
});
