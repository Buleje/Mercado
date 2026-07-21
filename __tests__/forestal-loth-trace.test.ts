/**
 * loth-trace — motor de trazabilidad por árbol del Libro TH. Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { buildTraceOperations, buildTraceSummary } from "@/lib/forestal/loth-trace";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

let seq = 0;
function entry(partial: Partial<LothEntryDTO>): LothEntryDTO {
  return {
    id: `e${seq++}`,
    section: "tala",
    lineNo: seq,
    entryDate: "2026-01-10",
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

describe("buildTraceOperations", () => {
  it("cadena completa (tala→trozado→despacho) con rendimiento y GPS", () => {
    const entries: LothEntryDTO[] = [
      entry({ section: "tala", treeCode: "01-TOR", volumeM3: "10", gpsLat: "-9.9", gpsLng: "-75.0" }),
      entry({ section: "trozado", treeCode: "01-TOR", trozaCode: "01-TOR-A", volumeM3: "4" }),
      entry({ section: "trozado", treeCode: "01-TOR", trozaCode: "01-TOR-B", volumeM3: "4" }),
      entry({ section: "despacho_troza", trozaCode: "01-TOR-A", gtfNumber: "GTF-1" }),
    ];
    const [op] = buildTraceOperations(entries);
    expect(op.tree).toBe("01-TOR");
    expect(op.talaVolM3).toBe(10);
    expect(op.trozadoVolM3).toBe(8);
    expect(op.rendimientoPct).toBe(80);
    expect(op.mermaVolM3).toBe(2);
    expect(op.trozasCount).toBe(2);
    expect(op.trozasDespachadas).toBe(1);
    expect(op.movilizada).toBe(true);
    expect(op.chain).toBe("completa");
    expect(op.gps).toEqual({ lat: -9.9, lng: -75.0 });
    expect(op.alerts).toHaveLength(0);
  });

  it("solo tala → cadena 'iniciada'", () => {
    const [op] = buildTraceOperations([entry({ section: "tala", treeCode: "02-TOR", volumeM3: "5" })]);
    expect(op.chain).toBe("iniciada");
    expect(op.stagesReached).toBe(1);
    expect(op.movilizada).toBe(false);
  });

  it("trozado > talado → alerta de error (invariante T4 visible)", () => {
    const [op] = buildTraceOperations([
      entry({ section: "tala", treeCode: "03-TOR", volumeM3: "3" }),
      entry({ section: "trozado", treeCode: "03-TOR", trozaCode: "03-TOR-A", volumeM3: "5" }),
    ]);
    expect(op.alerts.some((a) => a.level === "error")).toBe(true);
    expect(op.chain).toBe("parcial");
  });

  it("rendimiento bajo (<40%) → alerta de warning", () => {
    const [op] = buildTraceOperations([
      entry({ section: "tala", treeCode: "04-TOR", volumeM3: "10" }),
      entry({ section: "trozado", treeCode: "04-TOR", trozaCode: "04-TOR-A", volumeM3: "3" }),
    ]);
    expect(op.rendimientoPct).toBe(30);
    expect(op.alerts.some((a) => a.level === "warn")).toBe(true);
  });

  it("ignora líneas anuladas", () => {
    const ops = buildTraceOperations([
      entry({ section: "tala", treeCode: "05-TOR", volumeM3: "5" }),
      entry({ section: "tala", treeCode: "06-TOR", volumeM3: "5", status: "anulado" }),
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0].tree).toBe("05-TOR");
  });

  it("ordena por volumen talado descendente", () => {
    const ops = buildTraceOperations([
      entry({ section: "tala", treeCode: "A", volumeM3: "3" }),
      entry({ section: "tala", treeCode: "B", volumeM3: "9" }),
      entry({ section: "tala", treeCode: "C", volumeM3: "6" }),
    ]);
    expect(ops.map((o) => o.tree)).toEqual(["B", "C", "A"]);
  });
});

describe("buildTraceSummary", () => {
  it("agrega totales, rendimiento global y conteos de estado", () => {
    const ops = buildTraceOperations([
      entry({ section: "tala", treeCode: "01", volumeM3: "10", cites: true }),
      entry({ section: "trozado", treeCode: "01", trozaCode: "01-A", volumeM3: "7" }),
      entry({ section: "despacho_troza", trozaCode: "01-A", gtfNumber: "G1" }),
      entry({ section: "tala", treeCode: "02", volumeM3: "10" }),
    ]);
    const s = buildTraceSummary(ops);
    expect(s.totalTrees).toBe(2);
    expect(s.talaVolM3).toBe(20);
    expect(s.trozadoVolM3).toBe(7);
    expect(s.rendimientoGlobalPct).toBe(35);
    expect(s.completas).toBe(1);
    expect(s.parciales).toBe(0);
    expect(s.citesCount).toBe(1);
  });
});
