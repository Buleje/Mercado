/**
 * usePatioConsumos (ADR-431): el panel Patio de Consumos con «Solo este permiso».
 *
 *  · C4: un lote MIXTO con el filtro prendido muestra sólo sus piezas de este
 *    permiso; el hook cuenta las que no se ven comparando contra el lote tal
 *    como lo devuelve `/lotes-aserrio` (sin filtrar), para avisar antes de
 *    consumir «el lote» dejando en silencio las del otro permiso.
 *  · El patio se pide al servidor con `?contratoId=` (no se filtra en el cliente).
 *  · El Excel del patio es UN archivo en UNA llamada, con el alcance dicho.
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

import { usePatioConsumos } from "@/components/admin/forestal/hooks/use-patio-consumos";

const LOTE = {
  id: "L1",
  code: "LA-1",
  speciesCommon: "Huayruro",
  speciesScientific: null,
  status: "abierto",
  notes: null,
  fechaApertura: "2026-09-10T00:00:00.000Z",
  fechaConsumo: null,
  produccionEntryId: null,
  piezas: 3,
  volumenM3: 3,
  /* Tres piezas vivas en el lote: una de 10-HUA y dos de otro permiso. */
  trozas: [
    { id: "t1", consumidaEnId: null, volumenM3: 1 },
    { id: "t2", consumidaEnId: null, volumenM3: 1 },
    { id: "t3", consumidaEnId: null, volumenM3: 1 },
  ],
};

/* El patio YA acotado por el servidor: sólo la pieza de 10-HUA. */
const PATIO = {
  trozas: [
    {
      id: "t1",
      woodEntryId: "we1",
      codificacion: "A1",
      especieComun: "Huayruro",
      volumenM3: 1,
      guiaRecepcionada: true,
      permiso: "10-HUA",
      gtfNumber: "G1",
      loteAserrioId: "L1",
      fechaRecepcion: "2026-09-08T05:00:00.000Z",
    },
  ],
  total: 1,
  devueltas: 1,
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
      const body = url.includes("/trozas/patio") ? PATIO : { lotes: [LOTE] };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  invalidarCtp();
});

describe("usePatioConsumos con «Solo este permiso»", () => {
  it("pide el patio al servidor con ?contratoId", async () => {
    renderHook(() => usePatioConsumos({ pushToast: vi.fn(() => 1) }));
    await waitFor(() => expect(pedidos.some((u) => u.includes("/trozas/patio"))).toBe(true));
    expect(pedidos.find((u) => u.includes("/trozas/patio"))).toBe("/api/admin/forestal/trozas/patio?contratoId=c1");
  });

  it("C4: un lote mixto avisa cuántas piezas de otro permiso no se ven", async () => {
    const { result } = renderHook(() => usePatioConsumos({ pushToast: vi.fn(() => 1) }));
    await waitFor(() => expect(result.current.lotes.lotes).toHaveLength(1));
    expect(result.current.piezasOcultasDelLote).toBe(0);
    act(() => result.current.carga.setLoteCarga("L1"));
    expect(result.current.piezasOcultasDelLote).toBe(2);
  });

  it("el Excel del patio sale en UNA llamada, sin «.xlsx» en el nombre y con el alcance", async () => {
    const { result } = renderHook(() => usePatioConsumos({ pushToast: vi.fn(() => 1) }));
    await waitFor(() => expect(result.current.porPermiso.filas).toHaveLength(1));
    await act(async () => {
      await result.current.descargarExcel();
    });
    expect(exportar).toHaveBeenCalledTimes(1);
    const [hojas, nombre] = exportar.mock.calls[0] as unknown as [{ nombre: string; filas: Record<string, unknown>[] }[], string];
    expect(nombre).toMatch(/^patio-por-permiso-\d{4}-\d{2}-\d{2}$/);
    const queSeExporto = hojas.find((h) => h.nombre === "Qué se exportó");
    expect(JSON.stringify(queSeExporto?.filas)).toContain("10-HUA");
  });
});
