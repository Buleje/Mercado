/**
 * use-panel-lotes (03-10): cada acción del panel «Lotes» va por la puerta del
 * Libro que le toca y el bloque queda con su `loteId` y sus `trozaIds`. Las
 * escrituras están mockeadas: nunca se prueba contra la base real.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { EstadoLotesAserrio } from "@/components/admin/forestal/hooks/use-lotes-aserrio";

const api = vi.hoisted(() => ({
  leerPropuestasDelPatio: vi.fn(),
  crearLotesDelPatio: vi.fn(),
  anotarLoteEnLaGuardada: vi.fn(),
  crearLotesPorBloque: vi.fn(),
}));
vi.mock("@/components/admin/forestal/reparto-panel-lotes-api", () => ({
  leerPropuestasDelPatio: api.leerPropuestasDelPatio,
  crearLotesDelPatio: api.crearLotesDelPatio,
}));
vi.mock("@/components/admin/forestal/reparto-lotes-sugeridos-api", () => ({
  anotarLoteEnLaGuardada: api.anotarLoteEnLaGuardada,
  crearLotesPorBloque: api.crearLotesPorBloque,
}));

import { usePanelLotes } from "@/components/admin/forestal/hooks/use-panel-lotes";

const PATIO_VACIO = { propuestas: [], esperanGuia: { trozas: 0, m3: 0, guias: 0 }, sinEspecie: { trozas: 0, m3: 0 }, sinPermiso: { trozas: 0, m3: 0 } };

const lote = (extra: Partial<LoteAserrio> = {}): LoteAserrio => ({
  id: "L1", code: "LA-2026-007", speciesCommon: "Tornillo", speciesScientific: null, status: "abierto", notes: null, permiso: "P1",
  fechaApertura: "2026-10-01", fechaConsumo: null, produccionEntryId: null, piezas: 2, volumenM3: 5,
  trozas: [
    { id: "a", codificacion: "A", codigoPlanta: null, volumenM3: 2, consumidaEnId: null },
    { id: "b", codificacion: "B", codigoPlanta: null, volumenM3: 3, consumidaEnId: null },
  ],
  ...extra,
});

const manual: BloqueRolliza = { id: "m1", etiqueta: "A mano", especie: "Tornillo", m3: 5, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null };

function montar(bloques: BloqueRolliza[], distribucionId: string | null = "D1") {
  api.leerPropuestasDelPatio.mockResolvedValue(PATIO_VACIO);
  api.anotarLoteEnLaGuardada.mockResolvedValue(undefined);
  const estado = {
    lotes: [lote()], trozas: [], patioTruncado: null, cargando: false, error: null,
    recargar: vi.fn().mockResolvedValue(undefined),
    agregarTrozas: vi.fn(),
    quitarTroza: vi.fn().mockResolvedValue(undefined),
  } as unknown as EstadoLotesAserrio;
  const guardados: BloqueRolliza[][] = [];
  const onGuardar = vi.fn((next: BloqueRolliza[]) => guardados.push(next));
  const h = renderHook(() => usePanelLotes({ bloques, onGuardar, estadoLotes: estado, distribucionId }));
  return { h, estado, guardados };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("usePanelLotes", () => {
  it("al abrir lee lo que propone el patio y recarga los lotes", async () => {
    const { h, estado } = montar([]);
    await waitFor(() => expect(h.result.current.patio).toEqual(PATIO_VACIO));
    expect(estado.recargar).toHaveBeenCalled();
  });

  it("crear del patio: cada lote creado entra como bloque con sus trozas (lo nuevo no se anota en la guardada)", async () => {
    const { h, guardados } = montar([manual]);
    api.crearLotesDelPatio.mockResolvedValue({
      creados: [{ loteId: "L9", code: "LA-2026-009", especie: "Tornillo", permiso: "P1", trozas: 2, m3: 4.2, trozaIds: ["x", "y"], noEntraron: [] }],
      noCreados: [],
    });
    const propuesta = { clave: "tornillo|P1", especie: "Tornillo", especieCientifica: null, permiso: "P1", titular: null, trozas: 2, m3: 4.2, ptAserrable: 999, trozaIds: ["x", "y"] };
    await act(async () => { await h.result.current.crearDelPatio([propuesta]); });
    expect(api.crearLotesDelPatio).toHaveBeenCalledWith([{ especie: "Tornillo", permiso: "P1", trozaIds: ["x", "y"] }]);
    const ultima = guardados.at(-1)!;
    expect(ultima).toHaveLength(2);
    expect(ultima[1]).toMatchObject({ origen: "lote", loteId: "L9", trozaIds: ["x", "y"], m3: 4.2, etiqueta: "Lote LA-2026-009" });
    expect(api.anotarLoteEnLaGuardada).not.toHaveBeenCalled();
  });

  it("vincular: el bloque a mano toma el lote y sus trozas, y se anota SÓLO eso en la guardada", async () => {
    const { h, guardados } = montar([manual]);
    let motivo: string | null = "sin correr";
    act(() => { motivo = h.result.current.vincular("m1", lote()); });
    expect(motivo).toBeNull();
    expect(guardados.at(-1)![0]).toMatchObject({ id: "m1", loteId: "L1", trozaIds: ["a", "b"] });
    expect(api.anotarLoteEnLaGuardada).toHaveBeenCalledWith("D1", new Map([["m1", { loteId: "L1", trozaIds: ["a", "b"] }]]));
  });

  it("vincular sin guardada abierta: sólo el dispositivo", async () => {
    const { h } = montar([manual], null);
    act(() => { h.result.current.vincular("m1", lote()); });
    expect(api.anotarLoteEnLaGuardada).not.toHaveBeenCalled();
  });

  it("agregar al lote: va por agregarTrozas y el bloque suma sólo las que entraron", async () => {
    const conLote = { ...manual, loteId: "L1", trozaIds: ["a", "b"] };
    const { h, estado, guardados } = montar([conLote]);
    vi.mocked(estado.agregarTrozas).mockResolvedValue({ loteId: "L1", code: null, agregadas: 1, rechazadas: [{ id: "d", codigo: "D", motivo: "es del permiso P2 y el lote LA-2026-007 es del P1" }] });
    await act(async () => { await h.result.current.agregarAlLote("m1", lote(), ["c", "d"]); });
    expect(estado.agregarTrozas).toHaveBeenCalledWith("L1", ["c", "d"]);
    expect(guardados.at(-1)![0]!.trozaIds).toEqual(["a", "b", "c"]);
  });

  it("crear el lote de un bloque a mano: EXACTAMENTE las elegidas, todo o nada", async () => {
    const { h, guardados } = montar([manual]);
    api.crearLotesPorBloque.mockResolvedValueOnce({ creados: [], noCreados: [{ bloqueId: "m1", motivo: "El ingreso no tiene permiso" }] });
    await act(async () => { await h.result.current.crearLoteDelBloque("m1", ["c"]); });
    expect(guardados).toHaveLength(0);
    api.crearLotesPorBloque.mockResolvedValueOnce({
      creados: [{ bloqueId: "m1", loteId: "L5", code: "LA-2026-005", especie: "Tornillo", permiso: "P1", trozas: 1, m3: 1.5 }],
      noCreados: [],
    });
    await act(async () => { await h.result.current.crearLoteDelBloque("m1", ["c"]); });
    expect(api.crearLotesPorBloque).toHaveBeenLastCalledWith([{ bloqueId: "m1", etiqueta: "A mano", trozaIds: ["c"] }]);
    expect(guardados.at(-1)![0]).toMatchObject({ loteId: "L5", trozaIds: ["c"], permiso: "P1" });
  });

  it("quitar del lote: va por quitarTroza y el bloque la olvida", async () => {
    const conLote = { ...manual, loteId: "L1", trozaIds: ["a", "b"] };
    const { h, estado, guardados } = montar([conLote]);
    await act(async () => { await h.result.current.quitarDelLote("m1", lote(), "a"); });
    expect(estado.quitarTroza).toHaveBeenCalledWith("L1", "a");
    expect(guardados.at(-1)![0]!.trozaIds).toEqual(["b"]);
  });
});
