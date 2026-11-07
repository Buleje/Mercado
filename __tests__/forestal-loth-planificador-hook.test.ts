// @vitest-environment jsdom
/**
 * useLothPlanificador — «Agregar al plano» después de mover el patio (review
 * 29-09-2026). Durante los 450 ms del retardo y mientras se recalculaba,
 * `cargando` seguía en false y «Agregar al plano» guardaba la propuesta del
 * patio ANTERIOR (el pin ya estaba en el lugar nuevo); la respuesta que llegaba
 * después hacía `setAgregado(null)` y se perdía el «Deshacer».
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCartografia } from "@/lib/forestal/loth-cartografia";
import { planificarExtraccion } from "@/lib/forestal/loth-planificador";
import { useLothPlanificador } from "@/components/admin/forestal/hooks/use-loth-planificador";

const propuesta = planificarExtraccion({
  arboles: [
    { id: "a1", codigo: "1", lat: -9.8, lng: -74.8, m3: 4, etapa: "en_pie" },
    { id: "a2", codigo: "2", lat: -9.801, lng: -74.801, m3: 3, etapa: "en_pie" },
  ],
  predio: [],
  rios: [],
  caminos: [],
  elevacion: null,
});

function mockFetch(puedeGuardar = true) {
  return vi.fn(async (url: string) => {
    const cuerpo = String(url).includes("/loth/geografia")
      ? { bbox: { sur: -9.81, oeste: -74.81, norte: -9.79, este: -74.79 }, base: "arboles", rios: [], caminos: [], fuentes: { osm: null, elevacion: null }, avisos: [], desdeCache: true }
      : { planId: "p1", propuesta, msCalculo: 1, puedeGuardar, arboles: { considerados: 2, sinCoordenadas: 0, excluidos: [] }, geografia: null };
    return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLothPlanificador — agregar tras mover el patio", () => {
  it("con el patio recién movido, «Agregar al plano» espera la propuesta nueva", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const guardarCartografia = vi.fn(async () => ({ ok: true as const, cartografia: emptyCartografia() }));
    const { result } = renderHook(() => useLothPlanificador({ planId: "p1", carto: emptyCartografia(), guardarCartografia, onEncuadrar: () => {} }));

    await act(async () => {
      result.current.proponer();
    });
    await waitFor(() => expect(result.current.respuesta).not.toBeNull());
    expect(result.current.cargando).toBe(false);

    act(() => result.current.moverPatio([-9.805, -74.805]));
    // Recién soltado: lo que se ve es la propuesta del patio anterior.
    expect(result.current.cargando).toBe(true);
    await act(async () => {
      await result.current.agregarAlPlano();
    });
    expect(guardarCartografia).not.toHaveBeenCalled();

    // Llega la propuesta del patio nuevo: ahora sí se agrega.
    await waitFor(() => expect(result.current.cargando).toBe(false), { timeout: 3_000 });
    await act(async () => {
      await result.current.agregarAlPlano();
    });
    expect(guardarCartografia).toHaveBeenCalledTimes(1);
    expect(result.current.agregado).not.toBeNull();
  });

  it("otro guardó el plano en el medio (409): mezcla la propuesta sobre lo último y reintenta UNA vez", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const deOtro = { ...emptyCartografia(), referencias: [{ id: "ref-otro", nombre: "Puesto de otro", tipo: "hito" as const, lat: -9.8, lng: -74.8, nota: "" }], updatedAt: "2026-09-29T15:10:00.000Z" };
    const guardarCartografia = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, conflicto: deOtro })
      .mockImplementationOnce(async (c: ReturnType<typeof emptyCartografia>) => ({ ok: true, cartografia: c }));
    const { result } = renderHook(() => useLothPlanificador({ planId: "p1", carto: emptyCartografia(), guardarCartografia, onEncuadrar: () => {} }));
    await act(async () => {
      result.current.proponer();
    });
    await waitFor(() => expect(result.current.respuesta).not.toBeNull());
    await act(async () => {
      await result.current.agregarAlPlano();
    });
    expect(guardarCartografia).toHaveBeenCalledTimes(2);
    // El primer intento no avisa (lo resuelve el reintento); el segundo va contra la versión del otro.
    expect(guardarCartografia.mock.calls[0][1]).toEqual({ avisarConflicto: false });
    expect(guardarCartografia.mock.calls[1][1]).toEqual({ base: "2026-09-29T15:10:00.000Z" });
    const segundo = guardarCartografia.mock.calls[1][0] as ReturnType<typeof emptyCartografia>;
    expect(segundo.referencias.map((r) => r.id)).toContain("ref-otro");
    expect(segundo.referencias.some((r) => r.id.startsWith("prop-"))).toBe(true);
    expect(result.current.agregado).not.toBeNull();
  });

  it("sin permiso para guardar, «Agregar al plano» no llama al servidor", async () => {
    vi.stubGlobal("fetch", mockFetch(false));
    const guardarCartografia = vi.fn();
    const { result } = renderHook(() => useLothPlanificador({ planId: "p1", carto: emptyCartografia(), guardarCartografia, onEncuadrar: () => {} }));
    await act(async () => {
      result.current.proponer();
    });
    await waitFor(() => expect(result.current.respuesta).not.toBeNull());
    await act(async () => {
      await result.current.agregarAlPlano();
    });
    expect(guardarCartografia).not.toHaveBeenCalled();
  });
});
