/**
 * ADR-462: el borrador del plano es POR permiso. Cambiar de permiso y volver
 * conserva lo que quedó sin guardar, y no se cuela en el otro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useLothMapaGeo } from "@/components/admin/forestal/hooks/use-loth-mapa-geo";
import { emptyCartografia } from "@/lib/forestal/loth-cartografia";
import type { AlcanceMapa } from "@/components/admin/forestal/loth-mapa-alcance";

const ref = { id: "ref-1", nombre: "Campamento", tipo: "campamento" as const, lat: -8, lng: -74, nota: "" };

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const cuerpo = String(url).includes("/cartografia")
        ? { cartografia: emptyCartografia(), porPermiso: [] }
        : { parcela: { vertices: [], nota: "", deforestacionCero: false, updatedAt: null }, heredada: false, porPermiso: [] };
      return new Response(JSON.stringify(cuerpo), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("borrador del plano por permiso", () => {
  it("cambiar de permiso y volver conserva el borrador; el otro permiso no lo ve", async () => {
    const A: AlcanceMapa = { tipo: "plan", planId: "A" };
    const B: AlcanceMapa = { tipo: "plan", planId: "B" };
    const { result, rerender } = renderHook(({ alcance }) => useLothMapaGeo(alcance, () => {}), { initialProps: { alcance: A } });
    await waitFor(() => expect(result.current.geoListo).toBe(true));

    act(() => result.current.setCarto((c) => ({ ...c, referencias: [ref] })));
    expect(result.current.carto.referencias).toHaveLength(1);
    expect(result.current.cartoSinGuardar).toBe(true);

    rerender({ alcance: B });
    await waitFor(() => expect(result.current.geoListo).toBe(true));
    expect(result.current.carto.referencias).toHaveLength(0);
    expect(result.current.cartoSinGuardar).toBe(false);

    rerender({ alcance: A });
    await waitFor(() => expect(result.current.geoListo).toBe(true));
    expect(result.current.carto.referencias).toHaveLength(1);
    expect(result.current.cartoSinGuardar).toBe(true);
  });
});
