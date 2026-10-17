/**
 * useTrozasDisponibles (2026-09-27): la carga y el Excel de «Trozas disponibles».
 *
 *  · pide el MISMO patio que Consumos, con `?contratoId=` si «Solo este permiso»
 *    está prendido (el filtro lo hace el servidor);
 *  · el Excel es UN archivo en UNA llamada, sin «.xlsx», con el alcance dicho
 *    (se mudó acá desde Consumos);
 *  · la hoja «Por permiso» y la hoja «Por especie» usan el mismo criterio: en el
 *    patio arriba, lo por recepcionar aparte — y sus totales coinciden.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";

const { exportar } = vi.hoisted(() => ({ exportar: vi.fn(async () => {}) }));
vi.mock("@/lib/export-excel", () => ({ exportSheetsToExcel: exportar }));
vi.mock("@/contexts/contrato-activo-context", () => ({
  useContratoActivo: () => ({
    activo: { id: "c1", codigo: "10-HUA", titular: null },
    contratoId: "c1",
    fijar: () => {},
    listo: true,
    soloEste: true,
    setSoloEste: () => {},
    contratoFiltro: "c1",
  }),
}));

import { useTrozasDisponibles } from "@/components/admin/forestal/hooks/use-trozas-disponibles";

const base = {
  woodEntryId: "we1",
  guiaRecepcionada: true,
  fechaRecepcion: "2026-09-08T05:00:00.000Z",
  fechaIngreso: "2026-09-08T00:00:00.000Z",
};
/* Un permiso en el patio (dos especies) y otro con TODO sin recepcionar. */
const PATIO = {
  trozas: [
    {
      ...base,
      id: "a1",
      codificacion: "A1",
      especieComun: "Cachimbo",
      volumenM3: 3,
      permiso: "10-HUA",
      gtfNumber: "G1",
    },
    {
      ...base,
      id: "a2",
      codificacion: "A2",
      especieComun: "Copal",
      volumenM3: 2,
      permiso: "10-HUA",
      gtfNumber: "G1",
    },
    {
      ...base,
      id: "b1",
      codificacion: "B1",
      especieComun: "Tornillo",
      volumenM3: 0.5,
      permiso: "19-SEC",
      gtfNumber: "G9",
      guiaRecepcionada: false,
      fechaRecepcion: null,
    },
  ],
  total: 3,
  devueltas: 3,
  truncado: false,
};

const pedidos: string[] = [];
beforeEach(() => {
  invalidarCtp();
  pedidos.length = 0;
  exportar.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      pedidos.push(url);
      return new Response(JSON.stringify(PATIO), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  invalidarCtp();
});

type Hoja = { nombre: string; filas: Record<string, unknown>[] };

describe("useTrozasDisponibles", () => {
  it("pide el patio con ?contratoId y cuenta en el patio aparte de lo sin recepcionar", async () => {
    const { result } = renderHook(() => useTrozasDisponibles());
    await waitFor(() => expect(result.current.vivas).toHaveLength(3));
    expect(pedidos[0]).toBe("/api/admin/forestal/trozas/patio?contratoId=c1");
    expect(result.current.resumen.enPatio).toMatchObject({ trozas: 2, m3: 5 });
    expect(result.current.resumen.sinRecepcionar).toMatchObject({ trozas: 1, m3: 0.5 });
  });

  it("el Excel sale en UNA llamada, sin «.xlsx», con el alcance y la hoja «Por especie» con el mismo criterio", async () => {
    const { result } = renderHook(() => useTrozasDisponibles());
    await waitFor(() => expect(result.current.porPermiso.filas).toHaveLength(2));
    let error: string | null = "sin correr";
    await act(async () => {
      error = await result.current.descargarExcel();
    });
    expect(error).toBeNull();
    expect(exportar).toHaveBeenCalledTimes(1);
    const [hojas, nombre] = exportar.mock.calls[0] as unknown as [Hoja[], string];
    expect(nombre).toMatch(/^patio-por-permiso-\d{4}-\d{2}-\d{2}$/);
    expect(hojas.slice(0, 2).map((h) => h.nombre)).toEqual(["Por permiso", "Por especie"]);
    expect(JSON.stringify(hojas.find((h) => h.nombre === "Qué se exportó")?.filas)).toContain(
      "10-HUA",
    );

    const suma = (h: Hoja | undefined, col: string) =>
      (h?.filas ?? []).reduce((a, f) => a + Number(f[col] ?? 0), 0);
    const [porPermiso, porEspecie] = hojas;
    for (const col of [
      "Trozas en patio",
      "m³ en patio",
      "Por recepcionar (trozas)",
      "Por recepcionar (m³)",
    ]) {
      expect(suma(porEspecie, col)).toBeCloseTo(suma(porPermiso, col), 3);
    }
    expect(suma(porPermiso, "Trozas en patio")).toBe(2);
    expect(suma(porPermiso, "Por recepcionar (trozas)")).toBe(1);
  });
});
