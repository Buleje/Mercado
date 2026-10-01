/**
 * Tests — el censo visto desde el libro (`lib/forestal/loth-censo-uso.ts`),
 * que alimenta el modal «Ver censo» y la ficha del árbol de la tala.
 *
 * Los casos salen de datos medidos el 28-09:
 *   - QA: el 85-TOR figuraba «en pie» en el censo con su tala N° 1 asentada,
 *     4 trozas y 2 despachadas (las despachadas no traen código de árbol).
 *   - Blas: la Copaiba 111 midió 10,370 m³ contra 9,675 estimados (+7 %) y el
 *     Mashonaste 100, 2,837 contra 5,881 (−52 %). Las dos talas llevaban el
 *     GPS del censo copiado a 0,01 m.
 */

import { describe, it, expect } from "vitest";
import {
  arbolDeTroza,
  compararConCenso,
  contarFiltros,
  diaDelLibro,
  distanciaAlArbol,
  filtrarCenso,
  latLngDelArbol,
  ordenarCenso,
  prepararArboles,
  resumirUsoDelCenso,
  totalesCenso,
  type ArbolCensoTala,
  type LineaParaUso,
} from "@/lib/forestal/loth-censo-uso";

function arbol(p: Partial<ArbolCensoTala> & { treeCode: string }): ArbolCensoTala {
  return {
    id: `id-${p.treeCode}`,
    speciesCommon: "Tornillo",
    speciesScientific: null,
    speciesNative: null,
    cites: false,
    dapM: 0.8,
    hcM: 15,
    volM3: 5,
    utmZona: "18L",
    utmX: null,
    utmY: null,
    condicion: null,
    notes: null,
    estadoCenso: "en_pie",
    ...p,
  };
}

const LIBRO_QA: LineaParaUso[] = [
  { section: "tala", lineNo: 1, entryDate: "2026-05-28T00:00:00.000Z", treeCode: "85-TOR", trozaCode: null, volumeM3: 5.003 },
  { section: "trozado", lineNo: 1, entryDate: "2026-05-28", treeCode: "85-TOR", trozaCode: "85-TOR-A", volumeM3: 1.2 },
  { section: "trozado", lineNo: 2, entryDate: "2026-05-28", treeCode: "85-TOR", trozaCode: "85-TOR-B", volumeM3: 1.1 },
  { section: "trozado", lineNo: 3, entryDate: "2026-05-28", treeCode: "85-TOR", trozaCode: "85-TOR-C", volumeM3: 1 },
  { section: "trozado", lineNo: 4, entryDate: "2026-05-28", treeCode: "85-TOR", trozaCode: "85-TOR-D", volumeM3: 0.9 },
  { section: "despacho_troza", lineNo: 1, entryDate: "2026-05-28", treeCode: null, trozaCode: "85-TOR-A", volumeM3: null },
  { section: "despacho_troza", lineNo: 2, entryDate: "2026-05-28", treeCode: null, trozaCode: "85-TOR-B", volumeM3: null },
];

describe("resumirUsoDelCenso", () => {
  it("cuenta la tala, las trozas y las despachadas aunque el despacho no traiga el árbol", () => {
    const [u] = resumirUsoDelCenso(LIBRO_QA);
    expect(u.treeCode).toBe("85-TOR");
    expect(u.tala).toEqual({ lineNo: 1, fecha: "2026-05-28", volumeM3: 5.003 });
    expect(u.trozas).toBe(4);
    expect(u.trozasM3).toBe(4.2);
    expect(u.despachadas).toBe(2);
    expect(u.consumidas).toBe(0);
  });

  it("una troza sin trozado se atribuye por su código", () => {
    expect(arbolDeTroza("111-A")).toBe("111");
    expect(arbolDeTroza("85-TOR-B")).toBe("85-TOR");
    const usos = resumirUsoDelCenso([
      { section: "consumo_troza", lineNo: 9, entryDate: "2026-09-28", treeCode: null, trozaCode: "111-A", volumeM3: 4.951 },
    ]);
    expect(usos).toEqual([{ treeCode: "111", tala: null, trozas: 0, trozasM3: 0, despachadas: 0, consumidas: 1 }]);
  });
});

describe("prepararArboles", () => {
  it("el libro manda: un árbol «en pie» en el censo con tala asentada es talado y no se elige", () => {
    const [a] = prepararArboles([arbol({ treeCode: "85-TOR" })], resumirUsoDelCenso(LIBRO_QA));
    expect(a.disponibilidad).toBe("talado");
    expect(a.motivoNoDisponible).toBe("Talado el jueves 28/05 · línea N° 1");
    expect(a.desfase).toMatch(/en pie/);
    expect(a.categoria).toBe("talado");
    expect(a.reparo).toBeNull();
  });

  it("descartado en el censo no se elige", () => {
    const [a] = prepararArboles([arbol({ treeCode: "9", estadoCenso: "descartado" })], []);
    expect(a.disponibilidad).toBe("descartado");
    expect(a.motivoNoDisponible).toBe("Descartado en el censo");
  });

  it("semillero o remanente del REGENTE: infracción; semillero del cálculo del plan: sólo aviso", () => {
    const arboles = prepararArboles(
      [
        arbol({ treeCode: "1", speciesCommon: "Copaiba", dapM: 1.3, condicion: "Aprovechable" }),
        arbol({ treeCode: "2", speciesCommon: "Copaiba", dapM: 0.9, condicion: "Semillero" }),
        arbol({ treeCode: "3", speciesCommon: "Copaiba", dapM: 0.8, condicion: "Remanente" }),
        arbol({ treeCode: "4", speciesCommon: "Copaiba", dapM: 0.7, condicion: "Aprovechable" }),
      ],
      [],
    );
    const por = new Map(arboles.map((a) => [a.treeCode, a]));
    // El más grueso lo reserva el cálculo (10 %): el regente dice aprovechable → aviso.
    expect(por.get("1")?.categoria).toBe("semillero");
    expect(por.get("1")?.reparo?.nivel).toBe("aviso");
    expect(por.get("2")?.reparo).toMatchObject({ nivel: "infraccion", titulo: "El regente lo declaró semillero" });
    expect(por.get("3")?.reparo).toMatchObject({ nivel: "infraccion", titulo: "El regente lo declaró remanente" });
    expect(por.get("4")?.reparo).toBeNull();
    // Se ven igual: siguen disponibles, sólo piden confirmar.
    expect(arboles.every((a) => a.disponibilidad === "disponible")).toBe(true);
  });

  it("bajo el DMC de su especie es infracción y dice los dos números", () => {
    const [a] = prepararArboles([arbol({ treeCode: "7", speciesCommon: "Tornillo", dapM: 0.55 })], []);
    expect(a.categoria).toBe("bajo_dmc");
    expect(a.reparo?.nivel).toBe("infraccion");
    expect(a.reparo?.detalle).toMatch(/DAP 55 cm.*Tornillo es 61 cm/);
  });

  it("un árbol ya talado en el libro no le quita el lugar de semillero al que sigue en pie", () => {
    const usos = resumirUsoDelCenso([
      { section: "tala", lineNo: 3, entryDate: "2026-09-28", treeCode: "grande", trozaCode: null, volumeM3: 9 },
    ]);
    const arboles = prepararArboles(
      [
        arbol({ treeCode: "grande", speciesCommon: "Lupuna", dapM: 1.7 }),
        arbol({ treeCode: "chico", speciesCommon: "Lupuna", dapM: 1.1 }),
      ],
      usos,
    );
    const chico = arboles.find((a) => a.treeCode === "chico");
    expect(chico?.categoria).toBe("semillero");
  });
});

describe("filtros, orden y totales", () => {
  const arboles = prepararArboles(
    [
      arbol({ treeCode: "13", speciesCommon: "Sapotillo", dapM: 0.6, volM3: 3, speciesNative: "Tsabiri" }),
      arbol({ treeCode: "2", speciesCommon: "Copaiba", dapM: 1.15, volM3: 14.853 }),
      arbol({ treeCode: "85-TOR", dapM: null, volM3: 5.003 }),
      arbol({ treeCode: "5", speciesCommon: "Tornillo", dapM: 0.5, volM3: 1 }),
    ],
    resumirUsoDelCenso(LIBRO_QA),
  );

  it("cuenta cada filtro rápido", () => {
    expect(contarFiltros(arboles)).toEqual({ disponibles: 3, talados: 1, todos: 4, semilleros: 2, bajo_dmc: 1 });
  });

  it("busca por nombre nativo sin tildes ni mayúsculas", () => {
    expect(filtrarCenso(arboles, "todos", "tsabiri").map((a) => a.treeCode)).toEqual(["13"]);
    expect(filtrarCenso(arboles, "talados", "").map((a) => a.treeCode)).toEqual(["85-TOR"]);
  });

  it("código en orden natural y los vacíos siempre al final", () => {
    expect(ordenarCenso(arboles, "codigo", "asc").map((a) => a.treeCode)).toEqual(["2", "5", "13", "85-TOR"]);
    expect(ordenarCenso(arboles, "dap", "asc").map((a) => a.treeCode)).toEqual(["5", "13", "2", "85-TOR"]);
    expect(ordenarCenso(arboles, "dap", "desc").map((a) => a.treeCode)).toEqual(["2", "13", "5", "85-TOR"]);
  });

  it("totales de lo filtrado", () => {
    expect(totalesCenso(filtrarCenso(arboles, "disponibles", ""))).toEqual({ arboles: 3, m3: 18.853 });
  });
});

describe("dónde está el árbol y lo medido contra el censo", () => {
  // Blas, árbol 100: UTM sin zona (18 sur) y el GPS que llevó su tala.
  const a100 = arbol({ treeCode: "100", utmZona: null, utmX: 522155, utmY: 8918048, dapM: 0.8, hcM: 18, volM3: 5.881 });

  it("el GPS de la tala de Blas era la coordenada del censo copiada", () => {
    expect(latLngDelArbol(a100)).not.toBeNull();
    expect(distanciaAlArbol(a100, -9.7877484, -74.7979777)).toBeLessThan(1);
    // ~110 m más al norte ya no es el mismo árbol.
    expect(distanciaAlArbol(a100, -9.7867484, -74.7979777)).toBeGreaterThan(100);
    expect(latLngDelArbol(arbol({ treeCode: "x" }))).toBeNull();
  });

  it("marca la diferencia de volumen desde el 30 %", () => {
    const c100 = compararConCenso(a100, { diamMayorM: 0.767, longitudM: 9, volumenM3: 2.8368 });
    expect(c100.volumen.difPct).toBe(-51.8);
    expect(c100.largo.difPct).toBe(-50);
    expect(c100.muyDistinto).toBe(true);

    const a111 = arbol({ treeCode: "111", dapM: 0.95, hcM: 21, volM3: 9.675 });
    const c111 = compararConCenso(a111, { diamMayorM: 0.875, longitudM: 20, volumenM3: 10.3697 });
    expect(c111.volumen.difPct).toBe(7.2);
    expect(c111.muyDistinto).toBe(false);
    expect(compararConCenso(a111, { diamMayorM: null, longitudM: null, volumenM3: null }).volumen.difPct).toBeNull();
  });

  it("la fecha del libro sale con su día, sin correrse en Lima", () => {
    expect(diaDelLibro("2026-09-28")).toBe("lunes 28/09");
    expect(diaDelLibro("2026-09-28T00:00:00.000Z")).toBe("lunes 28/09");
    expect(diaDelLibro(null)).toBe("");
  });
});
