/**
 * «Por árbol» sigue la troza hasta el aserradero (L13): el estado de cada pieza
 * sale de la MISMA regla del patio y de la ficha, la madre retrozada no se
 * cuenta y lo que no tiene enlace se dice, no se adivina.
 */
import { describe, it, expect } from "vitest";
import { buildTraceOperations, type TraceOperation } from "@/lib/forestal/loth-trace";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import {
  despachosDelTrozado,
  destinoDelArbol,
  fraseDeEstados,
  pasosDelArbol,
  piezaDeFilaCtp,
  piezasPorTrozado,
  POR_RECIBIR,
  SIN_ENLACE,
  textoDestino,
  trozadoIdsDe,
  type FilaCtpDeTrozado,
  type PiezaCtp,
} from "@/lib/forestal/loth-trace-aserradero";
import { armarExtraccion, recepcionesDePiezas, type LineaDeExtraccion } from "@/lib/forestal/loth-extraccion";

const T = "tenant-a";
let seq = 0;

function fila(p: Partial<FilaCtpDeTrozado> = {}): FilaCtpDeTrozado {
  seq += 1;
  return {
    id: `pz${seq}`,
    lothTrozadoId: "tz1",
    arbolCodigo: "85-TOR",
    codificacion: "85-TOR-A",
    codigoPlanta: null,
    especieComun: "Tornillo",
    volumenM3: "1.471",
    noRecepcionada: false,
    fechaRecepcion: new Date("2026-10-02T05:00:00Z"),
    descarte: false,
    trozaOrigenId: null,
    _count: { retrozos: 0 },
    entry: {
      id: "ing1",
      libroNro: 7,
      gtfNumber: "001-0000120",
      providerName: "Titular QA",
      entryDate: new Date("2026-10-01T05:00:00Z"),
      fechaRecepcion: new Date("2026-10-02T05:00:00Z"),
      status: "validado",
      originCode: "25-PUC/C-MAD-2026-001",
    },
    loteAserrio: null,
    consumidaEn: null,
    despachadaEn: null,
    ...p,
  };
}

const corrida = (p: Partial<NonNullable<FilaCtpDeTrozado["consumidaEn"]>> = {}): NonNullable<FilaCtpDeTrozado["consumidaEn"]> => ({
  id: "c12",
  tenantId: T,
  lineNo: 12,
  entryDate: new Date("2026-10-05T05:00:00Z"),
  status: "registrado",
  deletedAt: null,
  productType: "Madera aserrada",
  presentacion: null,
  quantity: "300",
  unit: "pt",
  ...p,
});

const pieza = (p: Partial<FilaCtpDeTrozado> = {}): PiezaCtp => {
  const x = piezaDeFilaCtp(T, fila(p));
  if (!x) throw new Error("sin pieza");
  return x;
};

let eseq = 0;
const linea = (p: Partial<LothEntryDTO>): LothEntryDTO =>
  ({
    id: `e${eseq++}`,
    section: "tala",
    lineNo: eseq,
    entryDate: "2026-09-20",
    treeCode: "85-TOR",
    trozaCode: null,
    despachoCode: null,
    isRama: false,
    speciesCommon: "Tornillo",
    speciesScientific: null,
    cites: false,
    diamMayorM: null,
    diamMenorM: null,
    lengthM: null,
    volumeM3: "5",
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
    ...p,
  }) as LothEntryDTO;

/** El árbol 85-TOR con sus trozas (`[id, código]`) y los despachos del Libro TH (`[código, día]`). */
function arbolTh(trozas: [string, string][], despachos: [string, string][] = []): TraceOperation {
  const op = buildTraceOperations(
    [
      linea({ section: "tala", entryDate: "2026-09-20" }),
      ...trozas.map(([id, code]) => linea({ id, section: "trozado", trozaCode: code, volumeM3: "1", entryDate: "2026-09-21" })),
      ...despachos.map(([code, dia]) => linea({ section: "despacho_troza", treeCode: null, trozaCode: code, gtfNumber: "001-0000120", entryDate: dia })),
    ],
    { hoy: new Date("2026-10-08T12:00:00Z") },
  ).find((o) => o.tree === "85-TOR");
  if (!op) throw new Error("sin op");
  return op;
}

describe("piezaDeFilaCtp — el estado es el del patio y la ficha", () => {
  it("una corrida viva la deja aserrada, con su N° y su producto", () => {
    const p = pieza({ consumidaEn: corrida(), loteAserrio: { code: "L-3", status: "consumido" } });
    expect(p.estado).toBe("consumida");
    expect(p.corrida).toMatchObject({ lineNo: 12, dia: "2026-10-05", producto: "Madera aserrada", cantidad: 300 });
    expect(p.m3).toBeCloseTo(1.471, 6);
  });

  it("una corrida anulada, borrada o de OTRO negocio no cuenta: la madera volvió al patio", () => {
    expect(pieza({ consumidaEn: corrida({ status: "anulado" }) }).estado).toBe("libre");
    expect(pieza({ consumidaEn: corrida({ deletedAt: new Date() }) }).corrida).toBeNull();
    expect(pieza({ consumidaEn: corrida({ tenantId: "otro" }) }).estado).toBe("libre");
    expect(pieza({ consumidaEn: corrida({ status: "anulado" }), loteAserrio: { code: "L-3", status: "abierto" } }).estado).toBe("apartada");
  });

  it("la que no llegó y la de guía en bandeja no tienen día de llegada", () => {
    expect(pieza({ noRecepcionada: true })).toMatchObject({ estado: "no_recepcionada", llegada: null });
    const enBandeja = pieza({
      fechaRecepcion: null,
      entry: { ...fila().entry, status: "pendiente", fechaRecepcion: null },
    });
    expect(enBandeja).toMatchObject({ estado: "por_recepcionar", llegada: null });
  });

  it("el día de llegada dice de dónde sale: pieza, guía o asiento (derivado)", () => {
    expect(pieza().llegada).toEqual({ dia: "2026-10-02", fuente: "pieza" });
    expect(pieza({ fechaRecepcion: null }).llegada).toEqual({ dia: "2026-10-02", fuente: "guia" });
    expect(pieza({ fechaRecepcion: null, entry: { ...fila().entry, fechaRecepcion: null } }).llegada).toEqual({
      dia: "2026-10-01",
      fuente: "asiento",
    });
  });

  it("la descartada que nunca bajó del camión no tiene día de llegada (el descarte no lo tapa)", () => {
    expect(pieza({ descarte: true, noRecepcionada: true })).toMatchObject({ estado: "descarte", llegada: null });
    expect(pieza({ descarte: true }).llegada).toEqual({ dia: "2026-10-02", fuente: "pieza" });
  });

  it("sin enlace no hay pieza", () => {
    expect(piezaDeFilaCtp(T, fila({ lothTrozadoId: null }))).toBeNull();
  });
});

describe("destinoDelArbol", () => {
  it("salta a la madre retrozada (van sus pedazos) y cuenta lo que no tiene pieza", () => {
    const madre = pieza({ id: "madre", lothTrozadoId: "tz1", _count: { retrozos: 2 }, volumenM3: "2" });
    const p1 = pieza({ lothTrozadoId: "tz1", trozaOrigenId: "madre", volumenM3: "1", consumidaEn: corrida() });
    const p2 = pieza({ lothTrozadoId: "tz1", trozaOrigenId: "madre", volumenM3: "0.9" });
    const otra = pieza({ lothTrozadoId: "tz2", volumenM3: "1.29", consumidaEn: corrida() });
    const op = arbolTh([["tz1", "85-TOR-A"], ["tz2", "85-TOR-B"], ["tz3", "85-TOR-C"]]);
    const d = destinoDelArbol(op, piezasPorTrozado([madre, p1, p2, otra]));

    expect(madre.estado).toBe("retrozada");
    expect(d.trozadas).toBe(3);
    expect(d.enlazadas).toBe(2);
    expect(d.piezas.map((p) => p.id)).not.toContain("madre");
    expect(d.porEstado).toEqual({ consumida: 2, libre: 1 });
    expect(d.m3).toEqual({ recibido: 3.19, aserrado: 2.29, enPatio: 0.9, salioEntera: 0 });
    expect(d.corridas).toEqual([{ lineNo: 12, dia: "2026-10-05", producto: "Madera aserrada", piezas: 2, m3: 2.29 }]);
    expect(d.ingresos).toHaveLength(1);
    expect(d.planta.map((t) => [t.trozadoId, t.recibida, t.aserrada])).toEqual([
      ["tz1", true, true],
      ["tz2", true, true],
      ["tz3", false, false],
    ]);
    expect(d.sinPieza).toEqual({ sin_despacho: 1, por_recibir: 0, sin_enlace: 0 });
    expect(textoDestino(d)).toBe("2 de 3 en el CTP: 2 aserradas · 1 en patio; 1 sin despacho");
  });

  it("el despacho se cruza por el código de la troza, no por el árbol", () => {
    // Una línea de despacho con el código del ÁRBOL es del árbol, pero no dice cuál de sus trozas salió.
    const op = arbolTh([["tzA", "85-TOR-A"], ["tzB", "85-TOR-B"]], [["85-TOR", "2026-09-30"], ["85-TOR-B", "2026-09-25"]]);
    expect([...despachosDelTrozado(op)]).toEqual([["tzB", "2026-09-25"]]);
  });
});

describe("sin ninguna pieza enlazada, manda el despacho de cada troza", () => {
  const sinPiezas = new Map<string, PiezaCtp[]>();

  it("sin despacho: no dice «sin enlace» (la troza sigue en el bosque, o se usó allá)", () => {
    const op = arbolTh([["tzA", "85-TOR-A"], ["tzB", "85-TOR-B"]]);
    const d = destinoDelArbol(op, sinPiezas);
    expect(d.sinPieza).toEqual({ sin_despacho: 2, por_recibir: 0, sin_enlace: 0 });
    expect(textoDestino(d)).toBe("sin despacho");
    expect(textoDestino(d)).not.toMatch(/enlace/i);
    const recibido = pasosDelArbol(op, d)[3];
    expect(recibido).toMatchObject({ hecho: false, detalle: null, nota: null });
  });

  it("despachada ANTES del 29-09: «sin enlace» con su ⓘ", () => {
    const op = arbolTh([["tzA", "85-TOR-A"]], [["85-TOR-A", "2026-09-28"]]);
    const d = destinoDelArbol(op, sinPiezas);
    expect(textoDestino(d)).toBe("sin enlace al Libro CTP");
    expect(pasosDelArbol(op, d)[3]).toMatchObject({ hecho: false, detalle: "Sin enlace", nota: SIN_ENLACE });
  });

  it("despachada DESDE el 29-09: «por recibir en el CTP», no «sin enlace»", () => {
    const op = arbolTh([["tzA", "85-TOR-A"]], [["85-TOR-A", "2026-09-29"]]);
    const d = destinoDelArbol(op, sinPiezas);
    expect(textoDestino(d)).toBe("por recibir en el CTP");
    expect(pasosDelArbol(op, d)[3]).toMatchObject({ hecho: false, detalle: "Por recibir", nota: POR_RECIBIR });
  });

  it("mezcla: cada troza por lo suyo, y el ⓘ explica las dos", () => {
    const op = arbolTh(
      [["tzA", "85-TOR-A"], ["tzB", "85-TOR-B"], ["tzC", "85-TOR-C"]],
      [["85-TOR-A", "2026-09-30"], ["85-TOR-B", "2026-09-10"]],
    );
    const d = destinoDelArbol(op, sinPiezas);
    expect(d.sinPiezaPorTrozado).toEqual({ tzA: "por_recibir", tzB: "sin_enlace", tzC: "sin_despacho" });
    expect(textoDestino(d)).toBe("1 por recibir en el CTP · 1 sin enlace al Libro CTP · 1 sin despacho");
    expect(pasosDelArbol(op, d)[3].nota).toBe(`${POR_RECIBIR} ${SIN_ENLACE}`);
  });
});

describe("Por árbol y Extracción leen el enlace con UNA regla", () => {
  /*
   * tzA: la madre se partió y uno de sus pedazos se aserró (la madre va PRIMERO,
   *      como salía sin `orderBy`: Extracción la decía «no aserrada»);
   * tzB: su guía sigue en la bandeja (Extracción la contaba «recibida»);
   * tzC: descartada («no entra a ningún cálculo»; Extracción la contaba).
   */
  const piezas = [
    pieza({ id: "madre", lothTrozadoId: "tzA", _count: { retrozos: 2 }, volumenM3: "2" }),
    pieza({ lothTrozadoId: "tzA", trozaOrigenId: "madre", volumenM3: "1.1", consumidaEn: corrida() }),
    pieza({ lothTrozadoId: "tzA", trozaOrigenId: "madre", volumenM3: "0.9" }),
    pieza({ lothTrozadoId: "tzB", fechaRecepcion: null, entry: { ...fila().entry, id: "ing2", status: "pendiente", fechaRecepcion: null } }),
    pieza({ lothTrozadoId: "tzC", descarte: true }),
  ];
  const trozas: [string, string][] = [["tzA", "85-TOR-A"], ["tzB", "85-TOR-B"], ["tzC", "85-TOR-C"]];
  const op = arbolTh(trozas, trozas.map(([, code]) => [code, "2026-09-30"]));
  const d = destinoDelArbol(op, piezasPorTrozado(piezas));

  it("Por árbol: sólo tzA llegó y se aserró; tzB por recepcionar; tzC descartada", () => {
    expect(piezas.map((p) => p.estado)).toEqual(["retrozada", "consumida", "libre", "por_recepcionar", "descarte"]);
    expect(d.planta.map((t) => [t.trozadoId, t.recibida, t.aserrada])).toEqual([
      ["tzA", true, true],
      ["tzB", false, false],
      ["tzC", false, false],
    ]);
    const [, , , recibido, aserrado] = pasosDelArbol(op, d);
    expect(recibido).toMatchObject({ hecho: true, dia: "2026-10-02" });
    expect(aserrado.hecho).toBe(true);
  });

  it("Extracción dice lo mismo: una recepción, aserrada, con el día de la pieza", () => {
    const rs = recepcionesDePiezas(piezas);
    expect(rs).toEqual(
      d.planta.filter((t) => t.recibida).map((t) => ({ lothTrozadoId: t.trozadoId, volumenM3: t.m3Guia, aserrada: t.aserrada, dia: t.dia })),
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ lothTrozadoId: "tzA", aserrada: true, dia: "2026-10-02" });
    expect(rs[0].volumenM3).toBeCloseTo(2, 6);

    // …y la tabla de Extracción, armada con esas recepciones, cuenta lo mismo que la ventana del árbol.
    let n = 0;
    const lx = (o: Partial<LineaDeExtraccion>): LineaDeExtraccion => ({
      id: `x${++n}`, planId: "p1", section: "tala", status: "registrado", lineNo: n, entryDate: "2026-09-20",
      treeCode: "85-TOR", trozaCode: null, speciesCommon: "Tornillo", cites: false, volumeM3: 1, quantity: null, unit: null, gtfNumber: null,
      ...o,
    });
    const r = armarExtraccion({
      hoy: new Date("2026-10-08T17:00:00Z"),
      alcance: { planId: null, contratoId: null },
      planesEnAlcance: null,
      conSinPlan: true,
      planes: [{
        id: "p1", planNumber: "PO 12", planType: "PO", titular: "QA", alias: null, estado: "vigente", tituloHabilitante: null,
        contratoId: null, vigenciaDesde: "2026-01-15", vigenciaHasta: "2027-01-14", areaHa: null,
        poa: { config: { dmcOverrides: {}, semillerosPct: 0 }, configurado: true }, especies: [],
      }],
      permisos: [],
      arboles: [{ id: "a85", planId: "p1", treeCode: "85-TOR", speciesCommon: "Tornillo", cites: false, dapM: 0.8, volumenEstimadoM3: 4, estado: "en_pie", condicion: null }],
      lineas: [
        lx({ volumeM3: 3.5 }),
        ...trozas.map(([id, code]) => lx({ id, section: "trozado", trozaCode: code, entryDate: "2026-09-21" })),
        ...trozas.map(([, code]) => lx({ section: "despacho_troza", treeCode: null, trozaCode: code, gtfNumber: "001-0000120", entryDate: "2026-09-30", volumeM3: null })),
      ],
      recepciones: rs,
      limites: { arbolesLeidos: 1, lineasLeidas: 7, truncado: false },
    });
    const tornillo = r.especies.find((e) => e.etiqueta === "Tornillo");
    expect(tornillo?.recibido.n).toBe(d.planta.filter((t) => t.recibida).length);
    expect(tornillo?.aserrado.n).toBe(d.planta.filter((t) => t.aserrada).length);
    expect(tornillo?.recibido.m3Guia).toBeCloseTo(d.m3.recibido, 6);
  });
});

describe("fraseDeEstados", () => {
  it("lo aserrado primero y en plural castellano", () => {
    expect(fraseDeEstados({ libre: 1, consumida: 1, no_recepcionada: 2 })).toBe("1 aserrada · 1 en patio · 2 no llegaron");
  });
});

describe("pasosDelArbol — talado → trozado → despachado → recibido → aserrado", () => {
  const entries = [
    linea({ section: "tala", entryDate: "2026-09-20" }),
    linea({ id: "tzA", section: "trozado", trozaCode: "85-TOR-A", volumeM3: "1.471", entryDate: "2026-09-21" }),
    linea({ id: "tzB", section: "trozado", trozaCode: "85-TOR-B", volumeM3: "1.29", entryDate: "2026-09-21" }),
    linea({ section: "despacho_troza", treeCode: null, trozaCode: "85-TOR-A", gtfNumber: "001-0000120", entryDate: "2026-09-30" }),
  ];
  const op = buildTraceOperations(entries, { hoy: new Date("2026-10-08T12:00:00Z") }).find((o) => o.tree === "85-TOR");

  it("lee los ids del Trozado vigente del árbol", () => {
    expect(trozadoIdsDe(op)).toEqual(["tzA", "tzB"]);
  });

  it("sin respuesta del CTP, los dos últimos pasos quedan sin hacer y sin acusar", () => {
    if (!op) throw new Error("sin op");
    const pasos = pasosDelArbol(op, undefined);
    expect(pasos.map((p) => [p.clave, p.hecho])).toEqual([
      ["talado", true],
      ["trozado", true],
      ["despachado", true],
      ["recibido", false],
      ["aserrado", false],
    ]);
    expect(pasos[2].detalle).toContain("GTF 001-0000120");
    expect(pasos[3].nota).toBeNull();
  });

  it("sin pieza: la despachada el 30-09 está por recibir y la otra no salió (nada de «sin enlace»)", () => {
    if (!op) throw new Error("sin op");
    const pasos = pasosDelArbol(op, destinoDelArbol(op, new Map()));
    expect(pasos[3]).toMatchObject({ hecho: false, detalle: "1 por recibir en el CTP · 1 sin despacho", nota: POR_RECIBIR });
  });

  it("con la troza recibida y aserrada: ingreso, día y N° de corrida", () => {
    if (!op) throw new Error("sin op");
    const d = destinoDelArbol(op, piezasPorTrozado([pieza({ lothTrozadoId: "tzA", consumidaEn: corrida() })]));
    const [, , , recibido, aserrado] = pasosDelArbol(op, d);
    expect(recibido).toMatchObject({ hecho: true, dia: "2026-10-02", detalle: "Ingreso N° 7 · GTF 001-0000120", nota: null });
    expect(aserrado).toMatchObject({ hecho: true, dia: "2026-10-05", detalle: "Corrida N° 12 · 1.471 m³" });
  });
});
