/**
 * Los filtros encadenados de la Capacidad de la planta y lo que hay detrás de
 * cada fuente.
 *
 * Lo que se protege acá no es la aritmética —es fácil— sino las decisiones que
 * un refactor puede deshacer sin que nada falle:
 *  · una fuente que no puede honrar el filtro queda en CERO y lo DICE;
 *  · el `pendienteM3` del libro no se reparte entre permisos (no los tiene);
 *  · las opciones de un filtro salen de lo que queda tras los anteriores;
 *  · lo por recepcionar cuenta para elegir permiso, aunque no esté en el patio.
 */

import { describe, expect, it } from "vitest";
import {
  armarBalance,
  esLibre,
  esPorRecepcionar,
  filaDeTroza,
  lotesDeFuente,
  opcionesDeCapacidad,
  trozasDeFuente,
  type EntradaCapacidad,
  type LoteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const troza = (o: Partial<TrozaConsumible> & { id: string }): TrozaConsumible =>
  ({
    woodEntryId: "w1",
    codificacion: o.id,
    especieComun: "TORNILLO",
    volumenM3: 1,
    guiaRecepcionada: true,
    ...o,
  }) as TrozaConsumible;

const lote = (o: Partial<LoteDeCapacidad> & { code: string }): LoteDeCapacidad => ({
  permisos: [],
  especie: "TORNILLO",
  status: "abierto",
  consumidoM3: 0,
  esperado56M3: 0,
  producidoM3: 0,
  restaM3: 0,
  apartadoM3: 0,
  piezas: 0,
  ...o,
});

const PATIO: TrozaConsumible[] = [
  troza({ id: "A", permiso: "P-1", especieComun: "TORNILLO", gtfNumber: "G-1", volumenM3: 10 }),
  troza({ id: "B", permiso: "P-1", especieComun: "CAPIRONA", gtfNumber: "G-2", volumenM3: 4 }),
  troza({ id: "C", permiso: "P-2", especieComun: "TORNILLO", gtfNumber: "G-3", volumenM3: 6 }),
  // Anotada, todavía no bajó del camión.
  troza({ id: "D", permiso: "P-1", especieComun: "TORNILLO", gtfNumber: "G-4", volumenM3: 5, guiaRecepcionada: false }),
  // Ya está en un lote: no es patio libre.
  troza({ id: "E", permiso: "P-1", especieComun: "TORNILLO", gtfNumber: "G-1", volumenM3: 3, loteAserrioId: "L1" }),
];

const ENTRADA: EntradaCapacidad = {
  patio: PATIO,
  lotes: [
    lote({ code: "L-1", permisos: ["P-1"], especie: "TORNILLO", restaM3: 2 }),
    lote({ code: "L-2", permisos: ["P-2"], especie: "CAPIRONA", restaM3: 1 }),
  ],
  productos: [{ producto: "ASERRADA · TORNILLO", producido: 20, despachado: 5, stock: 15 }],
  pendienteM3: 7,
  periodoLabel: "julio de 2026",
};

describe("qué troza entra en cada fuente", () => {
  it("libre = sin lote, sin corrida y de guía recibida", () => {
    expect(PATIO.filter(esLibre).map((t) => t.id)).toEqual(["A", "B", "C"]);
  });

  it("por recepcionar = la guía todavía no se recibió", () => {
    expect(PATIO.filter(esPorRecepcionar).map((t) => t.id)).toEqual(["D"]);
  });
});

describe("filtros encadenados", () => {
  it("las especies salen de lo que tiene el permiso elegido", () => {
    const { especies } = opcionesDeCapacidad(PATIO, { permiso: "P-2" });
    expect(especies.map((e) => e.valor)).toEqual(["TORNILLO"]);
  });

  it("las guías salen de lo que queda tras permiso Y especie", () => {
    const { guias } = opcionesDeCapacidad(PATIO, { permiso: "P-1", especie: "TORNILLO" });
    // G-1 (la pieza libre A) y G-4 (la que no llegó). G-2 es CAPIRONA.
    expect(guias.map((g) => g.valor).sort()).toEqual(["G-1", "G-4"]);
  });

  it("cada opción dice cuánta madera tiene detrás", () => {
    const { permisos } = opcionesDeCapacidad(PATIO, {});
    const p1 = permisos.find((p) => p.valor === "P-1");
    // A(10) + B(4) + D(5). La E ya está en un lote: no cuenta.
    expect(p1).toMatchObject({ piezas: 3, m3: 19 });
  });

  it("un permiso cuya madera entera está sin recibir se puede elegir igual", () => {
    const soloSinRecibir = [troza({ id: "X", permiso: "P-9", guiaRecepcionada: false, volumenM3: 2 })];
    expect(opcionesDeCapacidad(soloSinRecibir, {}).permisos.map((p) => p.valor)).toEqual(["P-9"]);
  });
});

describe("el balance bajo filtros", () => {
  it("sin filtros suma las cuatro fuentes", () => {
    const b = armarBalance(ENTRADA, {});
    const f = Object.fromEntries(b.fuentes.map((x) => [x.clave, x]));
    expect(f.patio.m3).toBe(20); // A+B+C
    expect(f.porRecepcionar.m3).toBe(12); // D(5) + pendiente del libro(7)
    expect(f.lotes.m3).toBe(3);
    expect(f.productos.m3).toBe(15);
  });

  it("el pendiente del libro NO se reparte entre permisos", () => {
    const b = armarBalance(ENTRADA, { permiso: "P-1" });
    const rec = b.fuentes.find((x) => x.clave === "porRecepcionar")!;
    expect(rec.m3).toBe(5); // sólo la troza D; el pendiente de 7 se cae
  });

  it("los productos quedan en cero y DICEN por qué", () => {
    const b = armarBalance(ENTRADA, { permiso: "P-1" });
    const prod = b.fuentes.find((x) => x.clave === "productos")!;
    expect(prod.m3).toBe(0);
    expect(prod.noAtribuible).toMatch(/no se puede atribuir/i);
    expect(prod.filas).toBe(0);
  });

  it("con una guía elegida los lotes se caen y lo dicen", () => {
    const b = armarBalance(ENTRADA, { guia: "G-1" });
    const lotesF = b.fuentes.find((x) => x.clave === "lotes")!;
    expect(lotesF.m3).toBe(0);
    expect(lotesF.noAtribuible).toMatch(/varias guías/i);
  });

  it("los lotes SÍ honran permiso y especie", () => {
    expect(lotesDeFuente(ENTRADA.lotes, { permiso: "P-2" }).map((l) => l.code)).toEqual(["L-2"]);
    expect(lotesDeFuente(ENTRADA.lotes, { especie: "tornillo" }).map((l) => l.code)).toEqual(["L-1"]);
  });

  it("el total es la suma de lo convertido, no de los m³ crudos", () => {
    const b = armarBalance(ENTRADA, { permiso: "P-2" });
    // patio C(6)·0.56 = 3.36 · por recepcionar 0 · lote L-2 = 1 · productos 0
    expect(b.totalProducto).toBeCloseTo(4.36, 4);
  });
});

describe("las filas del detalle", () => {
  it("el patio filtrado trae sólo lo libre que cumple", () => {
    const filas = trozasDeFuente("patio", PATIO, { permiso: "P-1" });
    expect(filas.map((t) => t.id)).toEqual(["A", "B"]);
  });

  it("ordena de mayor a menor volumen", () => {
    expect(trozasDeFuente("patio", PATIO, {}).map((t) => t.id)).toEqual(["A", "C", "B"]);
  });

  it("la fila arma dimensiones y pie tablar", () => {
    const f = filaDeTroza(troza({ id: "Z", d1Cm: 40, d2Cm: 38, largoM: 6, volumenM3: 2 }));
    expect(f.dimensiones).toBe("Ø 40/38 cm · 6 m");
    expect(f.pt).toBe(Math.round(2 * 424));
  });

  it("sin diámetros cae al texto de dimensiones que traiga la pieza", () => {
    expect(filaDeTroza(troza({ id: "Y", dimensiones: "2x8x10" })).dimensiones).toBe("2x8x10");
  });

  it("la especie del filtro no distingue mayúsculas", () => {
    expect(trozasDeFuente("patio", PATIO, { especie: "tornillo" }).map((t) => t.id)).toEqual(["A", "C"]);
  });
});

describe("la fecha de la pieza", () => {
  it("el asiento date-only NO se corre un día (timeZone UTC)", async () => {
    const { fechaDeTroza } = await import("@/lib/forestal/capacidad-de-planta");
    expect(fechaDeTroza(troza({ id: "F1", fechaIngreso: "2026-09-01" }))).toMatch(/01/);
  });

  it("la recepción es un instante y se lee en hora de Lima", async () => {
    const { fechaDeTroza } = await import("@/lib/forestal/capacidad-de-planta");
    // 2026-09-01T13:00Z = 08:00 en Lima, el mismo día.
    expect(fechaDeTroza(troza({ id: "F2", fechaRecepcion: "2026-09-01T13:00:50.312Z" }))).toMatch(/01/);
    // 2026-09-02T02:00Z = 21:00 del 1 en Lima: la fecha del negocio es el 1.
    expect(fechaDeTroza(troza({ id: "F3", fechaRecepcion: "2026-09-02T02:00:00.000Z" }))).toMatch(/01/);
  });

  it("sin ninguna fecha no inventa una", () => {
    expect(filaDeTroza(troza({ id: "F4" })).fecha).toBe("—");
  });
});
