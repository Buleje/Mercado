/**
 * useReservaDelMixto (ADR-441): la pistola lee más rápido de lo que el servidor
 * contesta. Ninguna lectura se pierde, las que llegan mientras un pedido viaja
 * salen JUNTAS en el siguiente, se relee UNA vez al vaciarse la fila, y la
 * chapa sigue «apartando» hasta que la relectura la trae (no parpadea).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useReservaDelMixto } from "@/components/admin/forestal/hooks/use-reserva-del-mixto";
import type { ResultadoReserva } from "@/components/admin/forestal/hooks/use-lotes-mixtos";

type Pedido = { accion: string; ids: string[]; resolver: (r: ResultadoReserva) => void };

let pedidos: Pedido[];
let relecturas: { resolver: () => void }[];

beforeEach(() => {
  pedidos = [];
  relecturas = [];
  /* jsdom sin IndexedDB: la cola del patio no existe y el hook no se rompe. */
  vi.stubGlobal("indexedDB", undefined);
});
afterEach(() => vi.unstubAllGlobals());

function montar() {
  const reservar = vi.fn(
    (_m: { id: string; code: string }, accion: "agregar" | "quitar", ids: string[]) =>
      new Promise<ResultadoReserva>((resolver) => pedidos.push({ accion, ids, resolver })),
  );
  const alTerminar = vi.fn(() => new Promise<void>((resolver) => relecturas.push({ resolver })));
  const hook = renderHook(() =>
    useReservaDelMixto({
      mixto: { id: "M1", code: "LM-2026-001" },
      reservar,
      alTerminar,
      codigoDe: (id) => id.toUpperCase(),
    }),
  );
  return { hook, reservar, alTerminar };
}

const ok = (hechas: number): ResultadoReserva => ({ estado: "ok", hechas, rechazadas: [] });

describe("useReservaDelMixto", () => {
  it("3 lecturas seguidas → 2 pedidos (1 + las 2 que esperaron) y UNA relectura", async () => {
    const { hook, reservar, alTerminar } = montar();
    act(() => hook.result.current.apartar("a"));
    act(() => hook.result.current.apartar("b"));
    act(() => hook.result.current.apartar("c"));
    expect(reservar).toHaveBeenCalledTimes(1);
    expect(pedidos[0]!.ids).toEqual(["a"]);
    expect([...hook.result.current.apartando]).toEqual(["a", "b", "c"]);

    await act(async () => pedidos[0]!.resolver(ok(1)));
    await waitFor(() => expect(reservar).toHaveBeenCalledTimes(2));
    expect(pedidos[1]!.ids).toEqual(["b", "c"]);
    expect(alTerminar).not.toHaveBeenCalled();

    await act(async () => pedidos[1]!.resolver(ok(2)));
    await waitFor(() => expect(alTerminar).toHaveBeenCalledTimes(1));
    /* Hasta que la relectura vuelve, siguen «apartando»: no parpadean. */
    expect(hook.result.current.apartando.size).toBe(3);
    await act(async () => relecturas[0]!.resolver());
    await waitFor(() => expect(hook.result.current.apartando.size).toBe(0));
    expect(hook.result.current.trabajando).toBe(false);
  });

  it("apartar y sacar no se mezclan en un pedido; el orden se respeta", async () => {
    const { hook } = montar();
    act(() => hook.result.current.apartar("a"));
    act(() => hook.result.current.sacar("x"));
    act(() => hook.result.current.apartar("b"));
    await act(async () => pedidos[0]!.resolver(ok(1)));
    await waitFor(() => expect(pedidos).toHaveLength(2));
    expect(pedidos[1]).toMatchObject({ accion: "quitar", ids: ["x"] });
    await act(async () => pedidos[1]!.resolver(ok(1)));
    await waitFor(() => expect(pedidos).toHaveLength(3));
    expect(pedidos[2]).toMatchObject({ accion: "agregar", ids: ["b"] });
  });

  it("lo rechazado pieza por pieza y el error entero quedan a la vista", async () => {
    const { hook } = montar();
    act(() => hook.result.current.apartar("a"));
    await act(async () =>
      pedidos[0]!.resolver({ estado: "ok", hechas: 0, rechazadas: [{ id: "a", codigo: "118", motivo: "Su guía no se recibió" }] }),
    );
    await waitFor(() => expect(hook.result.current.rechazadas).toHaveLength(1));
    await act(async () => relecturas[0]!.resolver());

    act(() => hook.result.current.apartar("b"));
    await act(async () => pedidos[1]!.resolver({ estado: "error", mensaje: "El lote mixto ya se repartió" }));
    await waitFor(() => expect(hook.result.current.error).toBe("El lote mixto ya se repartió"));
    act(() => hook.result.current.cerrarAvisos());
    expect(hook.result.current.rechazadas).toHaveLength(0);
    expect(hook.result.current.error).toBeNull();
  });
});
