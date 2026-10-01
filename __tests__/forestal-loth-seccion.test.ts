/**
 * loth-seccion — período, filtros, orden, totales y correcciones. Puro, sin DB.
 */
import { describe, it, expect } from "vitest";
import { estaFueraDePlazo, type LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  FILTRO_VACIO,
  filtrarLineas,
  lineasToCsv,
  mapaCorrecciones,
  ordenarLineas,
  periodoDe,
  periodoLabel,
  periodosDe,
  totalRelevante,
  totalesDe,
} from "@/lib/forestal/loth-seccion";

let seq = 0;
function entry(partial: Partial<LothEntryDTO>): LothEntryDTO {
  seq += 1;
  return {
    id: `e${seq}`,
    section: "tala",
    lineNo: seq,
    entryDate: "2026-07-10",
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

describe("período", () => {
  it("agrupa por mes UTC, no por hora local (Lima es UTC−5)", () => {
    // Un date-only del 1° a medianoche UTC cae el mes anterior si se lee local.
    expect(periodoDe("2026-08-01T00:00:00.000Z")).toBe("2026-08");
    expect(periodoDe("2026-12-31T00:00:00.000Z")).toBe("2026-12");
    expect(periodoDe(null)).toBeNull();
    expect(periodoDe("no-es-fecha")).toBeNull();
  });

  it("los lista del más nuevo al más viejo, con conteo", () => {
    const ps = periodosDe([
      entry({ entryDate: "2026-06-02" }),
      entry({ entryDate: "2026-07-15" }),
      entry({ entryDate: "2026-07-20" }),
    ]);
    expect(ps.map((p) => p.periodo)).toEqual(["2026-07", "2026-06"]);
    expect(ps[0].count).toBe(2);
    expect(periodoLabel("2026-07")).toBe("julio 2026");
  });
});

describe("filtros", () => {
  const lineas = [
    entry({ lineNo: 1, entryDate: "2026-07-10", speciesCommon: "Tornillo", createdAt: "2026-07-11" }),
    entry({ lineNo: 2, entryDate: "2026-08-01", speciesCommon: "Cumala", createdAt: "2026-08-02" }),
    // Asentada 40 días después: fuera del plazo de 15.
    entry({ lineNo: 3, entryDate: "2026-08-01", speciesCommon: "Tornillo", createdAt: "2026-09-10" }),
    entry({ lineNo: 4, entryDate: "2026-08-05", status: "anulado", annulledReason: "error de tipeo" }),
  ];

  it("por período", () => {
    const r = filtrarLineas(lineas, { ...FILTRO_VACIO, periodo: "2026-08" }, estaFueraDePlazo);
    expect(r.map((e) => e.lineNo)).toEqual([2, 3, 4]);
  });

  it("por especie", () => {
    const r = filtrarLineas(lineas, { ...FILTRO_VACIO, especie: "Cumala" }, estaFueraDePlazo);
    expect(r.map((e) => e.lineNo)).toEqual([2]);
  });

  it("por estado, incluido «fuera de plazo» que delega en el predicado único", () => {
    expect(filtrarLineas(lineas, { ...FILTRO_VACIO, estado: "anulado" }, estaFueraDePlazo).map((e) => e.lineNo)).toEqual([4]);
    expect(filtrarLineas(lineas, { ...FILTRO_VACIO, estado: "fuera_plazo" }, estaFueraDePlazo).map((e) => e.lineNo)).toEqual([3]);
  });

  it("«corregidas» necesita el mapa: sin él no inventa nada", () => {
    expect(filtrarLineas(lineas, { ...FILTRO_VACIO, estado: "corregidas" }, estaFueraDePlazo)).toHaveLength(0);
  });
});

describe("correcciones (subsanación SERFOR)", () => {
  it("vincula la línea vieja con la que la enmienda, en los dos sentidos", () => {
    const m = mapaCorrecciones([
      entry({ lineNo: 7, volumeM3: "5" }),
      entry({ lineNo: 12, volumeM3: "5.5", correctsLineNo: 7, correctionNote: "Ø mal medido" }),
    ]);
    expect(m.corregidaPor.get(7)).toBe(12);
    expect(m.corrige.get(12)).toBe(7);
  });

  it("una corrección anulada deja de contar (la vieja vuelve a ser la buena)", () => {
    const m = mapaCorrecciones([
      entry({ lineNo: 7 }),
      entry({ lineNo: 12, correctsLineNo: 7, status: "anulado" }),
    ]);
    expect(m.corregidaPor.has(7)).toBe(false);
  });
});

describe("orden", () => {
  const lineas = [
    entry({ lineNo: 3, trozaCode: "A-10", volumeM3: "2" }),
    entry({ lineNo: 1, trozaCode: "A-2", volumeM3: "9" }),
    entry({ lineNo: 2, trozaCode: "A-1", volumeM3: "5" }),
  ];

  it("por volumen descendente", () => {
    expect(ordenarLineas(lineas, "volumen", "desc").map((e) => e.lineNo)).toEqual([1, 2, 3]);
  });

  it("por código, con números como números («A-2» antes que «A-10»)", () => {
    expect(ordenarLineas(lineas, "codigo", "asc").map((e) => e.trozaCode)).toEqual(["A-1", "A-2", "A-10"]);
  });

  it("no muta el arreglo original", () => {
    const copia = [...lineas];
    ordenarLineas(lineas, "lineNo", "asc");
    expect(lineas).toEqual(copia);
  });
});

describe("totales del pie", () => {
  it("las anuladas se ven pero no suman", () => {
    const t = totalesDe([
      entry({ volumeM3: "5" }),
      entry({ volumeM3: "3" }),
      entry({ volumeM3: "100", status: "anulado" }),
    ]);
    expect(t.lineas).toBe(2);
    expect(t.anuladas).toBe(1);
    expect(t.volumenM3).toBe(8);
  });

  it("declara las unidades presentes: sumar m³ con pies tablares no es un total", () => {
    const t = totalesDe([
      entry({ quantity: "10", unit: "m3" }),
      entry({ quantity: "500", unit: "unidad" }),
    ]);
    expect(t.unidades.sort()).toEqual(["m3", "unidad"]);
    expect(t.cantidad).toBe(510); // el número existe; la UI decide si es publicable
  });

  it("cada sección suma lo que le corresponde", () => {
    expect(totalRelevante("tala")).toBe("volumen");
    expect(totalRelevante("producto_terminado")).toBe("cantidad");
    expect(totalRelevante("despacho_troza")).toBe("conteo");
  });
});

describe("lineasToCsv", () => {
  it("incluye el vínculo de corrección y escapa comas", () => {
    const csv = lineasToCsv([entry({ lineNo: 4, treeCode: "A,1", correctsLineNo: 2 })]);
    const [header, fila] = csv.split("\n");
    expect(header).toContain("Corrige a");
    expect(fila).toContain('"A,1"');
    expect(fila.split(",").pop()).toBe(""); // observaciones vacías, sin romper la fila
  });
});
