/**
 * Panel «Lotes» de la Distribución de rolliza (03-10): qué se ofrece y con qué
 * motivo. Lo que escribe es el servidor; acá se prueba que la pantalla no
 * ofrezca lo que el Libro rechazaría (T1, L-A1, ADR-393) y que el bloque
 * recuerde exactamente las trozas de su lote.
 */

import { describe, expect, it } from "vitest";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio, TrozaDelLote } from "@/lib/forestal/lotes-aserrio";
import {
  avisosDelVinculo,
  bloqueDesdeLote,
  especiesLibres,
  lotesParaUsar,
  modoDelSelector,
  motivoDeTroza,
  notasDelPatio,
  opcionesDeTrozas,
  reglaDePermiso,
  trozaIdsLibresDelLote,
  trozaIdsTrasAgregar,
  trozaIdsTrasQuitar,
  trozasLibresDeEspecie,
  vincularBloque,
} from "@/lib/forestal/panel-lotes-reparto";

const PERMISO = "19-SEC/REG-PLT-2021-017";

const pieza = (id: string, m3: number, extra: Partial<TrozaDelLote> = {}): TrozaDelLote => ({
  id, codificacion: id.toUpperCase(), codigoPlanta: null, volumenM3: m3, consumidaEnId: null, ...extra,
});

const lote = (id: string, extra: Partial<LoteAserrio> = {}): LoteAserrio => ({
  id, code: `LA-2026-${id}`, speciesCommon: "Tornillo", speciesScientific: null, status: "abierto", notes: null,
  permiso: PERMISO, fechaApertura: "2026-10-01", fechaConsumo: null, produccionEntryId: null, piezas: 2, volumenM3: 5,
  trozas: [pieza("a", 2), pieza("b", 3)], ...extra,
});

const bloque = (id: string, extra: Partial<BloqueRolliza> = {}): BloqueRolliza => ({
  id, etiqueta: `Bloque ${id}`, especie: "Tornillo", m3: 5, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null, ...extra,
});

const troza = (id: string, extra: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id, woodEntryId: "w1", codificacion: id.toUpperCase(), especieComun: "Tornillo", volumenM3: 1.5,
  permiso: PERMISO, gtfNumber: "019-001-0000011", guiaRecepcionada: true, ...extra,
});

describe("notasDelPatio — por qué el patio propone menos, y dónde se arregla", () => {
  const vacio = { propuestas: [], esperanGuia: { trozas: 0, m3: 0, guias: 0 }, sinEspecie: { trozas: 0, m3: 0 }, sinPermiso: { trozas: 0, m3: 0 } };

  it("ingresos sin permiso (Blas 03-10): lo dice con su m³ y manda a Ingresos", () => {
    const n = notasDelPatio({ ...vacio, sinPermiso: { trozas: 17, m3: 56.916 } });
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("17 trozas libres");
    expect(n[0]).toContain("56.916 m³");
    expect(n[0]).toContain("corrígelo en Ingresos");
  });

  it("guía sin recibir y sin especie, cada una con su arreglo", () => {
    const n = notasDelPatio({ ...vacio, esperanGuia: { trozas: 1, m3: 2, guias: 1 }, sinEspecie: { trozas: 2, m3: 3 } });
    expect(n[0]).toMatch(/1 troza .*espera que recibas su guía en Ingresos \(1 guía\)/);
    expect(n[1]).toContain("sin especie: corrígela en su guía");
  });

  it("patio vacío: una frase, no una lista en blanco", () => {
    expect(notasDelPatio(vacio)).toEqual([expect.stringContaining("No hay trozas libres en el patio")]);
  });
});

describe("el bloque que sale de un lote recuerda sus trozas libres", () => {
  it("sin las consumidas; null si no quedan o si pasan del tope del guardado", () => {
    expect(trozaIdsLibresDelLote(lote("1", { trozas: [pieza("a", 1), pieza("b", 1, { consumidaEnId: "c1" })] }))).toEqual(["a"]);
    expect(trozaIdsLibresDelLote(lote("1", { trozas: [pieza("b", 1, { consumidaEnId: "c1" })] }))).toBeNull();
    const muchas = Array.from({ length: 501 }, (_, i) => pieza(`t${i}`, 1));
    expect(trozaIdsLibresDelLote(lote("1", { trozas: muchas }))).toBeNull();
  });

  it("bloqueDesdeLote: rolliza, origen lote, con loteId y trozaIds", () => {
    const b = bloqueDesdeLote("x", { id: "L1", code: "LA-2026-014", especie: "Tornillo", permiso: PERMISO }, 5.00004, ["a", "b"]);
    expect(b).toMatchObject({ etiqueta: "Lote LA-2026-014", origen: "lote", loteId: "L1", trozaIds: ["a", "b"], tipo: "rolliza", m3: 5, permiso: PERMISO });
  });
});

describe("lotesParaUsar — abiertos con rolliza libre, el más viejo primero", () => {
  it("deja afuera el consumido y el que no tiene libres; marca el que ya está en un bloque", () => {
    const r = lotesParaUsar(
      [
        lote("2", { fechaApertura: "2026-10-02" }),
        lote("1", { fechaApertura: "2026-09-30" }),
        lote("3", { status: "consumido" }),
        lote("4", { trozas: [pieza("z", 1, { consumidaEnId: "c" })] }),
      ],
      [bloque("b1", { loteId: "2", etiqueta: "Guía 11" })],
    );
    expect(r.map((x) => x.lote.id)).toEqual(["1", "2"]);
    expect(r[1]).toMatchObject({ enBloque: "Guía 11", libres: 2, m3: 5, permiso: PERMISO });
  });
});

describe("vincularBloque — un bloque sin lote toma el lote y sus trozas", () => {
  it("bloque a mano: toma loteId y trozas; completa la especie vacía y respeta la escrita", () => {
    const r = vincularBloque(bloque("b1", { especie: "" }), lote("1"), []);
    expect("bloque" in r && r.bloque).toMatchObject({ loteId: "1", trozaIds: ["a", "b"], especie: "Tornillo", permiso: PERMISO });
    const r2 = vincularBloque(bloque("b1", { especie: "Tornillo blanco", permiso: "OTRO" }), lote("1"), []);
    expect("bloque" in r2 && r2.bloque).toMatchObject({ especie: "Tornillo blanco", permiso: "OTRO" });
  });

  it("no vincula aserrada, bloque con lote, lote de otro bloque ni lote consumido", () => {
    expect(vincularBloque(bloque("b1", { tipo: "aserrada" }), lote("1"), [])).toEqual({ motivo: expect.stringContaining("ya aserrada") });
    expect(vincularBloque(bloque("b1", { loteId: "9" }), lote("1"), [])).toEqual({ motivo: "Ya tiene lote." });
    expect(vincularBloque(bloque("b1"), lote("1"), [bloque("b2", { loteId: "1", etiqueta: "Guía 7" })])).toEqual({
      motivo: expect.stringContaining("ya está en el bloque «Guía 7»"),
    });
    expect(vincularBloque(bloque("b1"), lote("1", { status: "consumido" }), [])).toEqual({ motivo: expect.stringContaining("consumido") });
  });

  it("avisa especie, permiso y m³ distintos (tolerancia de la GTF) y el cambio de trozas", () => {
    expect(avisosDelVinculo(bloque("b1", { m3: 5.0004 }), lote("1"))).toEqual([]);
    const a = avisosDelVinculo(bloque("b1", { especie: "Cumala", permiso: "OTRO", m3: 10, trozaIds: ["q"] }), lote("1"));
    expect(a).toHaveLength(4);
    expect(a[0]).toContain("Cumala");
    expect(a[2]).toContain("5.000 m³");
    expect(a[3]).toBe("Sus trozas pasan a ser las del lote.");
  });
});

describe("selector de trozas — lo que se ofrece es lo que el Libro acepta", () => {
  it("modo: crear sin lote, agregar con lote abierto, nada con lote consumido o borrado", () => {
    const lotes = [lote("1"), lote("2", { status: "consumido" })];
    expect(modoDelSelector(bloque("b"), lotes, true)).toEqual({ modo: "crear" });
    expect(modoDelSelector(bloque("b", { loteId: "1" }), lotes, true)).toMatchObject({ modo: "agregar" });
    expect(modoDelSelector(bloque("b", { loteId: "2" }), lotes, true)).toEqual({ modo: "no", motivo: expect.stringContaining("consumido") });
    expect(modoDelSelector(bloque("b", { loteId: "x" }), lotes, true)).toEqual({ modo: "no", motivo: expect.stringContaining("¿se borró?") });
    expect(modoDelSelector(bloque("b", { loteId: "x" }), lotes, false)).toEqual({ modo: "no", motivo: expect.stringContaining("Cargando") });
    expect(modoDelSelector(bloque("b", { tipo: "aserrada" }), lotes, true).modo).toBe("no");
  });

  it("sólo libres de la especie (sin importar mayúsculas): fuera las de un lote, consumidas, sin recibir u otra especie", () => {
    const patio = [
      troza("ok"),
      troza("may", { especieComun: "TORNILLO" }),
      troza("enlote", { loteAserrioId: "L9", loteAserrioCode: "LA-9" }),
      troza("consumida", { consumidaEnId: "c1" }),
      troza("sinrecibir", { guiaRecepcionada: false }),
      troza("otra", { especieComun: "Cumala" }),
    ];
    expect(trozasLibresDeEspecie(patio, "Tornillo").map((t) => t.id)).toEqual(["ok", "may"]);
    expect(trozasLibresDeEspecie(patio, "")).toEqual([]);
    expect(especiesLibres(patio)).toEqual(["Cumala", "Tornillo"]);
  });

  it("lote nuevo exige permiso (ADR-464); lote con permiso exige el suyo; lote viejo «de todos» no exige", () => {
    const sinPermiso = troza("s", { permiso: null });
    const otro = troza("o", { permiso: "OTRO" });
    const crear = reglaDePermiso({ modo: "crear" }, PERMISO);
    expect(motivoDeTroza(sinPermiso, crear)).toContain("corrígelo en Ingresos (guía 019-001-0000011)");
    expect(motivoDeTroza(otro, crear)).toBe(`Es del permiso OTRO, no del ${PERMISO}`);
    expect(motivoDeTroza(troza("p"), crear)).toBeNull();
    const conPermiso = reglaDePermiso({ modo: "agregar", lote: lote("1") }, null);
    expect(conPermiso).toEqual({ permiso: PERMISO, exige: true });
    const deTodos = reglaDePermiso({ modo: "agregar", lote: lote("1", { permiso: null }) }, null);
    expect(deTodos.exige).toBe(false);
    expect(motivoDeTroza(sinPermiso, deTodos)).toBeNull();
  });

  it("opciones: busca por código o guía; las elegibles primero", () => {
    const trozas = [troza("t2", { permiso: null }), troza("t10"), troza("t1", { gtfNumber: "019-XYZ" })];
    const regla = { permiso: PERMISO, exige: true };
    expect(opcionesDeTrozas(trozas, regla, "").map((o) => o.id)).toEqual(["t1", "t10", "t2"]);
    expect(opcionesDeTrozas(trozas, regla, "xyz").map((o) => o.id)).toEqual(["t1"]);
    expect(opcionesDeTrozas(trozas, regla, "")[2]!.motivo).toContain("no tiene permiso");
  });

  it("tras agregar/quitar, el bloque recuerda las trozas del lote", () => {
    expect(trozaIdsTrasAgregar({ trozaIds: null }, lote("1"), ["c"])).toEqual(["a", "b", "c"]);
    expect(trozaIdsTrasAgregar({ trozaIds: ["a"] }, lote("1"), ["c", "a"])).toEqual(["a", "c"]);
    expect(trozaIdsTrasQuitar({ trozaIds: ["a", "b"] }, lote("1"), "a")).toEqual(["b"]);
    expect(trozaIdsTrasQuitar({ trozaIds: ["a"] }, lote("1"), "a")).toBeNull();
  });
});
