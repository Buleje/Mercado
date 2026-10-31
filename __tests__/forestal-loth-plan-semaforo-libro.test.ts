/**
 * Lo que el semáforo lee del libro (`loth-plan-semaforo-libro`): quién taló,
 * por árbol, y los motosierristas ya escritos.
 */
import { describe, expect, it } from "vitest";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  docDelTitularDe,
  docsDelTitular,
  motosierristaDeLaTala,
  motosierristasDelLibro,
  plazosDelLibro,
  talasPorPlan,
} from "@/lib/forestal/loth-plan-semaforo-libro";

let n = 0;
function linea(p: Partial<LothEntryDTO>): LothEntryDTO {
  n += 1;
  return {
    section: "trozado",
    lineNo: n,
    entryDate: "2026-10-01",
    treeCode: null,
    status: "registrado",
    planId: "p1",
    motosierrista: null,
    createdAt: "2026-10-01T15:00:00.000Z",
    ...p,
  } as LothEntryDTO;
}

describe("talasPorPlan", () => {
  it("cuenta árboles, no líneas: cuatro trozas del mismo árbol son uno", () => {
    const lineas = [
      linea({ treeCode: "A-1" }),
      linea({ treeCode: "A-1", motosierrista: "Juan Pérez" }),
      linea({ treeCode: "a-1 " }),
      linea({ treeCode: "A-2" }),
      linea({ section: "tala", treeCode: "B-9", planId: "p2", motosierrista: "Ana" }),
      // No cuentan: anulada, de otra sección o sin plan.
      linea({ treeCode: "A-3", status: "anulado" }),
      linea({ section: "despacho_troza", treeCode: "A-4" }),
      linea({ treeCode: "A-5", planId: null }),
    ];
    expect(talasPorPlan(lineas)).toEqual({ p1: { total: 2, conMotosierrista: 1 }, p2: { total: 1, conMotosierrista: 1 } });
  });

  it("una línea sin código de árbol cuenta sola", () => {
    expect(talasPorPlan([linea({}), linea({})])).toEqual({ p1: { total: 2, conMotosierrista: 0 } });
  });
});

describe("motosierristasDelLibro", () => {
  it("el último primero, sin repetir ni distinguir mayúsculas", () => {
    const m = motosierristasDelLibro([
      linea({ entryDate: "2026-09-01", motosierrista: "Juan  Pérez" }),
      linea({ entryDate: "2026-10-03", motosierrista: "Ana Ríos" }),
      linea({ entryDate: "2026-10-02", motosierrista: "juan pérez" }),
      linea({ entryDate: "2026-10-09", motosierrista: "Ojo", status: "anulado" }),
      linea({ entryDate: "2026-10-09", section: "despacho_troza", motosierrista: "Otro" }),
    ]);
    expect(m).toEqual({ ultimo: "Ana Ríos", usados: ["Ana Ríos", "juan pérez"], porArbol: {} });
  });

  it("libro sin nombres: nada que proponer", () => {
    expect(motosierristasDelLibro([linea({})])).toEqual({ ultimo: null, usados: [], porArbol: {} });
  });

  it("B4: el trozado propone al que TALÓ ese árbol; sin tala del árbol, a nadie", () => {
    const motosierristas = motosierristasDelLibro([
      linea({ section: "tala", treeCode: "A-1", entryDate: "2026-09-01", motosierrista: "Juan Pérez" }),
      linea({ section: "tala", treeCode: "a-1", entryDate: "2026-09-02", motosierrista: "Ana Ríos" }),
      linea({ section: "tala", treeCode: "A-2", entryDate: "2026-09-03", motosierrista: "Ojo", status: "anulado" }),
      // El último del libro es un trozado de OTRO árbol: no manda sobre A-1.
      linea({ section: "trozado", treeCode: "B-7", entryDate: "2026-10-09", motosierrista: "Luis Soria" }),
      linea({ section: "tala", treeCode: "A-1", planId: "p2", motosierrista: "Pedro" }),
    ]);
    const libro = { motosierristas };
    expect(motosierristas.ultimo).toBe("Luis Soria");
    expect(motosierristaDeLaTala(libro, "p1", " a-1")).toBe("Ana Ríos");
    expect(motosierristaDeLaTala(libro, "p2", "A-1")).toBe("Pedro");
    expect(motosierristaDeLaTala(libro, "p1", "A-2")).toBeNull();
    expect(motosierristaDeLaTala(libro, "p1", "B-7")).toBeNull();
    expect(motosierristaDeLaTala(libro, "p1", "")).toBeNull();
    expect(motosierristaDeLaTala(null, "p1", "A-1")).toBeNull();
  });
});

describe("plazosDelLibro", () => {
  it("sin guías ni asientos tardíos: todo en cero", () => {
    const ahora = new Date("2026-10-24T13:00:00Z");
    expect(plazosDelLibro({ lineas: [linea({ createdAt: "2026-10-01T15:00:00.000Z" })], gtfs: [], planes: [] }, ahora)).toEqual({
      porVencer: 0,
      vencidos: 0,
      quedanMin: null,
      tardias: 0,
    });
  });
});

describe("docsDelTitular", () => {
  const docs = docsDelTitular([
    { id: "c1", planId: "p1", titularDoc: "20 393 870 516", isActive: true },
    { id: "c2", planId: null, titularDoc: "40123456", isActive: true },
    { id: "c3", planId: "p3", titularDoc: "20111111111", isActive: false },
    { id: "c4", planId: "p4", titularDoc: "  ", isActive: true },
  ]);

  it("por el plan que guarda el permiso o por el permiso que guarda el plan; sin los dados de baja", () => {
    expect(docDelTitularDe(docs, { id: "p1" })).toBe("20393870516");
    expect(docDelTitularDe(docs, { id: "p2", contratoId: "c2" })).toBe("40123456");
    expect(docDelTitularDe(docs, { id: "p3", contratoId: "c3" })).toBeNull();
    expect(docDelTitularDe(docs, { id: "p4" })).toBeNull();
    expect(docDelTitularDe(null, { id: "p1" })).toBeNull();
  });
});
