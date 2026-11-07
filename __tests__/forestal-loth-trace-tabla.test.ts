/**
 * loth-trace-tabla — la fila que une trazabilidad y censo. Puro, sin DB.
 *
 * Lo que se protege acá: que un mismo hecho tenga UN número. Antes la tarjeta y
 * el cuadro de censo publicaban el rendimiento por su cuenta y no coincidían.
 */
import { describe, it, expect } from "vitest";
import { buildTraceOperations } from "@/lib/forestal/loth-trace";
import { construirFichasArbol, type ArbolCensoInput } from "@/lib/forestal/loth-arbol";
import { construirFilasTrace, filasToCsv, resumirFilas } from "@/lib/forestal/loth-trace-tabla";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

let seq = 0;
function entry(partial: Partial<LothEntryDTO>): LothEntryDTO {
  return {
    id: `e${seq++}`,
    section: "tala",
    lineNo: seq,
    entryDate: "2026-03-01",
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
    gpsLat: null,
    gpsLng: null,
    photoUrl: null,
    ...partial,
  };
}

const HOY = new Date("2026-04-01T12:00:00Z");

const censo: ArbolCensoInput[] = [
  { treeCode: "01-TOR", speciesCommon: "Tornillo", dapM: 0.8, volumenEstimadoM3: 8, estado: "aprovechable" },
  { treeCode: "99-TOR", speciesCommon: "Tornillo", dapM: 0.9, volumenEstimadoM3: 6, estado: "aprovechable" },
];

const libro: LothEntryDTO[] = [
  entry({ section: "tala", treeCode: "01-TOR", volumeM3: "10" }),
  entry({ section: "trozado", treeCode: "01-TOR", trozaCode: "01-TOR-A", volumeM3: "7", entryDate: "2026-03-03" }),
  entry({ section: "despacho_troza", trozaCode: "01-TOR-A", gtfNumber: "G-1", entryDate: "2026-03-10" }),
];

function filas(entries = libro, cen = censo) {
  const ops = buildTraceOperations(entries, { hoy: HOY });
  const fichas = construirFichasArbol({ censo: cen, entries, hoy: HOY });
  return construirFilasTrace(ops, fichas);
}

describe("construirFilasTrace", () => {
  it("une operación y censo por código de árbol", () => {
    const f = filas().find((x) => x.tree === "01-TOR")!;
    expect(f.censoM3).toBe(8);
    expect(f.taladoM3).toBe(10);
    expect(f.trozadoM3).toBe(7);
    expect(f.movilizadoM3).toBe(7); // la troza despachada
    expect(f.gtfs).toEqual(["G-1"]);
    expect(f.etapas).toBe(3);
    expect(f.diasTalaSalida).toBe(9);
  });

  it("la precisión del censo se calcula contra el MISMO talado que muestra la tarjeta", () => {
    const f = filas().find((x) => x.tree === "01-TOR")!;
    // 10 talados / 8 censados = 125%. El número no puede depender de qué mitad
    // de la pantalla lo publique.
    expect(f.precisionCensoPct).toBe(125);
    expect(f.rendimientoPct).toBe(70);
    expect(f.op!.rendimientoPct).toBe(70);
  });

  it("un árbol censado que sigue en pie entra sin operación", () => {
    const f = filas().find((x) => x.tree === "99-TOR")!;
    expect(f.op).toBeNull();
    expect(f.enPie).toBe(true);
    expect(f.censoM3).toBe(6);
    expect(f.taladoM3).toBeNull();
    expect(f.etapas).toBe(0);
  });

  it("una tala sin censo levanta bandera roja y la fila queda en nivel error", () => {
    const f = filas([entry({ section: "tala", treeCode: "77-XXX", volumeM3: "4" })], []).find((x) => x.tree === "77-XXX")!;
    expect(f.flags).toContain("no_censado");
    expect(f.nivel).toBe("error");
    expect(f.motivos.join(" ")).toMatch(/sin censo/i);
  });

  it("el nivel junta las dos fuentes: alerta de la operación y bandera del censo", () => {
    // Merma del 80% (alerta grave de la operación) sobre un árbol censado.
    const f = filas([
      entry({ section: "tala", treeCode: "01-TOR", volumeM3: "10" }),
      entry({ section: "trozado", treeCode: "01-TOR", trozaCode: "01-TOR-A", volumeM3: "2" }),
    ]).find((x) => x.tree === "01-TOR")!;
    expect(f.mermaVeredicto).toBe("grave");
    expect(f.nivel).toBe("error");
    expect(f.motivos.some((m) => /Merma del 80/.test(m))).toBe(true);
  });

  it("sin censo cargado las filas siguen saliendo (el libro no depende del plan)", () => {
    const f = filas(libro, []);
    expect(f).toHaveLength(1);
    expect(f[0].censoM3).toBeNull();
    expect(f[0].precisionCensoPct).toBeNull();
    expect(f[0].taladoM3).toBe(10);
  });
});

describe("filasToCsv", () => {
  it("emite header + una fila por árbol, incluidos los que están en pie", () => {
    const csv = filasToCsv(filas());
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Censo m³");
    expect(lines[0]).toContain("Días tala→salida");
    expect(lines).toHaveLength(3); // header + talado + en pie
    expect(lines[2]).toContain("En pie");
  });

  it("escapa las comas del código de árbol", () => {
    const csv = filasToCsv(filas([entry({ section: "tala", treeCode: "A,1", volumeM3: "5" })], []));
    expect(csv.split("\n")[1]).toContain('"A,1"');
  });
});

describe("resumirFilas (el embudo de la vista)", () => {
  // Un libro con todos los casos: trozado y despachado, tumbado sin trozar,
  // tala sin volumen, troza en patio, troza sin código, trozado que supera a su
  // tala (T4), fuera del censo, y un censado en pie.
  const mixto: LothEntryDTO[] = [
    entry({ section: "tala", treeCode: "01-TOR", volumeM3: "10" }),
    entry({ section: "trozado", treeCode: "01-TOR", trozaCode: "01-TOR-A", volumeM3: "4" }),
    entry({ section: "trozado", treeCode: "01-TOR", trozaCode: "01-TOR-B", volumeM3: "2" }),
    entry({ section: "trozado", treeCode: "01-TOR", trozaCode: null, volumeM3: "1" }),
    entry({ section: "despacho_troza", trozaCode: "01-TOR-A", gtfNumber: "G-1" }),
    entry({ section: "tala", treeCode: "02-TOR", volumeM3: "1.2" }),
    entry({ section: "tala", treeCode: "03-TOR", volumeM3: null }),
    entry({ section: "tala", treeCode: "04-TOR", volumeM3: "3" }),
    entry({ section: "trozado", treeCode: "04-TOR", trozaCode: "04-TOR-A", volumeM3: "3.5" }),
    entry({ section: "consumo_troza", trozaCode: "04-TOR-A", volumeM3: "3.5" }),
  ];
  const cen: ArbolCensoInput[] = [
    { treeCode: "01-TOR", speciesCommon: "Tornillo", dapM: 0.8, volumenEstimadoM3: 11, estado: "aprovechable" },
    { treeCode: "99-TOR", speciesCommon: "Tornillo", dapM: 0.9, volumenEstimadoM3: 6, estado: "aprovechable" },
  ];

  it("las cuentas cierran: árboles, talados y los dos balances de m³", () => {
    const r = resumirFilas(filas(mixto, cen));
    expect(r.arboles).toBe(r.talados + r.enPie);
    expect(r.talados).toBe(r.trozados + r.sinTrozar);
    expect(r.m3.talado + r.m3.exceso).toBeCloseTo(r.m3.trozado + r.m3.merma + r.m3.sinTrozar, 9);
    expect(r.m3.trozado).toBeCloseTo(r.m3.movilizado + r.m3.patio + r.m3.sinCodigo, 9);

    expect(r).toMatchObject({ arboles: 5, enPie: 1, talados: 4, trozados: 2, sinTrozar: 2, conSalida: 2 });
    expect(r).toMatchObject({ censados: 2, taladosDelCenso: 1, taladosSinCenso: 3, taladosSinVolumen: 1 });
    expect(r.m3.merma).toBeCloseTo(3, 9); // 10 − 7 del 01; el 04 no perdió
    expect(r.m3.exceso).toBeCloseTo(0.5, 9); // el 04 trozó 3.5 de 3
    expect(r.m3.sinTrozar).toBeCloseTo(1.2, 9);
    expect(r.m3.patio).toBeCloseTo(2, 9);
    expect(r.m3.sinCodigo).toBeCloseTo(1, 9);
    expect(r.mermaPct).toBeCloseTo(23.1, 1); // 3 de 13 talados que ya se trozaron
  });

  it("antes del trozado no hay merma ni rendimiento: «—», no 100 % ni 0 %", () => {
    const f = filas(mixto, cen).find((x) => x.tree === "02-TOR")!;
    expect(f.mermaM3).toBeNull();
    expect(f.mermaPct).toBeNull();
    expect(f.rendimientoPct).toBeNull();
    expect(filas(mixto, cen).find((x) => x.tree === "03-TOR")!.taladoM3).toBeNull();
  });
});
