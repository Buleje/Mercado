/**
 * loth-trace-grupos — la vista «Por árbol» partida por etapa. Puro, sin DB.
 *
 * El caso es el de Blas al 30-09: 001/002-TOR talados en julio (una troza
 * despachada y otra al aserrío), 111 y 113 talados el 28-09 y despachados el
 * 29-09, 114 (Lupuna) y 100 (Mashonaste) talados el 28-09 SIN trozar, y el
 * resto del censo en pie. Se agrega un 050 con una troza olvidada en patio y
 * un 060 con merma grave, para que los tres pendientes tengan caso.
 */
import { describe, it, expect } from "vitest";
import { buildTraceOperations } from "@/lib/forestal/loth-trace";
import { construirFichasArbol, type ArbolCensoInput } from "@/lib/forestal/loth-arbol";
import { construirFilasTrace, resumirFilas } from "@/lib/forestal/loth-trace-tabla";
import {
  agruparPorEtapa,
  avisosDelAvance,
  DIAS_EN_PATIO_AVISO,
  enPiePorEspecie,
  grupoDe,
  pasaPaso,
  pctTaladoDelCenso,
  pendientesDe,
  trozasQueSalieron,
} from "@/lib/forestal/loth-trace-grupos";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

let seq = 0;
function entry(partial: Partial<LothEntryDTO>): LothEntryDTO {
  return {
    id: `e${seq++}`,
    section: "tala",
    lineNo: seq,
    entryDate: "2026-09-28",
    treeCode: null,
    trozaCode: null,
    despachoCode: null,
    isRama: false,
    speciesCommon: "Tornillo",
    speciesScientific: null,
    cites: false,
    diamMayorM: null,
    diamMenorM: null,
    lengthM: null,
    volumeM3: null,
    productType: null,
    quantity: null,
    unit: null,
    pieces: null,
    gtfNumber: null,
    discarded: false,
    consumoInterno: false,
    observations: null,
    status: "registrado",
    annulledReason: null,
    gpsLat: "-8.1",
    gpsLng: "-74.6",
    photoUrl: null,
    ...partial,
  };
}

const HOY = new Date("2026-09-30T15:00:00Z");
const c = (treeCode: string, speciesCommon: string, volumenEstimadoM3: number | null): ArbolCensoInput => ({
  treeCode,
  speciesCommon,
  dapM: 0.8,
  volumenEstimadoM3,
  estado: "aprovechable",
});

const censo: ArbolCensoInput[] = [
  c("001-TOR", "Tornillo", 9),
  c("002-TOR", "Tornillo", 9),
  c("111", "Tornillo", 6),
  c("113", "Tornillo", 6),
  c("114", "Lupuna", 16),
  c("100", "Mashonaste", 3),
  c("050", "Tornillo", 5),
  c("060", "Tornillo", 5),
  // en pie: «TORNILLO» escrito distinto es la misma especie
  c("200", "Tornillo", 10),
  c("201", "TORNILLO", 12),
  c("300", "Lupuna", 20),
  c("400", "Shihuahuaco", null),
];

const libro: LothEntryDTO[] = [
  entry({ section: "tala", treeCode: "001-TOR", volumeM3: "8", entryDate: "2026-07-21" }),
  entry({ section: "trozado", treeCode: "001-TOR", trozaCode: "001-TOR-A", volumeM3: "4.4", entryDate: "2026-07-22" }),
  entry({ section: "despacho_troza", trozaCode: "001-TOR-A", gtfNumber: "019-0000001", entryDate: "2026-07-25" }),
  entry({ section: "tala", treeCode: "002-TOR", volumeM3: "8", entryDate: "2026-07-21" }),
  entry({ section: "trozado", treeCode: "002-TOR", trozaCode: "002-TOR-A", volumeM3: "4.2", entryDate: "2026-07-22" }),
  entry({ section: "consumo_troza", trozaCode: "002-TOR-A", entryDate: "2026-07-30" }),
  entry({ section: "tala", treeCode: "111", volumeM3: "5" }),
  entry({ section: "trozado", treeCode: "111", trozaCode: "111-A", volumeM3: "2.8" }),
  entry({ section: "despacho_troza", trozaCode: "111-A", gtfNumber: "019-0000002", entryDate: "2026-09-29" }),
  entry({ section: "tala", treeCode: "113", volumeM3: "5" }),
  entry({ section: "trozado", treeCode: "113", trozaCode: "113-A", volumeM3: "2.9" }),
  entry({ section: "despacho_troza", trozaCode: "113-A", gtfNumber: "019-0000002", entryDate: "2026-09-29" }),
  entry({ section: "tala", treeCode: "114", speciesCommon: "Lupuna", volumeM3: "15.6" }),
  entry({ section: "tala", treeCode: "100", speciesCommon: "Mashonaste", volumeM3: "2.8" }),
  // 050: una troza salió, la otra lleva desde el 01-08 en patio
  entry({ section: "tala", treeCode: "050", volumeM3: "5", entryDate: "2026-08-01" }),
  entry({ section: "trozado", treeCode: "050", trozaCode: "050-A", volumeM3: "1.5", entryDate: "2026-08-01" }),
  entry({ section: "trozado", treeCode: "050", trozaCode: "050-B", volumeM3: "1.5", entryDate: "2026-08-01" }),
  entry({ section: "despacho_troza", trozaCode: "050-A", gtfNumber: "019-0000003", entryDate: "2026-08-05" }),
  // 060: rinde 30 % → merma 70 %, sobre el escalón grave (55 %)
  entry({ section: "tala", treeCode: "060", volumeM3: "5", entryDate: "2026-09-20" }),
  entry({ section: "trozado", treeCode: "060", trozaCode: "060-A", volumeM3: "1.5", entryDate: "2026-09-21" }),
  entry({ section: "despacho_troza", trozaCode: "060-A", gtfNumber: "019-0000004", entryDate: "2026-09-22" }),
];

function filas(entries = libro, cen = censo) {
  const ops = buildTraceOperations(entries, { hoy: HOY });
  return construirFilasTrace(ops, construirFichasArbol({ censo: cen, entries, hoy: HOY }));
}
const codigos = (xs: { tree: string }[]) => xs.map((x) => x.tree).sort();

describe("agruparPorEtapa", () => {
  it("parte talados en movimiento / terminados y deja los en pie aparte", () => {
    const g = agruparPorEtapa(filas());
    expect(codigos(g.movimiento)).toEqual(["050", "100", "114"]);
    expect(codigos(g.terminado)).toEqual(["001-TOR", "002-TOR", "060", "111", "113"]);
    expect(codigos(g.en_pie)).toEqual(["200", "201", "300", "400"]);
  });

  it("una troza al aserrío cuenta como salida: el 002-TOR está terminado", () => {
    expect(grupoDe(filas().find((f) => f.tree === "002-TOR")!)).toBe("terminado");
  });

  it("una troza sin código no se sabe dónde está: el árbol sigue en movimiento", () => {
    const f = filas([
      entry({ section: "tala", treeCode: "070", volumeM3: "4" }),
      entry({ section: "trozado", treeCode: "070", trozaCode: "070-A", volumeM3: "1" }),
      entry({ section: "trozado", treeCode: "070", volumeM3: "1" }),
      entry({ section: "despacho_troza", trozaCode: "070-A", gtfNumber: "G" }),
    ], []);
    expect(grupoDe(f[0])).toBe("movimiento");
  });
});

describe("pasaPaso — cada paso del avance filtra al MISMO número que muestra", () => {
  it("censo · talados · trozados · salieron cuadran con resumirFilas", () => {
    const fs = filas();
    const r = resumirFilas(fs);
    expect(fs.filter((f) => pasaPaso(f, "censo")).length).toBe(r.censados);
    expect(fs.filter((f) => pasaPaso(f, "talados")).length).toBe(r.talados);
    expect(fs.filter((f) => pasaPaso(f, "trozados")).length).toBe(r.trozados);
    expect(fs.filter((f) => pasaPaso(f, "salieron")).length).toBe(r.conSalida);
    expect(fs.filter((f) => pasaPaso(f, null)).length).toBe(fs.length);
    expect([r.censados, r.talados, r.trozados, r.conSalida]).toEqual([12, 8, 6, 6]);
  });

  it("trozasQueSalieron cuenta piezas, no árboles", () => {
    expect(trozasQueSalieron(filas())).toEqual({ despachadas: 5, consumidas: 1 });
  });

  it("% de lo censado ya talado es por volumen; sin censo no hay barra", () => {
    const r = resumirFilas(filas());
    // talado 8+8+5+5+15,6+2,8+5+5 = 54,4 de censo 101 (400 sin volumen)
    expect(pctTaladoDelCenso(r)).toBe(53.9);
    expect(pctTaladoDelCenso(resumirFilas(filas(libro, [])))).toBeNull();
  });
});

describe("avisosDelAvance", () => {
  it("sólo los avisos en más de cero", () => {
    const keys = avisosDelAvance(resumirFilas(filas())).map((a) => a.key);
    expect(keys).toContain("merma_grave");
    expect(keys).not.toContain("sin_gps"); // todos traen GPS
    expect(keys).not.toContain("cites");
    expect(keys).not.toContain("fuera_censo");
  });

  it("sin censo, «fuera del censo» no se acusa (no hay contra qué)", () => {
    const keys = avisosDelAvance(resumirFilas(filas(libro, []))).map((a) => a.key);
    expect(keys).not.toContain("fuera_censo");
  });
});

describe("pendientesDe", () => {
  const p = pendientesDe(filas(), HOY);

  it("talados sin trozar, con su volumen y los días desde la tala", () => {
    expect(p.sinTrozar.map((x) => [x.tree, x.taladoM3, x.fechaTala, x.dias])).toEqual([
      ["100", 2.8, "2026-09-28", 2],
      ["114", 15.6, "2026-09-28", 2],
    ]);
  });

  it(`trozas en patio hace más de ${DIAS_EN_PATIO_AVISO} días, por árbol`, () => {
    expect(p.patio).toEqual([{ tree: "050", especie: "Tornillo", trozas: 1, m3: 1.5, desde: "2026-08-01", dias: 60 }]);
  });

  it("una troza recién trozada en patio NO es pendiente todavía", () => {
    const q = pendientesDe(
      filas([entry({ section: "tala", treeCode: "080", volumeM3: "4" }), entry({ section: "trozado", treeCode: "080", trozaCode: "080-A", volumeM3: "2" })], []),
      HOY,
    );
    expect(q.patio).toEqual([]);
    expect(q.sinTrozar).toEqual([]);
  });

  it("mermas graves y el total", () => {
    expect(p.mermaGrave.map((x) => [x.tree, x.mermaPct])).toEqual([["060", 70]]);
    expect(p.total).toBe(4);
  });

  it("sin nada pendiente, total 0 (el bloque no se dibuja)", () => {
    const soloTerminados = filas().filter((f) => grupoDe(f) === "terminado" && f.mermaVeredicto !== "grave");
    expect(pendientesDe(soloTerminados, HOY).total).toBe(0);
  });
});

describe("enPiePorEspecie", () => {
  it("agrupa por especie normalizada, la de más volumen primero, con sus códigos", () => {
    const r = enPiePorEspecie(filas());
    expect(r.arboles).toBe(4);
    expect(r.m3).toBe(42);
    expect(r.especies.map((e) => [e.especie, e.arboles, e.m3, e.codigos])).toEqual([
      ["Tornillo", 2, 22, ["200", "201"]],
      ["Lupuna", 1, 20, ["300"]],
      ["Shihuahuaco", 1, null, ["400"]],
    ]);
  });

  it("ignora a los talados aunque estén en el censo", () => {
    const r = enPiePorEspecie(filas());
    expect(r.especies.flatMap((e) => e.codigos)).not.toContain("114");
  });
});
