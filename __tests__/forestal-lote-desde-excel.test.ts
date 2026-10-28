/**
 * Lote pegado desde el Excel del SNIFFS (27-10): la grilla como la del
 * cubicador —pegar con los títulos corridos de la lista del SNIFFS, sin
 * títulos o columnas sueltas desde una celda— y el cruce con el libro (qué
 * troza es cada fila y si entra al lote). También el rótulo «En consumo».
 */
import { describe, expect, it } from "vitest";
import { agruparPorLote, conSobra, filasDeGrilla, pegarEnGrilla } from "@/lib/forestal/lote-desde-excel";
import { estadoDeLote, loteEnConsumo } from "@/lib/forestal/lotes-aserrio";
import {
  cruzarLote,
  fechaFueraDeRango,
  type CandidataLote,
} from "@/lib/forestal/lote-desde-excel-cruce";

/* Como lo copia Brandon: «Documento de Ingreso» y «Troza Padre» llevan una
   columna SIN título a su derecha (el N° de GTF y el código de la troza). */
const TITULOS = [
  "Contrato",
  "Numero Resolución",
  "Documento de Ingreso",
  "",
  "Troza Padre",
  "",
  "Codigo Planta",
  "Especie",
  "Lote",
  "D1(cm)",
  "D2(cm)",
  "Largo(m)",
  "Volumen",
  "Tipo de Producto",
  "Estado Actual",
  "Fecha del Estado",
  "Acciones",
].join("\t");
const fila = (
  gtf: string,
  troza: string,
  planta: string,
  d1: string,
  d2: string,
  largo: string,
  vol: string,
  lote = "28-2026",
) =>
  [
    "19-SEC/REG-PLT-2021-017",
    "19-SEC/REG-RD-0001",
    "GTF",
    gtf,
    "",
    troza,
    planta,
    "Cedrelinga cateniformis",
    lote,
    d1,
    d2,
    largo,
    vol,
    "MADERA EN ROLLO",
    "En consumo",
    "09/06/2026",
    "A Stock",
  ].join("\t");
const DATOS = [
  fila("019-001-0000012", "28", "13703182", "62", "56", "7,9", "2,16"),
  fila("019-001-0000012", "31", "13703180", "62", "49", "7,9", "1,911"),
  fila("019-001-0000013", "38", "13703203", "60", "58", "7,3", "1,996"),
];

/** Pegar en la grilla vacía desde una celda y leer lo que cruza el servidor. */
const pegarYLeer = (texto: string, desde = { fila: 0, col: 0 }, antes = conSobra([])) => {
  const r = pegarEnGrilla(antes, texto, desde);
  return { ...r, leidas: filasDeGrilla(r.filas) };
};

describe("pegarEnGrilla + filasDeGrilla", () => {
  it("con títulos: cada columna en la suya aunque se pegue desde otra celda, y la fila de la grilla manda", () => {
    const p = pegarYLeer([TITULOS, ...DATOS].join("\n") + "\n", { fila: 2, col: 7 });
    expect(p.conTitulos).toBe(true);
    expect(p.pegadas).toBe(3);
    expect(p.leidas).toHaveLength(3);
    expect(p.leidas[0]).toMatchObject({
      fila: 3,
      gtf: "019-001-0000012",
      codigoTroza: "28",
      codigoPlanta: "13703182",
      especie: "Cedrelinga cateniformis",
      lote: "28-2026",
      d1Cm: 62,
      d2Cm: 56,
      largoM: 7.9,
      volumenM3: 2.16,
      estado: "En consumo",
      fecha: "2026-06-09",
    });
    /* «1,911» sola sería 1911: el resto de la hoja escribe con coma decimal. */
    expect(p.leidas[1].volumenM3).toBe(1.911);
    // Siempre quedan filas vacías al final para seguir pegando.
    expect(p.filas.length).toBeGreaterThanOrEqual(12);
  });

  it("la lista entera sin títulos: se lee en el orden de la lista del SNIFFS", () => {
    const p = pegarYLeer(DATOS.join("\r\n"));
    expect(p.porPosicion).toBe(true);
    expect(p.leidas.map((f) => f.codigoPlanta)).toEqual(["13703182", "13703180", "13703203"]);
    expect(p.leidas[2]).toMatchObject({ fila: 3, gtf: "019-001-0000013", volumenM3: 1.996, fecha: "2026-06-09" });
  });

  it("columnas sueltas: desde la celda donde hiciste clic, hacia la derecha y abajo", () => {
    // Clic en «Cód. planta» (columna 2) de la fila 1: código · especie.
    const p = pegarYLeer("13703182\tTornillo\n13703180\tTornillo", { fila: 0, col: 2 });
    expect(p.conTitulos || p.porPosicion).toBe(false);
    expect(p.leidas.map((f) => [f.fila, f.codigoPlanta, f.especie])).toEqual([
      [1, "13703182", "Tornillo"],
      [2, "13703180", "Tornillo"],
    ]);
    // Y la guía se completa después, en su columna, sin tocar lo demás.
    const g = pegarEnGrilla(p.filas, "019-001-0000012\n019-001-0000012", { fila: 0, col: 0 });
    expect(filasDeGrilla(g.filas).map((f) => [f.gtf, f.codigoPlanta])).toEqual([
      ["019-001-0000012", "13703182"],
      ["019-001-0000012", "13703180"],
    ]);
  });

  it("la fila de TOTAL y las vacías no son trozas", () => {
    const total = ["", "", "", "", "", "", "", "", "", "", "", "", "5,067", "", "", "", ""].join("\t");
    const p = pegarYLeer([TITULOS, ...DATOS, total].join("\n"));
    expect(p.pegadas).toBe(3);
    expect(p.leidas).toHaveLength(3);
  });

  it("un pegado con dos lotes son dos lotes, cada uno con su fecha", () => {
    const p = pegarYLeer(
      [TITULOS, ...DATOS, fila("019-001-0000013", "20", "13703205", "57", "57", "5,3", "1,352", "29-2026")].join("\n"),
    );
    const g = agruparPorLote(p.leidas);
    expect(g.map((x) => [x.lote, x.filas.length, x.fecha])).toEqual([
      ["28-2026", 3, "2026-06-09"],
      ["29-2026", 1, "2026-06-09"],
    ]);
  });
});

const cand = (extra: Partial<CandidataLote> & { id: string }): CandidataLote => ({
  codigoPlanta: null,
  codificacion: null,
  gtf: "019-001-0000012",
  especieComun: "TORNILLO",
  especieCientifica: "Cedrelinga cateniformis",
  permiso: "19-SEC/REG-PLT-2021-017",
  volumenM3: 2.16,
  d1Cm: null,
  d2Cm: null,
  largoM: 7.9,
  lote: null,
  motivo: null,
  ingresoDia: "2026-10-19",
  ...extra,
});

describe("cruzarLote", () => {
  const filas = pegarYLeer([TITULOS, ...DATOS].join("\n")).leidas;

  it("las tres del libro entran: m³ del LIBRO, D1/D2 sólo donde faltan y la fecha mínima es la del último ingreso", () => {
    const c = cruzarLote(
      filas,
      [
        cand({ id: "a", codigoPlanta: "13703182", codificacion: "28", volumenM3: 2.16 }),
        cand({ id: "b", codigoPlanta: "13703180", volumenM3: 1.95, d1Cm: 61 }),
        cand({
          id: "c",
          codigoPlanta: "13703203",
          gtf: "019-001-0000013",
          volumenM3: 1.996,
          ingresoDia: "2026-10-20",
        }),
      ],
      null,
    );
    expect(c.bloqueos).toEqual([]);
    expect(c.filas.map((f) => f.estado)).toEqual(["entra", "entra", "entra"]);
    expect(c.piezas).toBe(3);
    expect(c.volumenM3).toBe(6.106);
    expect(c.especie).toEqual({ comun: "TORNILLO", cientifica: "Cedrelinga cateniformis" });
    expect(c.permiso).toBe("19-SEC/REG-PLT-2021-017");
    expect(c.fechaMinima).toBe("2026-10-20");
    // b: el libro dice 1,95 y el Excel 1,911 → aviso; su D1 ya estaba → sólo viaja el D2.
    expect(c.filas[1]).toMatchObject({ volumenDistinto: true, completaD1: null, completaD2: 49 });
    expect(c.filas[0]).toMatchObject({ volumenDistinto: false, completaD1: 62, completaD2: 56 });
    expect(c.conMedidas).toBe(3);
  });

  it("sin la pieza, con dos piezas del mismo código o la misma dos veces: no se adivina", () => {
    const sinGuia = filas.map((f) => ({ ...f, gtf: null }));
    const c = cruzarLote(
      [...sinGuia, { ...sinGuia[0], fila: 9 }],
      [
        cand({ id: "a", codigoPlanta: "13703182" }),
        cand({ id: "b1", codigoPlanta: "13703180" }),
        cand({ id: "b2", codigoPlanta: "13703180", gtf: "019-001-0000099" }),
      ],
      null,
    );
    expect(c.filas.map((f) => f.estado)).toEqual(["entra", "ambigua", "no-encontrada", "repetida"]);
    expect(c.filas[3].motivo).toBe("es la misma troza de la fila 1");
    expect(c.piezas).toBe(1);
  });

  it("el código de la troza en su guía la encuentra cuando el Código Planta no está en el libro", () => {
    const c = cruzarLote(
      filas.slice(0, 1),
      [cand({ id: "a", codigoPlanta: null, codificacion: "28" })],
      null,
    );
    expect(c.filas[0]).toMatchObject({ estado: "entra", trozaId: "a" });
  });

  it("la que el libro no deja consumir o ya está en otro lote no entra, con su porqué", () => {
    const c = cruzarLote(
      filas.slice(0, 2),
      [
        cand({ id: "a", codigoPlanta: "13703182", motivo: "ya entró a una corrida" }),
        cand({ id: "b", codigoPlanta: "13703180", lote: { id: "L9", code: "25-2026" } }),
      ],
      null,
    );
    expect(c.filas.map((f) => [f.estado, f.motivo])).toEqual([
      ["no-entra", "ya entró a una corrida"],
      ["no-entra", "ya está en el lote 25-2026"],
    ]);
    expect(c.bloqueos).toEqual(["Ninguna troza del pegado se puede consumir."]);
  });

  it("un lote es de UNA especie y UN permiso", () => {
    const c = cruzarLote(
      filas,
      [
        cand({ id: "a", codigoPlanta: "13703182" }),
        cand({ id: "b", codigoPlanta: "13703180", especieComun: "Cumala" }),
        cand({
          id: "c",
          codigoPlanta: "13703203",
          gtf: "019-001-0000013",
          permiso: "19-SEC/REG-PLT-2018-020",
        }),
      ],
      null,
    );
    expect(c.bloqueos.some((b) => b.startsWith("Un lote es de una sola especie"))).toBe(true);
    expect(c.bloqueos.some((b) => b.startsWith("Un lote ampara un solo permiso"))).toBe(true);
    expect(c.especie).toBeNull();
  });

  it("el lote con ese N° que ya estaba programado recibe las trozas; uno consumido no se toca", () => {
    const libro = [
      cand({ id: "a", codigoPlanta: "13703182", lote: { id: "L1", code: "28-2026" } }),
    ];
    const abierto = cruzarLote(filas.slice(0, 1), libro, {
      id: "L1",
      code: "28-2026",
      status: "abierto",
      especie: "Tornillo",
      permiso: null,
      libres: ["a", "z1", "z2"],
    });
    expect(abierto.bloqueos).toEqual([]);
    expect(abierto.filas[0].estado).toBe("ya-en-el-lote");
    // Consumo parcial (ADR-356): las dos que no vienen en el pegado quedan apartadas, y se avisa.
    expect(abierto.avisos).toEqual([
      "El lote 28-2026 tiene 2 trozas que no están en el pegado: quedan apartadas y el lote sigue abierto.",
    ]);
    const consumido = cruzarLote(filas.slice(0, 1), [cand({ id: "a", codigoPlanta: "13703182" })], {
      id: "L1",
      code: "28-2026",
      status: "consumido",
      especie: "Tornillo",
      permiso: null,
      libres: [],
    });
    expect(consumido.bloqueos[0]).toBe(
      "El lote 28-2026 ya existe y está consumido: cambia el N° de lote.",
    );
  });

  it("la que el SNIFFS no tiene «En consumo» entra igual (decide el libro) pero se avisa", () => {
    const c = cruzarLote([{ ...filas[0], estado: "Disponible" }], [cand({ id: "a", codigoPlanta: "13703182" })], null);
    expect(c.filas[0].estado).toBe("entra");
    expect(c.avisos).toEqual(["1 troza no figura «En consumo» en el SNIFFS: revisa la columna Estado Actual."]);
  });
});

describe("fechaFueraDeRango (T3)", () => {
  it("ni antes de que entren las trozas ni en el futuro", () => {
    expect(fechaFueraDeRango("2026-06-09", "2026-10-19", "2026-10-27")).toBe(
      "Las trozas entraron al libro el 19/10/2026: el consumo no puede ser antes.",
    );
    expect(fechaFueraDeRango("2026-10-28", null, "2026-10-27")).toMatch(/futura/);
    expect(fechaFueraDeRango("2026-10-19", "2026-10-19", "2026-10-27")).toBeNull();
    // «31/02/2026» tiene forma de fecha pero no existe: antes llegaba al servidor y daba 500.
    expect(fechaFueraDeRango("2026-02-31", null, "2026-10-27")).toBe("Esa fecha no existe: corrígela.");
  });
});

describe("estado del lote: «En consumo» hasta declarar la producción", () => {
  const corrida = (quantity: number | null, viva = true) => ({
    id: "c1", lineNo: 7, entryDate: "2026-10-19", productType: null, quantity, unit: "m3", status: "registrado", viva,
  });
  it("consumido con su corrida sin declarar → En consumo; declarada → Aserrado; abierto → Abierto", () => {
    expect(estadoDeLote({ status: "consumido", corridas: [corrida(null)] }).label).toBe("En consumo");
    expect(loteEnConsumo({ status: "consumido", produccion: corrida(null) })).toBe(true);
    expect(estadoDeLote({ status: "consumido", corridas: [corrida(12.5)] }).label).toBe("Aserrado");
    // Una corrida anulada no cuenta: sin corridas vivas no se afirma «en consumo».
    expect(loteEnConsumo({ status: "consumido", corridas: [corrida(null, false)] })).toBe(false);
    expect(estadoDeLote({ status: "abierto", corridas: [] }).label).toBe("Abierto");
  });
});
