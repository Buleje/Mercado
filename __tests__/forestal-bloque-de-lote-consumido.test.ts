import { describe, expect, it } from "vitest";
import {
  abiertasDelLote,
  bloqueDeLoteConsumido,
  corridaEsDelBloqueEntero,
  diaDeCorrida,
  observacionDeGuias,
  type LoteConsumido,
} from "@/lib/forestal/bloque-de-lote-consumido";
import { MAX_OBSERVACION_BLOQUE, MAX_TROZAS_POR_BLOQUE } from "@/lib/forestal/cubicacion-reparto";

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
