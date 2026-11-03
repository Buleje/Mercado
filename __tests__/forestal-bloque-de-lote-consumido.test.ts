import { describe, expect, it } from "vitest";
import {
  abiertasDelLote,
  bloqueDeLoteConsumido,
  corridaEsDelBloqueEntero,
  diaDeCorrida,
  esBloqueDeInventario,
  observacionDeGuias,
  type LoteConsumido,
} from "@/lib/forestal/bloque-de-lote-consumido";
import { MAX_OBSERVACION_BLOQUE, MAX_TROZAS_POR_BLOQUE, type BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { motivoDelBloque, planLibroDeBloque, type LoteParaLibro } from "@/lib/forestal/jornadas-de-bloque";
import { topeDeclarableM3 } from "@/lib/forestal/produccion-paquetes";
import { derivarRecorrido } from "@/lib/forestal/recorrido-estado";

/* El lote 28-2026 de Blas (ADR-520), en chico: 3 trozas consumidas por la corrida N° 7. */
function lote(over: Partial<LoteConsumido> = {}): LoteConsumido {
  return {
    id: "lote-28",
    code: "28-2026",
    status: "consumido",
    speciesCommon: "TORNILLO",
    permiso: "19-SEC/REG-PLT-2025-167",
    trozas: [
      { id: "t1", codificacion: "A1", codigoPlanta: "P1", volumenM3: 2.5, largoM: 4, d1Cm: 60, d2Cm: 62, consumidaEnId: "c7" },
      { id: "t2", codificacion: "A2", codigoPlanta: "P2", volumenM3: 3.25, largoM: 4, d1Cm: 64, d2Cm: 66, consumidaEnId: "c7" },
      { id: "t3", codificacion: "A3", codigoPlanta: "P3", volumenM3: 1.75, consumidaEnId: "c7" },
    ],
    corridas: [{ id: "c7", lineNo: 7, entryDate: new Date("2026-10-19T12:00:00.000Z"), quantity: null, volumeInputM3: 7.5, viva: true }],
    ...over,
  };
}

describe("bloqueDeLoteConsumido — ADR-521", () => {
  it("arma UN bloque que adopta la corrida abierta, con sus trozas ya elegidas", () => {
    const r = bloqueDeLoteConsumido(lote(), ["t1", "t2", "t3"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bloque).toMatchObject({
      etiqueta: "Lote 28-2026",
      especie: "TORNILLO",
      m3: 7.5,
      permiso: "19-SEC/REG-PLT-2025-167",
      origen: "lote",
      loteId: "lote-28",
      tipo: "rolliza",
      trozaIds: ["t1", "t2", "t3"],
      trozasElegidas: ["t1", "t2", "t3"],
      fecha: "2026-10-19",
      dias: 1,
      corridaIds: ["c7"],
      jornadasLibro: [{ dia: 1, corridaId: "c7", lineNo: 7, estado: "abierta", fecha: "2026-10-19" }],
      costoM3: null,
      aprovechablePct: null,
    });
    /* El paso «Trozas» del Recorrido pide `trozasElegidas`: no es la misma lista por referencia. */
    expect(r.bloque.trozasElegidas).not.toBe(r.bloque.trozaIds);
    expect(r.bloque.trozasMedidas?.length).toBe(2);
    /* El tope trunca: 56 % de 7,5 = 4,2. */
    expect(r.corrida).toEqual({ id: "c7", lineNo: 7, fecha: "2026-10-19", volumenM3: 7.5, topeDeclarableM3: 4.2 });
  });

  it("sin permiso en el lote, toma el único de sus trozas", () => {
    const l = lote({ permiso: null, trozas: lote().trozas.map((t) => ({ ...t, permiso: "PLT-9" })) });
    const r = bloqueDeLoteConsumido(l, ["t1", "t2", "t3"]);
    expect(r.ok && r.bloque.permiso).toBe("PLT-9");
  });

  it("sin materia prima en la corrida, el tope sale de lo que suman sus trozas", () => {
    const l = lote({ corridas: [{ ...lote().corridas![0]!, volumeInputM3: null }] });
    const r = bloqueDeLoteConsumido(l, ["t1", "t2", "t3"]);
    expect(r.ok && r.corrida.volumenM3).toBe(7.5);
  });

  it("LOTE_NO_CONSUMIDO: un lote abierto o uno cerrado no se lleva así", () => {
    const abierto = bloqueDeLoteConsumido(lote({ status: "abierto" }), []);
    expect(abierto).toMatchObject({ ok: false, code: "LOTE_NO_CONSUMIDO" });
    const cerrado = bloqueDeLoteConsumido(lote({ status: "cerrado" }), []);
    expect(cerrado.ok === false && cerrado.message).toMatch(/ya está cerrado/);
  });

  it("SIN_CORRIDA_ABIERTA: ya declarada o anulada", () => {
    const declarada = lote({ corridas: [{ ...lote().corridas![0]!, quantity: 4 }] });
    const r1 = bloqueDeLoteConsumido(declarada, []);
    expect(r1).toMatchObject({ ok: false, code: "SIN_CORRIDA_ABIERTA" });
    expect(r1.ok === false && r1.message).toMatch(/N° 7/);
    const anulada = lote({
      corridas: [{ ...lote().corridas![0]!, viva: false }],
      trozas: lote().trozas.map((t) => ({ ...t, consumidaEnId: null })),
    });
    expect(bloqueDeLoteConsumido(anulada, [])).toMatchObject({ ok: false, code: "SIN_CORRIDA_ABIERTA" });
  });

  it("VARIAS_CORRIDAS_ABIERTAS: un bloque adopta una sola", () => {
    const l = lote({
      trozas: lote().trozas.map((t, i) => ({ ...t, consumidaEnId: i === 2 ? "c8" : "c7" })),
      corridas: [...lote().corridas!, { id: "c8", lineNo: 8, entryDate: "2026-10-20", quantity: null, viva: true }],
    });
    const r = bloqueDeLoteConsumido(l, []);
    expect(r).toMatchObject({ ok: false, code: "VARIAS_CORRIDAS_ABIERTAS" });
    expect(r.ok === false && r.message).toMatch(/N° 7, 8/);
  });

  it("CORRIDA_CON_OTRAS_PIEZAS: la corrida también comió madera de otro lote", () => {
    const r = bloqueDeLoteConsumido(lote(), ["t1", "t2", "t3", "ajena"]);
    expect(r).toMatchObject({ ok: false, code: "CORRIDA_CON_OTRAS_PIEZAS" });
  });

  it("DEMASIADAS_TROZAS: más de las que admite un bloque", () => {
    const n = MAX_TROZAS_POR_BLOQUE + 1;
    const trozas = Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      codificacion: null,
      codigoPlanta: null,
      volumenM3: 1,
      consumidaEnId: "c7",
    }));
    const r = bloqueDeLoteConsumido(lote({ trozas }), trozas.map((t) => t.id));
    expect(r).toMatchObject({ ok: false, code: "DEMASIADAS_TROZAS" });
  });
});

describe("piezas sueltas del helper", () => {
  it("diaDeCorrida: Date y ISO a AAAA-MM-DD; basura = null", () => {
    expect(diaDeCorrida(new Date("2026-10-19T12:00:00.000Z"))).toBe("2026-10-19");
    expect(diaDeCorrida("2026-10-19T12:00:00.000Z")).toBe("2026-10-19");
    expect(diaDeCorrida(new Date("x"))).toBeNull();
    expect(diaDeCorrida(null)).toBeNull();
  });

  it("abiertasDelLote: sólo vivas, sin producción y que comieron piezas del lote", () => {
    const l = lote({
      corridas: [
        ...lote().corridas!,
        { id: "c9", lineNo: 9, entryDate: "2026-10-21", quantity: null, viva: true },
        { id: "c5", lineNo: 5, entryDate: "2026-10-10", quantity: 3, viva: true },
      ],
    });
    expect(abiertasDelLote(l).map((c) => c.id)).toEqual(["c7"]);
  });

  it("corridaEsDelBloqueEntero: ni una troza más ni una menos", () => {
    const t = lote().trozas;
    expect(corridaEsDelBloqueEntero({ trozaIds: ["t1", "t2", "t3"] }, t, "c7")).toBe(true);
    expect(corridaEsDelBloqueEntero({ trozaIds: ["t1", "t2"] }, t, "c7")).toBe(false);
    expect(corridaEsDelBloqueEntero({ trozaIds: ["t1", "t2", "t3"], trozasElegidas: ["t1"] }, t, "c7")).toBe(false);
    expect(corridaEsDelBloqueEntero({ trozaIds: [] }, t, "c7")).toBe(false);
  });
});

describe("la guía del lote en la observación del bloque — 28-10", () => {
  it("el bloque lleva las GTF de sus trozas, sin repetir y en orden; la etiqueta sigue siendo el lote", () => {
    const gtf = ["019-001-0000013", "019-001-0000012", "019-001-0000013"];
    const l = lote({ trozas: lote().trozas.map((t, i) => ({ ...t, gtfNumber: gtf[i] })) });
    const r = bloqueDeLoteConsumido(l, ["t1", "t2", "t3"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bloque.etiqueta).toBe("Lote 28-2026");
    expect(r.bloque.observacion).toBe("Guías 019-001-0000012, 019-001-0000013");
  });

  it("una sola guía en singular; sin guías, sin observación", () => {
    const una = lote({ trozas: lote().trozas.map((t) => ({ ...t, gtfNumber: "019-001-0000012" })) });
    const r1 = bloqueDeLoteConsumido(una, ["t1", "t2", "t3"]);
    expect(r1.ok && r1.bloque.observacion).toBe("Guía 019-001-0000012");
    const r2 = bloqueDeLoteConsumido(lote(), ["t1", "t2", "t3"]);
    expect(r2.ok && "observacion" in r2.bloque).toBe(false);
  });

  it("observacionDeGuias: orden numérico y tope con «y N más» que nunca se pasa", () => {
    expect(observacionDeGuias(["019-001-10", "019-001-9", null, " ", undefined])).toBe("Guías 019-001-9, 019-001-10");
    const muchas = Array.from({ length: 40 }, (_, i) => `019-001-${String(i + 1).padStart(7, "0")}`);
    const txt = observacionDeGuias(muchas);
    expect(txt!.length).toBeLessThanOrEqual(MAX_OBSERVACION_BLOQUE);
    expect(txt).toMatch(/^Guías 019-001-0000001, .* y \d+ más$/);
    expect(observacionDeGuias([])).toBeNull();
  });
});

/*
 * Lote de INVENTARIO (Brandon 03-11: «quiero que estén en corrida viva para
 * usarlas en distribución por bloque»). Los lotes 28/32/33-2026 de Blas tienen
 * su corrida viva sin producción pero 0 trozas (el consumo entró por volumen):
 * antes «Repartir en la distribución» decía, falso, que la corrida «se anuló».
 */
describe("lote de inventario — sin trozas, con su corrida viva (03-11)", () => {
  const inventario = (over: Partial<LoteConsumido> = {}) =>
    lote({
      trozas: [],
      corridas: [{ id: "c28", lineNo: 28, entryDate: "2026-10-30", quantity: null, volumeInputM3: 6.409, viva: true }],
      ...over,
    });

  it("arma el bloque con la corrida adoptada y el m³ que entró a la sierra", () => {
    const r = bloqueDeLoteConsumido(inventario(), []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bloque).toMatchObject({
      etiqueta: "Lote 28-2026",
      m3: 6.409,
      origen: "lote",
      loteId: "lote-28",
      trozaIds: [],
      trozasElegidas: [],
      corridaIds: ["c28"],
      jornadasLibro: [{ dia: 1, corridaId: "c28", lineNo: 28, estado: "abierta", fecha: "2026-10-30" }],
    });
    expect(r.bloque.observacion).toMatch(/^Lote de inventario · .* m³ consumidos$/);
    expect(r.corrida).toEqual({ id: "c28", lineNo: 28, fecha: "2026-10-30", volumenM3: 6.409, topeDeclarableM3: topeDeclarableM3(6.409) });
    expect(esBloqueDeInventario(r.bloque)).toBe(true);
  });

  it("nunca dice «se anuló» de una corrida viva: el mensaje falso del 03-11", () => {
    const r = bloqueDeLoteConsumido(inventario(), []);
    expect(r.ok ? "" : r.message).not.toMatch(/se anuló/);
    /* Sin corrida viva sí se avisa (esa vez es verdad). */
    const muerta = bloqueDeLoteConsumido(inventario({ corridas: [{ id: "c28", lineNo: 28, entryDate: "2026-10-30", quantity: null, viva: false }] }), []);
    expect(muerta).toMatchObject({ ok: false, code: "SIN_CORRIDA_ABIERTA" });
    /* Y sin hablar de «trozas» que el lote no tiene. */
    expect(muerta.ok ? "" : muerta.message).toMatch(/es de inventario y no tiene una corrida viva/);
  });

  it("sin m³ consumido en la corrida no se arma (no hay tope contra qué medir)", () => {
    const r = bloqueDeLoteConsumido(inventario({ corridas: [{ id: "c28", lineNo: 28, entryDate: "2026-10-30", quantity: null, viva: true }] }), []);
    expect(r).toMatchObject({ ok: false, code: "SIN_CORRIDA_ABIERTA" });
    expect(r.ok ? "" : r.message).toMatch(/es de inventario/);
  });

  it("una corrida que comió trozas de otro lote frena igual (I1)", () => {
    expect(bloqueDeLoteConsumido(inventario(), ["t-ajena"])).toMatchObject({ ok: false, code: "CORRIDA_CON_OTRAS_PIEZAS" });
  });

  it("ya declarada o con dos corridas abiertas: los mismos frenos de siempre", () => {
    const declarada = inventario({ corridas: [{ id: "c28", lineNo: 28, entryDate: "2026-10-30", quantity: 3, volumeInputM3: 6.409, viva: true }] });
    expect(bloqueDeLoteConsumido(declarada, [])).toMatchObject({ ok: false, code: "SIN_CORRIDA_ABIERTA" });
    const dos = inventario({
      corridas: [
        { id: "c28", lineNo: 28, entryDate: "2026-10-30", quantity: null, volumeInputM3: 6.409, viva: true },
        { id: "c29", lineNo: 29, entryDate: "2026-10-31", quantity: null, volumeInputM3: 1, viva: true },
      ],
    });
    expect(bloqueDeLoteConsumido(dos, [])).toMatchObject({ ok: false, code: "VARIAS_CORRIDAS_ABIERTAS" });
  });

  it("esBloqueDeInventario: de un lote, sin trozas y con UNA corrida", () => {
    expect(esBloqueDeInventario({ origen: "lote", trozaIds: [], corridaIds: ["c28"] })).toBe(true);
    expect(esBloqueDeInventario({ origen: "trozas", trozaIds: [], corridaIds: ["c28"] })).toBe(false);
    expect(esBloqueDeInventario({ origen: "lote", trozaIds: ["t1"], corridaIds: ["c28"] })).toBe(false);
    expect(esBloqueDeInventario({ origen: "lote", trozaIds: [], corridaIds: [] })).toBe(false);
    expect(esBloqueDeInventario({ origen: "lote", trozaIds: [], corridaIds: ["c28", "c29"] })).toBe(false);
  });

  it("corridaEsDelBloqueEntero: la adoptada, y sólo si el lote sigue sin trozas", () => {
    const b = { origen: "lote" as const, trozaIds: [], corridaIds: ["c28"] };
    expect(corridaEsDelBloqueEntero(b, [], "c28")).toBe(true);
    expect(corridaEsDelBloqueEntero(b, [], "c99")).toBe(false);
    /* Si al lote le cargaron trozas después, ya no es de inventario para esta corrida. */
    expect(corridaEsDelBloqueEntero(b, [{ id: "t1", consumidaEnId: null }], "c28")).toBe(false);
  });

  it("el plan del día: declarable con el m³ de la corrida y el tope del 56 % sobre él", () => {
    const r = bloqueDeLoteConsumido(inventario(), []);
    if (!r.ok) throw new Error(r.message);
    const loteLibro: LoteParaLibro = {
      id: "lote-28",
      code: "28-2026",
      trozas: [],
      corridas: [{ id: "c28", lineNo: 28, entryDate: "2026-10-30T12:00:00.000Z", productType: null, quantity: null, volumeInputM3: 6.409, unit: "m3", status: "registrado", viva: true }],
      volumenM3: 0,
    };
    const bloque = { ...r.bloque, id: "b28" } as BloqueRolliza;
    expect(motivoDelBloque(bloque, loteLibro)).toBeNull();
    expect(motivoDelBloque(bloque, null)).toMatch(/No encuentro su lote/);
    const g = { clave: "tipo|comercial", label: "Comercial", piezas: 40, m3: 3, pieTablar: 1272, medidas: [] };
    const p = planLibroDeBloque({ bloque, porDia: [{ dia: 1, grupos: [g], piezas: 40, m3: 3, pieTablar: 1272 }] }, loteLibro, "2026-11-03");
    expect(p.jornadas[0]).toMatchObject({ estado: "abierta", corridaId: "c28", corridaDelBloque: true, declarable: true, trozaIds: [] });
    expect(p.jornadas[0]!.rollizaM3).toBeCloseTo(6.409, 4);
    expect(p.jornadas[0]!.motivo).toMatch(/consumió los 6.409 m³ del lote/);
    /* 4 m³ pasan el 56 % de 6,409 (3,589): no declarable y lo dice. */
    const pasa = planLibroDeBloque({ bloque, porDia: [{ dia: 1, grupos: [{ ...g, m3: 4 }], piezas: 40, m3: 4, pieTablar: 1696 }] }, loteLibro, "2026-11-03");
    expect(pasa.jornadas[0]!.declarable).toBeUndefined();
    expect(pasa.jornadas[0]!.motivo).toMatch(/tope del 56 %/);
  });

  it("el Recorrido: datos y trozas no traban; jornadas pide «Declarar la corrida N° 28»", () => {
    const r = bloqueDeLoteConsumido(inventario(), []);
    if (!r.ok) throw new Error(r.message);
    const e = derivarRecorrido({
      distribucionId: "d1",
      bloque: { ...r.bloque, id: "b28" } as BloqueRolliza,
      trozas: [],
      noEncontradas: [],
      lote: { id: "lote-28", code: "28-2026", status: "consumido", trozas: [], corridas: [{ id: "c28", lineNo: 28, viva: true, quantity: null, volumeInputM3: 6.409, unit: "m3" }] },
      anexos: [],
      despachos: [],
      hoy: "2026-11-03",
    });
    const paso = (p: string) => e.pasos.find((x) => x.paso === p)!;
    expect(paso("datos")).toMatchObject({ estado: "hecho" });
    expect(paso("datos").detalle).toMatch(/Lote de inventario · 6.409 m³ consumidos · permiso 19-SEC/);
    expect(paso("trozas").estado).toBe("no_aplica");
    expect(paso("lote").estado).toBe("hecho");
    expect(paso("jornadas")).toMatchObject({ estado: "pendiente", code: "CORRIDA_POR_DECLARAR", motivo: "Declarar la corrida N° 28" });
    /* La cabecera: la rolliza es lo que entró a la corrida (antes decía 0 m³). */
    expect(e.rollizaM3).toBeCloseTo(6.409, 4);
  });

  it("si al lote le cargaron trozas después, ya no es de inventario (ni en el plan ni en el Recorrido)", () => {
    const r = bloqueDeLoteConsumido(inventario(), []);
    if (!r.ok) throw new Error(r.message);
    const bloque = { ...r.bloque, id: "b28" } as BloqueRolliza;
    const conTrozas: LoteParaLibro = { id: "lote-28", code: "28-2026", trozas: [{ id: "t9", codificacion: null, codigoPlanta: "P9", volumenM3: 1, consumidaEnId: null }], corridas: [], volumenM3: 1 };
    expect(motivoDelBloque(bloque, conTrozas)).toMatch(/Salió de un lote ya creado/);
    const e = derivarRecorrido({
      distribucionId: "d1",
      bloque,
      trozas: [],
      noEncontradas: [],
      lote: { id: "lote-28", code: "28-2026", status: "consumido", trozas: [{ id: "t9", consumidaEnId: null }], corridas: [] },
      anexos: [],
      despachos: [],
      hoy: "2026-11-03",
    });
    expect(e.pasos.find((x) => x.paso === "datos")).toMatchObject({ estado: "con_problema", code: "SIN_TROZAS" });
  });
});
