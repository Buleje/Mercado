/**
 * Servidor de las imágenes recientes del mapa del Libro TH (29-09-2026). La
 * caché y las salidas a internet se simulan: se prueba la DECISIÓN — cuándo se
 * usa lo guardado, qué pasa si el catálogo de Sentinel-2 o NASA no responden
 * (nunca un error: un aviso) y que las nubes ya medidas no se vuelvan a medir.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImagenesDelArea, ItemS2 } from "@/lib/forestal/loth-imagenes";

const H = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  stac: vi.fn(),
  nubes: vi.fn(),
  esri: vi.fn(),
  sondas: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/forest-loth-imagenes.db", () => ({ ForestLothImagenesDB: { get: H.get, set: H.set } }));
vi.mock("@/lib/forestal/loth-imagenes-fuentes", () => ({
  pedirEscenasStac: H.stac,
  pedirNubesDelArea: H.nubes,
  pedirFechaEsri: H.esri,
  sondearDias: H.sondas,
}));

import { obtenerImagenes } from "@/lib/forestal/loth-imagenes-servidor";

const AHORA = "2026-09-29T19:30:00.000Z"; // 14:30 en Lima
const ctx = {
  contorno: [],
  contornoEs: "parcela" as const,
  arboles: [
    { id: "a", codigo: "1", especie: "Copaiba", lat: -9.79, lng: -74.8, m3: 5, dapM: 0.6, condicion: null, estadoCenso: "en_pie" },
    { id: "b", codigo: "2", especie: "Copaiba", lat: -9.788, lng: -74.795, m3: 5, dapM: 0.6, condicion: null, estadoCenso: "en_pie" },
  ],
};
const item = (fecha: string, nubes: number): ItemS2 => ({ id: `S2_${fecha}`, datetime: `${fecha}T15:19:31Z`, nubesPct: nubes, bbox: [-75, -10.04, -74, -9.04] });
const sondasOk = { hay: { "2026-09-28": { VIIRS_NOAA20_CorrectedReflectance_TrueColor: true } }, algunaRespondio: true };

beforeEach(() => {
  vi.clearAllMocks();
  H.get.mockResolvedValue(null);
  H.set.mockResolvedValue(undefined);
  H.stac.mockResolvedValue([item("2026-09-26", 88), item("2026-09-23", 16), item("2026-09-21", 19.5)]);
  H.nubes.mockImplementation(async (id: string) => ({ nubesPct: id.includes("09-26") ? 92 : id.includes("09-23") ? 21 : 3, coberturaPct: 100, pixeles: 1000 }));
  H.esri.mockResolvedValue({ fecha: "2022-06-18", resolucionM: 0.5, sensor: "WV02", proveedor: "Vantor" });
  H.sondas.mockResolvedValue(sondasOk);
});

describe("obtenerImagenes", () => {
  it("sin caché: pide todo, mide las nubes sobre el área, sugiere y guarda", async () => {
    const r = await obtenerImagenes("t1", ctx, { ahoraIso: AHORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imagenes.escenas.map((e) => [e.fecha, e.nubesAreaPct])).toEqual([
      ["2026-09-26", 92],
      ["2026-09-23", 21],
      ["2026-09-21", 3],
    ]);
    expect(r.imagenes.sugerida).toBe("2026-09-23");
    expect(r.imagenes.esri?.fecha).toBe("2022-06-18");
    // Hoy (29-09) NASA todavía no pasó a esta hora: se usa ayer.
    expect(r.imagenes.vivas.colorReal).toEqual({ capa: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", satelite: "NOAA-20", fecha: "2026-09-28" });
    expect(r.imagenes.vivas.focos.fechas).toEqual(["2026-09-28", "2026-09-29"]);
    expect(r.imagenes.avisos).toEqual([]);
    expect(H.set).toHaveBeenCalledTimes(1);
  });

  it("el catálogo caído no es un error: aviso y sin escenas", async () => {
    H.stac.mockResolvedValue(null);
    const r = await obtenerImagenes("t1", ctx, { ahoraIso: AHORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.imagenes.escenas).toEqual([]);
    expect(r.imagenes.sugerida).toBeNull();
    expect(r.imagenes.avisos.join(" ")).toMatch(/Sentinel-2 no respondió/);
  });

  it("con caché vigente de esta zona no sale a internet", async () => {
    const primera = await obtenerImagenes("t1", ctx, { ahoraIso: AHORA });
    if (!primera.ok) throw new Error("debía andar");
    const guardado: ImagenesDelArea = H.set.mock.calls[0][1];
    // La imagen de hoy no estaba: se mira de nuevo recién a la media hora.
    H.get.mockResolvedValue(guardado);
    vi.clearAllMocks();
    H.get.mockResolvedValue(guardado);
    const r = await obtenerImagenes("t1", ctx, { ahoraIso: "2026-09-29T19:45:00.000Z" });
    expect(r.ok && r.imagenes.desdeCache).toBe(true);
    expect(H.stac).not.toHaveBeenCalled();
    expect(H.sondas).not.toHaveBeenCalled();
  });

  it("pasada la media hora sin la imagen de hoy, vuelve a mirar NASA pero no el catálogo", async () => {
    await obtenerImagenes("t1", ctx, { ahoraIso: AHORA });
    const guardado: ImagenesDelArea = H.set.mock.calls[0][1];
    vi.clearAllMocks();
    H.get.mockResolvedValue(guardado);
    H.sondas.mockResolvedValue({ hay: { "2026-09-29": { VIIRS_SNPP_CorrectedReflectance_TrueColor: true } }, algunaRespondio: true });
    const r = await obtenerImagenes("t1", ctx, { ahoraIso: "2026-09-29T21:40:00.000Z" });
    expect(H.stac).not.toHaveBeenCalled();
    expect(H.sondas).toHaveBeenCalledTimes(1);
    expect(r.ok && r.imagenes.vivas.colorReal?.fecha).toBe("2026-09-29");
  });

  it("al refrescar, las nubes ya medidas de una escena no se vuelven a medir", async () => {
    await obtenerImagenes("t1", ctx, { ahoraIso: AHORA });
    const guardado: ImagenesDelArea = H.set.mock.calls[0][1];
    vi.clearAllMocks();
    H.get.mockResolvedValue(guardado);
    H.stac.mockResolvedValue([item("2026-09-28", 5), item("2026-09-26", 88), item("2026-09-23", 16), item("2026-09-21", 19.5)]);
    H.nubes.mockResolvedValue({ nubesPct: 4, coberturaPct: 100, pixeles: 1000 });
    H.esri.mockResolvedValue(null);
    H.sondas.mockResolvedValue(sondasOk);
    const r = await obtenerImagenes("t1", ctx, { ahoraIso: "2026-09-29T20:00:00.000Z", refrescar: true });
    expect(H.nubes).toHaveBeenCalledTimes(1);
    expect(H.nubes.mock.calls[0][0]).toBe("S2_2026-09-28");
    expect(r.ok && r.imagenes.sugerida).toBe("2026-09-28");
    // Esri no respondió: queda la fecha guardada.
    expect(r.ok && r.imagenes.esri?.fecha).toBe("2022-06-18");
  });

  it("sin área ni árboles: el motivo, no un error", async () => {
    const r = await obtenerImagenes("t1", { contorno: [], contornoEs: "parcela", arboles: [] }, { ahoraIso: AHORA });
    expect(r.ok).toBe(false);
  });
});
