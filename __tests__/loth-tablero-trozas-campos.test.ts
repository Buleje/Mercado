/**
 * Tablero de trozas — los campos que el libro ya sabía (medidas, plan, tala,
 * despacho) y el Excel para OSINFOR.
 *
 * El escenario es el de Blas al 30-09-2026: 4 trozas, 0 en patio.
 *   001-TOR-A 2,850 m³ despachada con GTF 001-0045678 (21/07)
 *   002-TOR-A 1,515 m³ consumida
 *   111-A 4,951 y 113-A 1,659 m³ despachadas con GTF 019-0000002 el 29/09,
 *   placa W2D-835 en la GTF (la línea del libro NO tiene placa).
 */

import { describe, it, expect } from "vitest";
import {
  construirTablero,
  diasEntre,
  guiaDesdeApi,
  planDesdeApi,
  resumirTablero,
  filtrarTablero,
  type GuiaTablero,
} from "@/lib/forestal/loth-tablero-trozas";
import {
  COLUMNAS_POR_DEFECTO,
  COLUMNAS_TABLERO,
  columnasValidas,
  filasParaExcel,
  nombreArchivoExport,
  ordenarTablero,
  resumenParaExcel,
  siguienteOrden,
} from "@/lib/forestal/loth-tablero-columnas";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";

/** Decimales como string: es como los manda la API (Decimal de Prisma). */
function linea(p: Partial<LothEntryDTO> & { section: LothEntryDTO["section"] }): LothEntryDTO {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    lineNo: p.lineNo ?? 1,
    entryDate: p.entryDate ?? "2026-07-01T00:00:00.000Z",
    treeCode: null,
    trozaCode: null,
    despachoCode: null,
    isRama: false,
    speciesCommon: null,
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
    planId: "plan-1",
    ...p,
  };
}

const HOY = new Date("2026-09-30T15:00:00.000Z");

const LIBRO_BLAS: LothEntryDTO[] = [
  linea({ section: "tala", treeCode: "001-TOR", entryDate: "2026-07-10T00:00:00.000Z" }),
  linea({ section: "tala", treeCode: "002-TOR", entryDate: "2026-07-11T00:00:00.000Z" }),
  linea({ section: "tala", treeCode: "111", entryDate: "2026-09-20T00:00:00.000Z" }),
  linea({
    section: "trozado", lineNo: 1, trozaCode: "001-TOR-A", treeCode: "001-TOR", speciesCommon: "Tornillo",
    speciesScientific: "Cedrelinga cateniformis", volumeM3: "2.8500", diamMayorM: "0.820", diamMenorM: "0.760",
    lengthM: "5.40", entryDate: "2026-07-15T00:00:00.000Z", photoUrl: "https://x/foto.jpg",
  }),
  linea({ section: "trozado", lineNo: 2, trozaCode: "002-TOR-A", treeCode: "002-TOR", speciesCommon: "Tornillo", volumeM3: "1.5150", entryDate: "2026-07-16T00:00:00.000Z" }),
  linea({ section: "trozado", lineNo: 3, trozaCode: "111-A", treeCode: "111", speciesCommon: "Shihuahuaco", volumeM3: "4.9510", entryDate: "2026-09-22T00:00:00.000Z" }),
  linea({ section: "trozado", lineNo: 4, trozaCode: "113-A", treeCode: "113", speciesCommon: "Shihuahuaco", volumeM3: "1.6590", entryDate: "2026-09-22T00:00:00.000Z" }),
  linea({ section: "despacho_troza", trozaCode: "001-TOR-A", gtfNumber: "001-0045678", entryDate: "2026-07-21T00:00:00.000Z" }),
  linea({ section: "consumo_troza", trozaCode: "002-TOR-A", entryDate: "2026-08-02T00:00:00.000Z" }),
  linea({ section: "despacho_troza", trozaCode: "111-A", gtfNumber: "019-0000002", entryDate: "2026-09-29T00:00:00.000Z" }),
  linea({ section: "despacho_troza", trozaCode: "113-A", gtfNumber: "019-0000002", entryDate: "2026-09-29T00:00:00.000Z" }),
];

const GUIAS: GuiaTablero[] = [
  guiaDesdeApi({
    gtfNumber: "019-0000002", gtfDate: "2026-09-29T00:00:00.000Z", status: "emitida",
    placaVehiculo: "W2D-835", transportista: "Transportes Blas", conductor: "Juan Pérez",
    destino: "Aserradero Pucallpa", parcelaCorta: "PC-2",
  })!,
];
const PLANES = [planDesdeApi({ id: "plan-1", planNumber: "POA-03", parcelaCorta: "PC-3" })!];

const tablero = () => construirTablero(LIBRO_BLAS, HOY, { guias: GUIAS, planes: PLANES });
const troza = (code: string) => tablero().find((f) => f.code === code)!;

describe("campos nuevos — lo que el libro ya sabe de cada troza", () => {
  it("Blas: 4 trozas, 0 en patio, 3 despachadas y 1 consumida", () => {
    const r = resumirTablero(tablero());
    expect(r.find((x) => x.estado === "disponible")!.n).toBe(0);
    expect(r.find((x) => x.estado === "despachada")!.n).toBe(3);
    expect(r.find((x) => x.estado === "despachada")!.m3).toBe(9.46);
    expect(r.find((x) => x.estado === "consumida")!.n).toBe(1);
  });

  it("medidas del trozado como número; sin dato → null, nunca 0", () => {
    const a = troza("001-TOR-A");
    expect(a.diamMayorM).toBe(0.82);
    expect(a.diamMenorM).toBe(0.76);
    expect(a.largoM).toBe(5.4);
    expect(a.especieCientifica).toBe("Cedrelinga cateniformis");
    const b = troza("111-A");
    expect(b.diamMayorM).toBeNull();
    expect(b.largoM).toBeNull();
  });

  it("un «0.000» guardado no es una medida: sale null", () => {
    const t = construirTablero([linea({ section: "trozado", trozaCode: "Z", lengthM: "0.00", diamMayorM: "" })], HOY);
    expect(t[0].largoM).toBeNull();
    expect(t[0].diamMayorM).toBeNull();
  });

  it("placa, transportista y destino salen de la GTF, no de la línea de despacho", () => {
    const b = troza("111-A");
    expect(b.placa).toBe("W2D-835");
    expect(b.transportista).toBe("Transportes Blas");
    expect(b.conductor).toBe("Juan Pérez");
    expect(b.destino).toBe("Aserradero Pucallpa");
    expect(troza("113-A").placa).toBe("W2D-835");
  });

  it("GTF que no está en la lista (001-0045678) → placa null, no inventada", () => {
    expect(troza("001-TOR-A").placa).toBeNull();
    expect(troza("001-TOR-A").transportista).toBeNull();
  });

  it("una guía ANULADA no presta su placa", () => {
    const anulada = guiaDesdeApi({ gtfNumber: "019-0000002", placaVehiculo: "XXX-000", status: "anulada" })!;
    const t = construirTablero(LIBRO_BLAS, HOY, { guias: [anulada] });
    expect(t.find((f) => f.code === "111-A")!.placa).toBeNull();
  });

  it("sin guías ni planes (la API falló) el tablero sigue igual, con esos campos en null", () => {
    const t = construirTablero(LIBRO_BLAS, HOY);
    expect(t).toHaveLength(4);
    expect(t.every((f) => f.placa === null && f.plan === null)).toBe(true);
  });

  it("plan y parcela del plan de la línea; la parcela de la GTF sólo si el plan no la tiene", () => {
    expect(troza("111-A").plan).toBe("POA-03");
    expect(troza("111-A").parcela).toBe("PC-3");
    const sinParcela = [planDesdeApi({ id: "plan-1", planNumber: "POA-03" })!];
    const t = construirTablero(LIBRO_BLAS, HOY, { guias: GUIAS, planes: sinParcela });
    expect(t.find((f) => f.code === "111-A")!.parcela).toBe("PC-2");
  });

  it("fecha de tala del árbol y días tala → salida; sin tala en el libro → null", () => {
    const a = troza("001-TOR-A");
    expect(a.fechaTala).toBe("2026-07-10T00:00:00.000Z");
    expect(a.diasTalaASalida).toBe(11);
    expect(troza("111-A").diasTalaASalida).toBe(9);
    expect(troza("113-A").fechaTala).toBeNull();
    expect(troza("113-A").diasTalaASalida).toBeNull();
  });

  it("la tala se busca en el MISMO plan cuando el código de árbol se repite", () => {
    const t = construirTablero(
      [
        linea({ section: "tala", treeCode: "001", planId: "viejo", entryDate: "2025-05-01T00:00:00.000Z" }),
        linea({ section: "tala", treeCode: "001", planId: "nuevo", entryDate: "2026-09-01T00:00:00.000Z" }),
        linea({ section: "trozado", trozaCode: "001-A", treeCode: "001", planId: "nuevo" }),
      ],
      HOY,
    );
    expect(t[0].fechaTala).toBe("2026-09-01T00:00:00.000Z");
  });

  it("días del trozado a la salida para lo que ya salió; consumida también", () => {
    expect(troza("001-TOR-A").diasTrozadoASalida).toBe(6);
    expect(troza("002-TOR-A").diasTrozadoASalida).toBe(17);
    expect(troza("111-A").diasEnPatio).toBeNull();
  });

  it("foto sí/no según la línea de Trozado", () => {
    expect(troza("001-TOR-A").conFoto).toBe(true);
    expect(troza("111-A").conFoto).toBe(false);
  });

  it("la búsqueda encuentra por placa", () => {
    expect(filtrarTablero(tablero(), { texto: "w2d" }).map((f) => f.code).sort()).toEqual(["111-A", "113-A"]);
  });
});

describe("guiaDesdeApi — columna o casillero del formato SERFOR", () => {
  it("guía anotada con el formato completo: lee gtfDatos si la columna viene vacía", () => {
    const g = guiaDesdeApi({
      gtfNumber: "019-0000003",
      placaVehiculo: "",
      gtfDatos: {
        vehiculo: { placa: "ABC-123", conductor: "Rosa" },
        transportista: { nombre: "Fletes SAC" },
        traslado: { puntoLlegada: "Km 12 CFB" },
      },
    })!;
    expect(g.placa).toBe("ABC-123");
    expect(g.transportista).toBe("Fletes SAC");
    expect(g.conductor).toBe("Rosa");
    expect(g.destino).toBe("Km 12 CFB");
  });

  it("sin número de guía no es una guía", () => {
    expect(guiaDesdeApi({ placaVehiculo: "X" })).toBeNull();
    expect(guiaDesdeApi(null)).toBeNull();
  });
});

describe("diasEntre — por fecha, no por hora", () => {
  it("cuenta días de calendario aunque una fecha traiga hora", () => {
    expect(diasEntre("2026-07-15T00:00:00.000Z", "2026-07-21T23:59:00.000Z")).toBe(6);
    expect(diasEntre(null, "2026-07-21")).toBeNull();
    expect(diasEntre("basura", "2026-07-21")).toBeNull();
  });
});

describe("columnas y orden", () => {
  it("por defecto: las 6 de siempre + Días en patio + Placa", () => {
    expect(COLUMNAS_POR_DEFECTO).toEqual(["code", "arbol", "especie", "volumen", "estado", "gtf", "diasPatio", "placa"]);
  });

  it("lo guardado en localStorage se limpia: claves viejas fuera, vacío → las de siempre", () => {
    expect(columnasValidas(["placa", "noExiste", "code"])).toEqual(["code", "placa"]);
    expect(columnasValidas([])).toEqual([...COLUMNAS_POR_DEFECTO]);
    expect(columnasValidas("roto")).toEqual([...COLUMNAS_POR_DEFECTO]);
  });

  it("ordenar por placa deja las vacías al final en las dos direcciones", () => {
    const asc = ordenarTablero(tablero(), { key: "placa", dir: "asc" }).map((f) => f.placa);
    const desc = ordenarTablero(tablero(), { key: "placa", dir: "desc" }).map((f) => f.placa);
    expect(asc.slice(2)).toEqual([null, null]);
    expect(desc.slice(2)).toEqual([null, null]);
  });

  it("ordenar por volumen es numérico", () => {
    const v = ordenarTablero(tablero(), { key: "volumen", dir: "desc" }).map((f) => f.code);
    expect(v).toEqual(["111-A", "001-TOR-A", "113-A", "002-TOR-A"]);
  });

  it("clic en la cabecera: asc → desc → sin orden", () => {
    const a = siguienteOrden(null, "placa");
    expect(a).toEqual({ key: "placa", dir: "asc" });
    const b = siguienteOrden(a, "placa");
    expect(b).toEqual({ key: "placa", dir: "desc" });
    expect(siguienteOrden(b, "placa")).toBeNull();
    expect(siguienteOrden(b, "volumen")).toEqual({ key: "volumen", dir: "asc" });
  });
});

describe("Excel para OSINFOR", () => {
  it("lleva TODAS las columnas (+ CITES), no sólo las visibles", () => {
    const h = filasParaExcel(tablero());
    expect(h.columnas).toHaveLength(COLUMNAS_TABLERO.length + 1);
    expect(h.columnas.map((c) => c.label)).toContain("Placa");
    expect(h.columnas.map((c) => c.label)).toContain("Fecha de tala");
    expect(h.filas).toHaveLength(4);
  });

  it("una celda sin dato va vacía (null), no 0", () => {
    const h = filasParaExcel(tablero());
    const iLargo = h.columnas.findIndex((c) => c.label === "Largo (m)");
    const iPlaca = h.columnas.findIndex((c) => c.label === "Placa");
    const fila113 = h.filas.find((f) => f[0] === "113-A")!;
    expect(fila113[iLargo]).toBeNull();
    expect(fila113[iPlaca]).toBe("W2D-835");
  });

  it("«Días en patio» de la que salió = del trozado a la salida", () => {
    const h = filasParaExcel(tablero());
    const i = h.columnas.findIndex((c) => c.label === "Días en patio");
    expect(h.filas.find((f) => f[0] === "111-A")![i]).toBe(7);
  });

  it("hoja resumen: una fila por estado + total que cierra", () => {
    const r = resumenParaExcel(resumirTablero(tablero()));
    expect(r.filas).toHaveLength(6);
    const total = r.filas[5];
    expect(total[0]).toBe("Total");
    expect(total[1]).toBe(4);
    expect(total[2]).toBe(10.975);
  });

  it("nombre de archivo con el título habilitante (sin «/») y la fecha de Lima", () => {
    // 01:00 UTC del 01-10 son las 20:00 del 30-09 en Pucallpa.
    expect(nombreArchivoExport("25-TAM/C-OPB-A-001-17", new Date("2026-10-01T01:00:00Z"))).toBe(
      "control-permiso-25-TAM-C-OPB-A-001-17-2026-09-30.xlsx",
    );
    expect(nombreArchivoExport(null, HOY)).toBe("control-permiso-sin-titulo-2026-09-30.xlsx");
  });
});
