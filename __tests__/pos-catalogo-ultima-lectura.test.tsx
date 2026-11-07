/**
 * La caja pide la lista de productos al abrir y otra vez tras cada venta. Si la
 * lectura de ANTES llega después, pintaba el stock anterior a la venta (radar
 * 2026-09-14). Sólo aplica la última lectura pedida.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/contexts/tenant-context", () => ({ useTenantSlug: () => "qa", tenantKey: (_s: string, k: string) => `qa-${k}` }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { usePOSCatalogo } from "@/components/admin/pos/usePOSCatalogo";

type Resolver = (body: unknown) => void;

function respuesta(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

const producto = (stock: number) => [{ id: 1, name: "Arroz", price: 4, stock, active: true }];

let pendientes: Resolver[] = [];

beforeEach(() => {
  pendientes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/products") return new Promise<Response>((res) => pendientes.push((b) => res(respuesta(b))));
      if (url.startsWith("/api/cash-registers")) return Promise.resolve(respuesta([]));
      return Promise.resolve(respuesta({ turnos: [] }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("lista de productos de la caja", () => {
  it("la lectura vieja que llega tarde no pisa el stock de después de vender", async () => {
    const { result } = renderHook(() => usePOSCatalogo());
    await waitFor(() => expect(pendientes).toHaveLength(1)); // carga inicial en vuelo

    // Se vende y se pide de nuevo: esta es la lista buena (stock 9).
    act(() => void result.current.fetchProducts());
    await waitFor(() => expect(pendientes).toHaveLength(2));

    await act(async () => pendientes[1](producto(9)));
    await waitFor(() => expect(result.current.products[0]?.stock).toBe(9));

    // Llega tarde la carga inicial (stock 10, de antes de vender): se descarta.
    await act(async () => pendientes[0](producto(10)));
    expect(result.current.products[0]?.stock).toBe(9);
  });

  it("una sola lectura se aplica normal", async () => {
    const { result } = renderHook(() => usePOSCatalogo());
    await waitFor(() => expect(pendientes).toHaveLength(1));
    await act(async () => pendientes[0](producto(7)));
    await waitFor(() => expect(result.current.products[0]?.stock).toBe(7));
    expect(result.current.loading).toBe(false);
  });
});
