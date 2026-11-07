/**
 * useNotificationCenter (10-10):
 *  - el PATCH de «leída» lleva el token CSRF (sin él, proxy.ts daba 403 y el
 *    leído nunca se guardaba: 124/124 de main y 136/136 de Blas sin leer);
 *  - una lectura que salió antes de marcar no pisa lo marcado;
 *  - cerrado pide 1 fila (sólo el total del header), abierto 100.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({
  csrfHeaders: (extra: Record<string, string> = {}) => ({ ...extra, "x-csrf-token": "tok" }),
}));

import { useNotificationCenter } from "@/components/notifications/useNotificationCenter";

const aviso = { id: "n1", tenantId: "t", type: "ADELANTO_VENCIDO", severity: "MEDIUM", title: "A", body: "", createdAt: new Date().toISOString(), readAt: null };

function respuesta(lista: unknown[], sinLeer: number) {
  return { ok: true, status: 200, json: async () => lista, headers: new Headers({ "X-Unread-Count": String(sinLeer) }) };
}

let servidorSinLeer = 5;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  servidorSinLeer = 5;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      servidorSinLeer -= 1;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return respuesta([aviso], servidorSinLeer);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

describe("useNotificationCenter", () => {
  it("cerrado pide 1 fila; abierto, 100", async () => {
    const { rerender } = renderHook(({ abierto }) => useNotificationCenter(abierto), { initialProps: { abierto: false } });
    await waitFor(() => expect(String(fetchMock.mock.calls[0]?.[0])).toContain("limit=1"));
    rerender({ abierto: true });
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("limit=100"))).toBe(true));
  });

  it("marcar leída manda el token CSRF y se queda guardado", async () => {
    const { result } = renderHook(() => useNotificationCenter(true));
    await waitFor(() => expect(result.current.unreadCount).toBe(5));
    await act(async () => {
      await result.current.markAsRead("n1");
    });
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    expect(patch?.[0]).toBe("/api/notification-center/n1/read");
    expect((patch?.[1] as RequestInit).headers).toMatchObject({ "x-csrf-token": "tok" });
    await waitFor(() => expect(result.current.unreadCount).toBe(4));
  });

  it("una lectura que salió antes de marcar no pisa lo marcado", async () => {
    const { result } = renderHook(() => useNotificationCenter(true));
    await waitFor(() => expect(result.current.unreadCount).toBe(5));
    // Una lectura lenta sale con 5 sin leer y vuelve DESPUÉS de marcar.
    let soltar: (v: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => (soltar = r)));
    act(() => result.current.refetch());
    await act(async () => {
      await result.current.markAsRead("n1");
    });
    await act(async () => {
      soltar(respuesta([aviso], 5));
    });
    expect(result.current.unreadCount).toBe(4);
  });

  it("la consulta de 1 fila que llega después de abrir no pisa la lista de 100", async () => {
    // La del sondeo cerrado (limit=1) sale primero y vuelve tarde.
    let soltarCorta: (v: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => (soltarCorta = r)));
    const lista = ["a", "b", "c"].map((id) => ({ ...aviso, id }));
    fetchMock.mockImplementationOnce(async () => respuesta(lista, 3));
    const { result, rerender } = renderHook(({ abierto }) => useNotificationCenter(abierto), {
      initialProps: { abierto: false },
    });
    rerender({ abierto: true });
    await waitFor(() => expect(result.current.notifications).toHaveLength(3));
    await act(async () => {
      soltarCorta(respuesta([aviso], 3));
    });
    expect(result.current.notifications).toHaveLength(3);
    expect(result.current.isLoading).toBe(false);
  });
});
