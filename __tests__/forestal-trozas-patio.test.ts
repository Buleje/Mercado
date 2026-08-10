/**
 * El estado de cada PIEZA del patio.
 *
 * Lo que se blinda: el ORDEN en que se decide el estado. Una troza llega con
 * varias marcas a la vez y la que manda es la que decide si se puede usar. Los
 * dos casos que ya rompieron cosas antes: una **madre retrozada** sigue en la
 * base con su volumen pero no se consume nunca —van sus pedazos, contarla sería
 * la misma madera dos veces (ADR-313)— y una **descartada** no es «libre»
 * aunque nadie la haya consumido.
 */
import { describe, expect, it } from "vitest";
import {
  antiguedadDelPatio,
  diasParada,
  estadoDeTroza,
  estaEnPatio,
  filtrarPatio,
  resumirPatio,
  tramoDe,
  type TrozaPatio,
} from "@/lib/forestal/trozas-patio";

const t_ = (over: Partial<TrozaPatio> = {}): TrozaPatio => ({
  id: over.id ?? "t1",
  especieComun: "Tornillo",
  volumenM3: 1,
  gtfNumber: "GTF-1",
  fechaIngreso: "2026-08-01T00:00:00.000Z",
  fechaRecepcion: null,
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  trozaOrigenId: null,
  loteAserrioCode: null,
  ...over,
});

describe("estado de una troza", () => {
  it("sin ninguna marca está libre", () => {
    expect(estadoDeTroza(t_())).toBe("libre");
  });

  it("apartada en un lote no es libre", () => {
    expect(estadoDeTroza(t_({ loteAserrioCode: "LA-2026-001" }))).toBe("apartada");
  });

  it("consumida, despachada y no recepcionada se reconocen", () => {
    expect(estadoDeTroza(t_({ consumidaEnId: "c1" }))).toBe("consumida");
    expect(estadoDeTroza(t_({ despachadaEnId: "d1" }))).toBe("despachada");
    expect(estadoDeTroza(t_({ noRecepcionada: true }))).toBe("no_recepcionada");
  });

  it("⭐ la madre retrozada NO es libre aunque nada la haya consumido", () => {
    expect(estadoDeTroza(t_({ retrozos: 3 }))).toBe("retrozada");
    // ni siquiera si además está apartada: sus pedazos son los que se usan
    expect(estadoDeTroza(t_({ retrozos: 2, loteAserrioCode: "LA-1" }))).toBe("retrozada");
  });

  it("⭐ el descarte gana sobre todo lo demás", () => {
    expect(estadoDeTroza(t_({ descarte: true }))).toBe("descarte");
    expect(estadoDeTroza(t_({ descarte: true, consumidaEnId: "c1", retrozos: 2 }))).toBe("descarte");
  });

  it("despachada gana sobre consumida: la pieza se fue entera", () => {
    expect(estadoDeTroza(t_({ consumidaEnId: "c1", despachadaEnId: "d1" }))).toBe("despachada");
  });

  it("un retrozo (hijo) es una pieza normal más", () => {
    expect(estadoDeTroza(t_({ trozaOrigenId: "madre", retrozos: 0 }))).toBe("libre");
  });

  it("sólo libre y apartada siguen ocupando lugar en el patio", () => {
    expect(estaEnPatio("libre")).toBe(true);
    expect(estaEnPatio("apartada")).toBe(true);
    for (const e of ["consumida", "despachada", "retrozada", "descarte", "no_recepcionada"] as const) {
      expect(estaEnPatio(e)).toBe(false);
    }
  });
});

describe("resumen del patio", () => {
  it("cuenta piezas y m³ por estado", () => {
    const r = resumirPatio([
      t_({ id: "a", volumenM3: 2 }),
      t_({ id: "b", volumenM3: 3 }),
      t_({ id: "c", volumenM3: 5, consumidaEnId: "x" }),
    ]);
    expect(r.total).toEqual({ piezas: 3, m3: 10 });
    expect(r.enPatio).toEqual({ piezas: 2, m3: 5 });
    expect(r.porEstado.find((e) => e.estado === "libre")).toEqual({ estado: "libre", piezas: 2, m3: 5 });
    expect(r.porEstado.find((e) => e.estado === "consumida")?.m3).toBe(5);
  });

  it("los estados salen en orden de accionable, no de aparición", () => {
    const r = resumirPatio([t_({ id: "a", descarte: true }), t_({ id: "b" })]);
    expect(r.porEstado.map((e) => e.estado)).toEqual(["libre", "descarte"]);
  });

  it("por especie separa lo LIBRE del total: es lo que se puede aserrar hoy", () => {
    const r = resumirPatio([
      t_({ id: "a", especieComun: "Tornillo", volumenM3: 4 }),
      t_({ id: "b", especieComun: "Tornillo", volumenM3: 6, consumidaEnId: "x" }),
    ]);
    const tornillo = r.porEspecie[0];
    expect(tornillo).toMatchObject({ especie: "Tornillo", piezas: 2, m3: 10, libres: 1, m3Libres: 4 });
  });

  it("«Sin especie» va último aunque pese más", () => {
    const r = resumirPatio([
      t_({ id: "a", especieComun: null, volumenM3: 100 }),
      t_({ id: "b", especieComun: "Capirona", volumenM3: 1 }),
    ]);
    expect(r.porEspecie.map((e) => e.especie)).toEqual(["Capirona", "Sin especie"]);
  });

  it("cuenta las piezas sin codificación: no se pueden pedir por código", () => {
    const r = resumirPatio([
      t_({ id: "a", codificacion: "106/C" }),
      t_({ id: "b", codificacion: "   " }),
      t_({ id: "c", codificacion: null }),
    ]);
    expect(r.sinCodificar).toBe(2);
  });

  it("un volumen nulo cuenta como 0 y no rompe la suma", () => {
    const r = resumirPatio([t_({ id: "a", volumenM3: null }), t_({ id: "b", volumenM3: 4 })]);
    expect(r.total).toEqual({ piezas: 2, m3: 4 });
  });

  it("sin trozas no inventa nada", () => {
    const r = resumirPatio([]);
    expect(r.total).toEqual({ piezas: 0, m3: 0 });
    expect(r.porEstado).toEqual([]);
    expect(r.porEspecie).toEqual([]);
  });
});

describe("antigüedad", () => {
  const hoy = new Date("2026-08-10T00:00:00.000Z");

  it("cuenta por día UTC, no por hora local", () => {
    // 20:00 en Lima del 9 es el 10 en UTC: por hora local daría un día de más.
    expect(diasParada(t_({ fechaIngreso: "2026-08-09T23:00:00.000Z" }), hoy)).toBe(1);
    expect(diasParada(t_({ fechaIngreso: "2026-08-10T00:00:00.000Z" }), hoy)).toBe(0);
  });

  it("la RECEPCIÓN manda sobre el asiento de la guía", () => {
    const t = t_({ fechaIngreso: "2026-01-01T00:00:00.000Z", fechaRecepcion: "2026-08-01T00:00:00.000Z" });
    expect(diasParada(t, hoy)).toBe(9);
  });

  it("sin fecha no inventa una antigüedad", () => {
    expect(diasParada(t_({ fechaIngreso: null, fechaRecepcion: null }), hoy)).toBeNull();
    expect(diasParada(t_({ fechaIngreso: "no es fecha" }), hoy)).toBeNull();
  });

  it("reparte en los tres tramos", () => {
    const { tramos } = antiguedadDelPatio([
      t_({ id: "a", fechaIngreso: "2026-08-05T00:00:00.000Z", volumenM3: 1 }),   // 5 días
      t_({ id: "b", fechaIngreso: "2026-07-05T00:00:00.000Z", volumenM3: 2 }),   // 36
      t_({ id: "c", fechaIngreso: "2026-05-05T00:00:00.000Z", volumenM3: 3 }),   // 97
    ], hoy);
    expect(tramos.map((t) => [t.key, t.piezas, t.m3])).toEqual([
      ["fresca", 1, 1], ["atencion", 1, 2], ["riesgo", 1, 3],
    ]);
  });

  it("⭐ lo que YA no está en el patio no envejece", () => {
    const { tramos, masVieja } = antiguedadDelPatio([
      t_({ id: "a", fechaIngreso: "2026-01-01T00:00:00.000Z", consumidaEnId: "x" }),
      t_({ id: "b", fechaIngreso: "2026-01-01T00:00:00.000Z", descarte: true }),
      t_({ id: "c", fechaIngreso: "2026-08-08T00:00:00.000Z" }),
    ], hoy);
    expect(tramos.reduce((a, t) => a + t.piezas, 0)).toBe(1);
    expect(masVieja).toBe(2);
  });

  it("las que no tienen fecha se cuentan aparte, no se ubican en un tramo", () => {
    const { tramos, sinFecha } = antiguedadDelPatio([t_({ id: "a", fechaIngreso: null })], hoy);
    expect(sinFecha).toBe(1);
    expect(tramos.every((t) => t.piezas === 0)).toBe(true);
  });

  it("sin nada en patio, la más vieja es null y no 0", () => {
    expect(antiguedadDelPatio([], hoy).masVieja).toBeNull();
  });

  it("tramoDe ubica cada antigüedad, y sin fecha no ubica ninguna", () => {
    expect(tramoDe(0)).toBe("fresca");
    expect(tramoDe(29)).toBe("fresca");
    expect(tramoDe(30)).toBe("atencion");
    expect(tramoDe(59)).toBe("atencion");
    expect(tramoDe(60)).toBe("riesgo");
    expect(tramoDe(9999)).toBe("riesgo");
    expect(tramoDe(null)).toBeNull();
  });
});

describe("buscar en el patio", () => {
  const hoy = new Date("2026-08-10T00:00:00.000Z");
  const patio = [
    t_({ id: "a", codificacion: "106/C", especieComun: "Tornillo", volumenM3: 3, gtfNumber: "GTF-100", proveedor: "Maderera Ucayali", fechaIngreso: "2026-08-08T00:00:00.000Z" }),
    t_({ id: "b", codigoPlanta: "P-77", especieComun: "Capirona", volumenM3: 9, gtfNumber: "GTF-200", permiso: "TH-001", fechaIngreso: "2026-05-01T00:00:00.000Z" }),
    t_({ id: "c", codificacion: "13/A", especieComun: "Shihuahuaco", volumenM3: 1, consumidaEnId: "x", fechaIngreso: "2026-07-01T00:00:00.000Z" }),
  ];

  it("sin criterios devuelve todo, la más vieja primero", () => {
    expect(filtrarPatio(patio, {}, hoy).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("busca por el código del bosque y por el que marcó la planta", () => {
    expect(filtrarPatio(patio, { texto: "106" }, hoy).map((t) => t.id)).toEqual(["a"]);
    expect(filtrarPatio(patio, { texto: "p-77" }, hoy).map((t) => t.id)).toEqual(["b"]);
  });

  it("también por guía, proveedor y título habilitante", () => {
    expect(filtrarPatio(patio, { texto: "gtf-200" }, hoy).map((t) => t.id)).toEqual(["b"]);
    expect(filtrarPatio(patio, { texto: "ucayali" }, hoy).map((t) => t.id)).toEqual(["a"]);
    expect(filtrarPatio(patio, { texto: "th-001" }, hoy).map((t) => t.id)).toEqual(["b"]);
  });

  it("⭐ ignora tildes y mayúsculas: en el patio se tipea de corrido", () => {
    expect(filtrarPatio([t_({ id: "z", especieComun: "Cumalá roja" })], { texto: "cumala" }, hoy)).toHaveLength(1);
  });

  it("filtra por estado, por especie y por tramo", () => {
    expect(filtrarPatio(patio, { estado: "consumida" }, hoy).map((t) => t.id)).toEqual(["c"]);
    expect(filtrarPatio(patio, { especie: "Capirona" }, hoy).map((t) => t.id)).toEqual(["b"]);
    expect(filtrarPatio(patio, { tramo: "fresca" }, hoy).map((t) => t.id)).toEqual(["a"]);
  });

  it("los criterios se acumulan, no se reemplazan", () => {
    expect(filtrarPatio(patio, { estado: "libre", texto: "gtf" }, hoy).map((t) => t.id)).toEqual(["b", "a"]);
    expect(filtrarPatio(patio, { estado: "libre", especie: "Shihuahuaco" }, hoy)).toEqual([]);
  });

  it("ordena por volumen y por especie cuando se pide", () => {
    expect(filtrarPatio(patio, { orden: "volumen" }, hoy).map((t) => t.id)).toEqual(["b", "a", "c"]);
    expect(filtrarPatio(patio, { orden: "especie" }, hoy).map((t) => t.especieComun)).toEqual(["Capirona", "Shihuahuaco", "Tornillo"]);
  });

  it("el orden por código es natural: 13 va antes que 106", () => {
    expect(filtrarPatio(patio, { orden: "codigo" }, hoy).map((t) => t.codificacion ?? null)).toEqual(["13/A", "106/C", null]);
  });

  it("⭐ las piezas sin fecha caen al fondo, no se cuelan entre las frescas", () => {
    const conHuerfana = [...patio, t_({ id: "sf", fechaIngreso: null })];
    expect(filtrarPatio(conHuerfana, {}, hoy).map((t) => t.id).at(-1)).toBe("sf");
  });

  it("no muta el arreglo que recibe", () => {
    const orig = [...patio];
    filtrarPatio(patio, { orden: "volumen" }, hoy);
    expect(patio.map((t) => t.id)).toEqual(orig.map((t) => t.id));
  });
});
