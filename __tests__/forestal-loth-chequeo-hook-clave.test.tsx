/**
 * useLothCumplimientoAvanzado (reviewer 26-10): la respuesta va con el plan y
 * los ajustes que la pidieron. Al pasar de A a B con el pedido de B en vuelo,
 * no quedan los casos de A; si B falla, tampoco se muestra «el último
 * cálculo» de A. Una recarga fallida del MISMO plan sí conserva el suyo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useLothCumplimientoAvanzado } from "@/components/admin/forestal/hooks/use-loth-cumplimiento-avanzado";

const CHECK_A = { key: "plan_vencido", count: 1, casos: ["PO A: vencido"], severity: "error", penalty: 30, title: "1 plan vencido", okTitle: "", description: "", action: "" };

const responde = (cuerpo: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => cuerpo } as Response);
const nunca = () => new Promise<Response>(() => undefined);

const fetchMock = vi.fn<(url: string) => Promise<Response>>();
beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const montar = () =>
  renderHook((p: { planId: string | null; reloadSignal: number }) => useLothCumplimientoAvanzado({ planId: p.planId, listo: true, reloadSignal: p.reloadSignal }), {
    initialProps: { planId: "A" as string | null, reloadSignal: 0 },
  });

describe("useLothCumplimientoAvanzado — la respuesta es del plan de ahora", () => {
  it("A contesta, se cambia a B con el pedido pendiente → no trae los casos de A", async () => {
    fetchMock.mockImplementation((url) => (url.includes("planId=A") ? responde({ checks: [CHECK_A], sinLeer: [] }) : nunca()));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.terminado).toBe(true));
    expect(result.current.checks).toHaveLength(1);

    rerender({ planId: "B", reloadSignal: 0 });
    expect(result.current.checks).toHaveLength(0);
    expect(result.current.terminado).toBe(false);
    expect(result.current.cargando).toBe(true);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("planId=B");
  });

  it("B falla → error de B, sin «último cálculo» de A", async () => {
    fetchMock.mockImplementation((url) => (url.includes("planId=A") ? responde({ checks: [CHECK_A], sinLeer: [] }) : responde({ error: "internal_error" }, 500)));
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.terminado).toBe(true));

    rerender({ planId: "B", reloadSignal: 0 });
    await waitFor(() => expect(result.current.error).toBe("internal_error"));
    expect(result.current.terminado).toBe(true);
    expect(result.current.leido).toBe(false);
    expect(result.current.checks).toHaveLength(0);
  });

  it("recarga fallida del MISMO plan → conserva su último cálculo y avisa el error", async () => {
    let primera = true;
    fetchMock.mockImplementation(() => {
      const r = primera ? responde({ checks: [CHECK_A], sinLeer: [] }) : responde({ error: "internal_error" }, 500);
      primera = false;
      return r;
    });
    const { result, rerender } = montar();
    await waitFor(() => expect(result.current.checks).toHaveLength(1));

    await act(async () => rerender({ planId: "A", reloadSignal: 1 }));
    await waitFor(() => expect(result.current.error).toBe("internal_error"));
    expect(result.current.leido).toBe(true);
    expect(result.current.checks).toHaveLength(1);
  });
});
