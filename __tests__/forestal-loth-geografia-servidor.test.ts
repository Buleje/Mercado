/**
 * Servidor de la geografía y de la selección de árboles del planificador
 * (29-09-2026). Las DB classes y las salidas a internet se simulan: lo que se
 * prueba es la DECISIÓN — cuándo se usa la caché, qué pasa si OpenStreetMap o
 * Open-Meteo no responden (nunca un error, nunca ríos de otra zona) y qué
 * árboles entran al plan.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeografiaPredio, GrillaElevacion } from "@/lib/forestal/loth-geografia";

const H = vi.hoisted(() => ({
  geoGet: vi.fn(),
  geoSet: vi.fn(),
  overpass: vi.fn(),
  grilla: vi.fn(),
  estado: vi.fn(),
  activo: vi.fn(),
  arboles: vi.fn(),
  parcela: vi.fn(),
  carto: vi.fn(),
  plan: vi.fn(),
  especies: vi.fn(),
  poa: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/forest-loth-geografia.db", () => ({ ForestLothGeografiaDB: { get: H.geoGet, set: H.geoSet } }));
vi.mock("@/lib/forestal/loth-geografia-fuentes", () => ({ pedirOverpass: H.overpass, pedirGrilla: H.grilla }));
vi.mock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { estadoDeArboles: H.estado } }));
vi.mock("@/lib/db/forest-plan.db", () => ({ ForestPlanDB: { getActivePlan: H.activo, listTrees: H.arboles, getPlan: H.plan, listSpecies: H.especies } }));
vi.mock("@/lib/db/forest-loth-poa.db", () => ({ ForestLothPoaDB: { get: H.poa } }));
vi.mock("@/lib/db/forest-loth-parcela.db", () => ({ ForestLothParcelaDB: { get: H.parcela } }));
vi.mock("@/lib/db/forest-loth-cartografia.db", () => ({ ForestLothCartografiaDB: { get: H.carto } }));

import { arbolesParaPlanificar, contextoDelPlan, obtenerGeografia, type ArbolDelCenso } from "@/lib/forestal/loth-geografia-servidor";
import { emptyCartografia } from "@/lib/forestal/loth-cartografia";
import { emptyParcela } from "@/lib/forestal/loth-geo";
import { analizarPoa, defaultPoaConfig } from "@/lib/forestal/loth-poa";

const arbol = (codigo: string, lat: number, lng: number, extra: Partial<ArbolDelCenso> = {}): ArbolDelCenso => ({
  id: `t-${codigo}`,
  codigo,
  especie: "Copaiba",
  lat,
  lng,
  m3: 5,
  condicion: "Aprovechable",
  estadoCenso: "en_pie",
  dapM: 0.6,
  ...extra,
});
const ctx = { contorno: [], contornoEs: "parcela" as const, arboles: [arbol("1", -9.79, -74.8), arbol("2", -9.788, -74.795)] };

const grilla = (bbox: GeografiaPredio["bbox"]): GrillaElevacion => ({ nx: 2, ny: 2, bbox, valores: [300, 310, 320, 330] });
const guardada = (extra: Partial<GeografiaPredio> = {}): GeografiaPredio => {
  const bbox = { sur: -9.9, oeste: -74.9, norte: -9.7, este: -74.7 };
  return {
    bbox,
    base: "arboles",
    rios: [{ nombre: "", tipo: "river", puntos: [[-9.79, -74.81], [-9.78, -74.81]], origen: "osm" }],
    caminos: [],
    elevacion: grilla(bbox),
    fuentes: { osm: "2026-09-20T15:00:00.000Z", elevacion: "2026-09-20T15:00:00.000Z" },
    avisos: [],
    ...extra,
  };
};

beforeEach(() => {
  for (const f of Object.values(H)) f.mockReset();
  H.geoSet.mockResolvedValue(undefined);
  H.plan.mockResolvedValue({ id: "plan-1", areaHa: null });
  H.especies.mockResolvedValue([]);
  H.poa.mockResolvedValue(defaultPoaConfig());
});

describe("obtenerGeografia", () => {
  it("caché completa que cubre la zona → no sale a internet", async () => {
    H.geoGet.mockResolvedValue(guardada());
    const r = await obtenerGeografia("t1", ctx);
    expect(r.ok && r.geografia.desdeCache).toBe(true);
    expect(H.overpass).not.toHaveBeenCalled();
    expect(H.grilla).not.toHaveBeenCalled();
    expect(H.geoGet).toHaveBeenCalledWith("t1");
  });

  it("sin caché: pide las dos fuentes sobre el recuadro del servidor y guarda", async () => {
    H.geoGet.mockResolvedValue(null);
    H.overpass.mockImplementation(async () => ({ rios: [], caminos: [{ nombre: "", tipo: "track", puntos: [[-9.79, -74.8], [-9.78, -74.8]], origen: "osm", vehicular: true }], espejo: "x" }));
    H.grilla.mockImplementation(async (b) => ({ grilla: grilla(b), faltan: 0, total: 4 }));
    const r = await obtenerGeografia("t1", ctx, { ahoraIso: "2026-09-29T15:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geografia.fuentes).toEqual({ osm: "2026-09-29T15:00:00.000Z", elevacion: "2026-09-29T15:00:00.000Z" });
    expect(r.geografia.caminos).toHaveLength(1);
    // El recuadro sale de los árboles guardados (+500 m), no de nada que mande el navegador.
    const b = H.overpass.mock.calls[0][0];
    expect(b.sur).toBeLessThan(-9.79);
    expect(b.norte).toBeGreaterThan(-9.788);
    expect(H.geoSet).toHaveBeenCalledWith("t1", expect.objectContaining({ bbox: b }), "sistema");
  });

  it("refrescar con OpenStreetMap caído → usa los ríos guardados con su fecha, y el relieve nuevo", async () => {
    H.geoGet.mockResolvedValue(guardada());
    H.overpass.mockResolvedValue(null);
    H.grilla.mockImplementation(async (b) => ({ grilla: grilla(b), faltan: 0, total: 4 }));
    const r = await obtenerGeografia("t1", ctx, { refrescar: true, ahoraIso: "2026-09-29T15:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geografia.rios).toHaveLength(1);
    expect(r.geografia.fuentes.osm).toBe("2026-09-20T15:00:00.000Z");
    expect(r.geografia.fuentes.elevacion).toBe("2026-09-29T15:00:00.000Z");
    expect(r.geografia.avisos.join(" ")).toMatch(/OpenStreetMap no respondió: se usan los ríos y caminos guardados el 20\/09\/2026/);
  });

  it("todo caído y sin caché → responde igual, vacío y con los avisos; guarda el fallo (caché negativa)", async () => {
    H.geoGet.mockResolvedValue(null);
    H.overpass.mockResolvedValue(null);
    H.grilla.mockResolvedValue({ grilla: null, faltan: 4, total: 4 });
    const r = await obtenerGeografia("t1", ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geografia).toMatchObject({ rios: [], caminos: [], elevacion: null, fuentes: { osm: null, elevacion: null } });
    expect(r.geografia.avisos.join(" ")).toMatch(/OpenStreetMap no respondió/);
    expect(r.geografia.avisos.join(" ")).toMatch(/servicio de altitud no respondió/);
    expect(H.geoSet).toHaveBeenCalledTimes(1);
    const guardado = H.geoSet.mock.calls[0][1] as GeografiaPredio;
    expect(guardado.fallos?.osm).not.toBeNull();
    expect(guardado.fallos?.elevacion).not.toBeNull();
  });

  it("la caché de OTRA zona no se usa (sus ríos dirían que acá no hay agua)", async () => {
    H.geoGet.mockResolvedValue(guardada({ bbox: { sur: -10.5, oeste: -75.5, norte: -10.4, este: -75.4 } }));
    H.overpass.mockResolvedValue(null);
    H.grilla.mockResolvedValue({ grilla: null, faltan: 4, total: 4 });
    const r = await obtenerGeografia("t1", ctx);
    expect(r.ok && r.geografia.rios).toEqual([]);
    expect(H.overpass).toHaveBeenCalled();
  });

  it("la caché cubre pero le falta el relieve → pide sólo el relieve", async () => {
    H.geoGet.mockResolvedValue(guardada({ elevacion: null, fuentes: { osm: "2026-09-20T15:00:00.000Z", elevacion: null } }));
    H.grilla.mockImplementation(async (b) => ({ grilla: grilla(b), faltan: 0, total: 4 }));
    const r = await obtenerGeografia("t1", ctx);
    expect(H.overpass).not.toHaveBeenCalled();
    expect(H.grilla).toHaveBeenCalledTimes(1);
    expect(r.ok && r.geografia.elevacion).not.toBeNull();
  });

  it("el planificador (soloCache) con caché incompleta no sale a internet", async () => {
    H.geoGet.mockResolvedValue(guardada({ rios: [], fuentes: { osm: null, elevacion: "2026-09-20T15:00:00.000Z" } }));
    const r = await obtenerGeografia("t1", ctx, { soloCache: true });
    expect(H.overpass).not.toHaveBeenCalled();
    expect(H.grilla).not.toHaveBeenCalled();
    expect(r.ok && r.geografia.avisos.join(" ")).toMatch(/Todavía no se tienen los ríos y caminos/);
  });

  it("soloCache sin nada guardado: tampoco sale a internet, y lo dice", async () => {
    H.geoGet.mockResolvedValue(null);
    const r = await obtenerGeografia("t1", ctx, { soloCache: true, refrescar: true });
    expect(H.overpass).not.toHaveBeenCalled();
    expect(H.grilla).not.toHaveBeenCalled();
    expect(H.geoSet).not.toHaveBeenCalled();
    expect(r.ok && r.geografia.avisos.join(" ")).toMatch(/Todavía no se trajo la geografía/);
  });

  it("caché negativa: con OpenStreetMap caído hace 5 min no se lo vuelve a llamar; con «Actualizar» sí", async () => {
    const hace5 = "2026-09-29T14:55:00.000Z";
    H.geoGet.mockResolvedValue(guardada({ rios: [], fuentes: { osm: null, elevacion: "2026-09-29T14:00:00.000Z" }, fallos: { osm: hace5, elevacion: null } }));
    const r = await obtenerGeografia("t1", ctx, { ahoraIso: "2026-09-29T15:00:00.000Z" });
    expect(H.overpass).not.toHaveBeenCalled();
    expect(H.geoSet).not.toHaveBeenCalled();
    expect(r.ok && r.geografia.avisos.join(" ")).toMatch(/OpenStreetMap no respondió a las .* se vuelve a intentar desde las/);

    H.overpass.mockResolvedValue({ rios: [], caminos: [], espejo: "x" });
    H.grilla.mockImplementation(async (b) => ({ grilla: grilla(b), faltan: 0, total: 4 }));
    await obtenerGeografia("t1", ctx, { ahoraIso: "2026-09-29T15:00:00.000Z", refrescar: true });
    expect(H.overpass).toHaveBeenCalledTimes(1);
  });

  it("caché negativa vencida (más de 10 min): se vuelve a intentar", async () => {
    H.geoGet.mockResolvedValue(guardada({ rios: [], fuentes: { osm: null, elevacion: "2026-09-29T14:00:00.000Z" }, fallos: { osm: "2026-09-29T14:45:00.000Z", elevacion: null } }));
    H.overpass.mockResolvedValue(null);
    await obtenerGeografia("t1", ctx, { ahoraIso: "2026-09-29T15:00:00.000Z" });
    expect(H.overpass).toHaveBeenCalledTimes(1);
    expect((H.geoSet.mock.calls[0][1] as GeografiaPredio).fallos?.osm).toBe("2026-09-29T15:00:00.000Z");
  });

  it("altitud a medias (una tanda no llegó): se guarda y se usa, avisando qué faltó", async () => {
    H.geoGet.mockResolvedValue(null);
    H.overpass.mockResolvedValue({ rios: [], caminos: [], espejo: "x" });
    H.grilla.mockImplementation(async (b) => ({ grilla: grilla(b), faltan: 100, total: 441 }));
    const r = await obtenerGeografia("t1", ctx, { ahoraIso: "2026-09-29T15:00:00.000Z" });
    expect(r.ok && r.geografia.elevacion).not.toBeNull();
    expect(r.ok && r.geografia.avisos.join(" ")).toMatch(/Faltó la altitud de 100 de 441 puntos/);
    expect((H.geoSet.mock.calls[0][1] as GeografiaPredio).fallos?.elevacion).toBe("2026-09-29T15:00:00.000Z");
  });

  it("sin contorno ni árboles → no ok, con el motivo (la ruta lo da como 422)", async () => {
    H.geoGet.mockResolvedValue(null);
    const r = await obtenerGeografia("t1", { contorno: [], contornoEs: "parcela", arboles: [] });
    expect(r.ok).toBe(false);
    expect(H.overpass).not.toHaveBeenCalled();
  });
});

describe("contextoDelPlan", () => {
  it("el tenant va primero en cada DB class; el predio dibujado gana a la parcela; cuenta los sin UTM", async () => {
    H.activo.mockResolvedValue({ id: "plan-activo" });
    H.parcela.mockResolvedValue({ ...emptyParcela(), vertices: [[-9.8, -74.8], [-9.8, -74.79], [-9.79, -74.79]] });
    H.carto.mockResolvedValue({ ...emptyCartografia(), predio: { nombre: "", sector: "", comunidad: "", vertices: [[-9.81, -74.81], [-9.81, -74.78], [-9.78, -74.78]] } });
    H.arboles.mockResolvedValue({
      trees: [
        { id: "a", treeCode: "102", speciesCommon: "Copaiba", utmZona: null, utmX: "522156.00", utmY: "8918084.00", volumenEstimadoM3: "8.6840", condicion: "Aprovechable", estado: "en_pie" },
        { id: "b", treeCode: "103", speciesCommon: "Cedro", utmZona: "18L", utmX: null, utmY: null, volumenEstimadoM3: null, condicion: null, estado: "en_pie" },
      ],
      total: 2,
      truncado: false,
    });
    const c = await contextoDelPlan("t1");
    expect(H.activo).toHaveBeenCalledWith("t1");
    expect(H.arboles).toHaveBeenCalledWith("t1", "plan-activo");
    expect(H.parcela).toHaveBeenCalledWith("t1");
    expect(H.carto).toHaveBeenCalledWith("t1");
    expect(c.contornoEs).toBe("predio");
    expect(c.sinCoordenadas).toBe(1);
    expect(c.arboles).toHaveLength(1);
    // UTM sin zona → 18 sur, como el mapa: el árbol 102 de Blas cae donde lo
    // pone el fixture (convertido con la misma función que el mapa).
    expect(c.arboles[0].lat).toBeCloseTo(-9.7874228, 6);
    expect(c.arboles[0].lng).toBeCloseTo(-74.7979688, 6);
    expect(c.arboles[0].m3).toBeCloseTo(8.684, 3);
  });

  it("sin plan activo → sin árboles, sin consultar el censo", async () => {
    H.activo.mockResolvedValue(null);
    H.parcela.mockResolvedValue(emptyParcela());
    H.carto.mockResolvedValue(emptyCartografia());
    const c = await contextoDelPlan("t1");
    expect(c.planId).toBeNull();
    expect(H.arboles).not.toHaveBeenCalled();
  });
});

describe("arbolesParaPlanificar", () => {
  const estado = (treeId: string, etapa: string, enMonte = 0) => ({ treeId, treeCode: treeId, etapa, estadoCenso: "en_pie", trozas: { total: enMonte, despachadas: 0, consumidas: 0, enMonte, enCtp: 0 } });
  const base = [
    arbol("P", -9.79, -74.8),
    arbol("SEM", -9.79, -74.8, { condicion: "Semillero" }),
    arbol("DMC", -9.79, -74.8, { condicion: "Bajo DMC" }),
    arbol("TAL", -9.79, -74.8),
    arbol("TRZ", -9.79, -74.8),
    arbol("TRZ0", -9.79, -74.8),
    arbol("DES", -9.79, -74.8),
  ];

  it("entran los en pie y lo que tiene madera en el monte; semilleros, bajo DMC y despachados no", async () => {
    H.estado.mockResolvedValue({
      arboles: [estado("t-P", "en_pie"), estado("t-TAL", "talado"), estado("t-TRZ", "trozado", 2), estado("t-TRZ0", "trozado", 0), estado("t-DES", "despachado")],
      sinCenso: [],
    });
    const r = await arbolesParaPlanificar("t1", { planId: "plan-1", arboles: base });
    expect(H.estado).toHaveBeenCalledWith("t1", "plan-1");
    expect(r.arboles.map((a) => [a.codigo, a.etapa])).toEqual([
      ["P", "en_pie"],
      ["TAL", "talado"],
      ["TRZ", "trozado"],
    ]);
    const motivos = Object.fromEntries(r.excluidos.map((e) => [e.motivo, e.codigos]));
    expect(motivos["Semillero: no se tala"]).toEqual(["SEM"]);
    expect(motivos["Bajo el diámetro mínimo de corta"]).toEqual(["DMC"]);
    expect(motivos["Sus trozas ya salieron del monte"]).toEqual(["TRZ0"]);
    expect(motivos["Ya despachado: salió del monte"]).toEqual(["DES"]);
  });

  it("el semillero que reserva el POA (sin marca del regente) también queda afuera", async () => {
    // Diez Copaibas aprovechables según el regente: el POA reserva el 10 % como semillero.
    const copaibas = Array.from({ length: 10 }, (_, i) => arbol(`C${i + 1}`, -9.79, -74.8, { dapM: 0.5 + i * 0.05 }));
    H.estado.mockResolvedValue({ arboles: copaibas.map((a) => estado(a.id, "en_pie")), sinCenso: [] });
    const esperado = analizarPoa({
      trees: copaibas.map((a) => ({ id: a.id, treeCode: a.codigo, speciesCommon: a.especie, dapM: a.dapM, volumenEstimadoM3: a.m3, estado: "en_pie" })),
      species: [],
      areaHa: null,
      config: defaultPoaConfig(),
    }).arboles.filter((x) => x.categoria === "semillero").map((x) => x.treeCode);
    expect(esperado.length).toBeGreaterThan(0);
    const r = await arbolesParaPlanificar("t1", { planId: "plan-1", arboles: copaibas });
    expect(H.poa).toHaveBeenCalledWith("t1", "plan-1");
    expect(H.especies).toHaveBeenCalledWith("t1", "plan-1");
    expect(r.excluidos.find((e) => e.motivo === "Semillero según el POA: no se tala")?.codigos).toEqual(esperado);
    expect(r.arboles.map((a) => a.codigo)).not.toContain(esperado[0]);
    expect(r.arboles).toHaveLength(10 - esperado.length);
  });

  it("si el POA no se puede leer, planifica igual y lo avisa", async () => {
    H.estado.mockResolvedValue({ arboles: [], sinCenso: [] });
    H.poa.mockRejectedValue(new Error("kv"));
    const r = await arbolesParaPlanificar("t1", { planId: "plan-1", arboles: [arbol("A", -9.79, -74.8)] });
    expect(r.arboles).toHaveLength(1);
    expect(r.avisos.join(" ")).toMatch(/No se pudo calcular el POA/);
  });

  it("sólo en pie: los talados quedan afuera con su motivo", async () => {
    H.estado.mockResolvedValue({ arboles: [estado("t-P", "en_pie"), estado("t-TAL", "talado")], sinCenso: [] });
    const r = await arbolesParaPlanificar("t1", { planId: "plan-1", arboles: base.slice(0, 4) }, { soloEnPie: true });
    expect(r.arboles.map((a) => a.codigo)).toEqual(["P"]);
    expect(r.excluidos.some((e) => e.motivo.startsWith("Ya talado") && e.codigos.includes("TAL"))).toBe(true);
  });

  it("si el libro no se puede leer, manda el censo y se avisa", async () => {
    H.estado.mockRejectedValue(new Error("pooler"));
    // Sin DAP: el POA no los puede reservar como semilleros (este caso mira sólo la etapa).
    const r = await arbolesParaPlanificar("t1", {
      planId: "plan-1",
      arboles: [arbol("A", -9.79, -74.8, { dapM: null }), arbol("B", -9.79, -74.8, { estadoCenso: "descartado", dapM: null })],
    });
    expect(r.arboles.map((a) => a.codigo)).toEqual(["A"]);
    expect(r.avisos[0]).toMatch(/se usó lo que dice el censo/);
  });
});
