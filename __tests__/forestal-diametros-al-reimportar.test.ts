/**
 * Diámetros de las trozas (20-10, «diámetros de tus trozas»): re-subir el
 * inventario del SNIFFS completa SÓLO las puntas vacías; la distribución
 * (ADR-505) ve el Ø de una troza medida al recibirla o cubicada en Oxapampa;
 * «Copiar a las vacías» de la planilla no pisa nada.
 */
import { describe, expect, it } from "vitest";
import { diametrosParaCompletar, type TrozaYaEnElLibro } from "@/lib/forestal/diametros-al-reimportar";
import { diametroUtilCm, medidaDeTroza } from "@/lib/forestal/medida-cabe-en-troza";
import { trozasDelBloque, type FuentesDeTrozas } from "@/lib/forestal/cuadre-medidas-rolliza";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { copiarALasVacias, deLaGuia, guiasDeLaPlanilla, TODAS_LAS_GUIAS } from "@/components/admin/forestal/ctp-trozas-medir-copiar";
import type { TrozaPatioAPI } from "@/components/admin/forestal/hooks/use-trozas-patio";

const libro = (x: Partial<TrozaYaEnElLibro> & { id: string }): TrozaYaEnElLibro => ({
  codigoPlanta: null, codificacion: null, d1Cm: null, d2Cm: null, largoM: 6, ...x,
});

describe("diametrosParaCompletar (re-subir el inventario)", () => {
  it("llena las dos puntas vacías por Código Planta", () => {
    const r = diametrosParaCompletar(
      [libro({ id: "a", codigoPlanta: "P-01", codificacion: "62B" })],
      [{ codigoPlanta: "p-01 ", codificacion: "otro", d1Cm: 61, d2Cm: 57, largoM: 6.1 }],
    );
    expect(r.completar).toEqual([{ id: "a", d1Cm: 61, d2Cm: 57 }]);
  });

  it("nunca pisa: la punta cargada no viaja y la que tiene las dos cuenta como «ya tenían»", () => {
    const r = diametrosParaCompletar(
      [libro({ id: "a", codificacion: "1", d1Cm: 70 }), libro({ id: "b", codificacion: "2", d1Cm: 50, d2Cm: 48 })],
      [{ codificacion: "1", d1Cm: 99, d2Cm: 66 }, { codificacion: "2", d1Cm: 99, d2Cm: 99 }],
    );
    expect(r.completar).toEqual([{ id: "a", d2Cm: 66 }]);
    expect(r.yaTenian).toBe(1);
  });

  it("otro largo (> 30 cm) no es la misma pieza; código repetido no se adivina", () => {
    const r = diametrosParaCompletar(
      [libro({ id: "a", codificacion: "1", largoM: 6 }), libro({ id: "b", codificacion: "2" }), libro({ id: "c", codificacion: "2" })],
      [{ codificacion: "1", d1Cm: 60, d2Cm: 60, largoM: 4.5 }, { codificacion: "2", d1Cm: 60, d2Cm: 60 }],
    );
    expect(r.completar).toEqual([]);
    expect(r.largoDistinto).toEqual(["1"]);
    expect(r.ambiguas).toEqual(["2"]);
  });

  it("archivo sin diámetros (el de Blas del 19-10) → nada que hacer", () => {
    const r = diametrosParaCompletar([libro({ id: "a", codificacion: "1" })], [{ codificacion: "1", d1Cm: null, d2Cm: null, largoM: 6 }]);
    expect(r).toEqual({ completar: [], yaTenian: 0, ambiguas: [], largoDistinto: [] });
  });

  it("sin código («—») no empareja", () => {
    const r = diametrosParaCompletar([libro({ id: "a", codificacion: "—" })], [{ codificacion: "—", d1Cm: 60, d2Cm: 60 }]);
    expect(r.completar).toEqual([]);
  });
});

describe("medidaDeTroza lee las puntas como el patio", () => {
  it("cubicada en Oxapampa (pulgadas) → Ø en cm para la distribución", () => {
    const m = medidaDeTroza({ largoM: 6, oxD1Pulg: 24, oxD2Pulg: 20 });
    /* Como en el patio: al décimo de cm. */
    expect(m?.d1Cm).toBe(61);
    expect(m?.d2Cm).toBeCloseTo(50.8, 2);
    expect(diametroUtilCm(m!)).toBeCloseTo(50.8, 2);
  });

  it("medida al recibirla; la guía manda si trae las suyas", () => {
    expect(medidaDeTroza({ largoM: 5, recibidaD1Cm: 44, recibidaD2Cm: 40 })).toMatchObject({ d1Cm: 44, d2Cm: 40 });
    expect(medidaDeTroza({ largoM: 5, d1Cm: 50, d2Cm: 46, recibidaD1Cm: 44, recibidaD2Cm: 40 })).toMatchObject({ d1Cm: 50, d2Cm: 46 });
  });

  it("sin nada → null; sólo largo → sin Ø", () => {
    expect(medidaDeTroza({})).toBeNull();
    expect(medidaDeTroza({ largoM: 6 })).toMatchObject({ largoM: 6, d1Cm: null, d2Cm: null });
  });

  it("la troza del libro elegida en la hoja llega al cuadre con su Ø de Oxapampa", () => {
    const f: FuentesDeTrozas = {
      libro: [{ id: "t1", permiso: "PLT-1", especieComun: "Tornillo", largoM: 6, oxD1Pulg: 24, oxD2Pulg: 20 }],
      lotes: new Map(),
      cubicador: [],
    };
    const b: BloqueRolliza = { id: "b", etiqueta: "", especie: "Tornillo", m3: 1, origen: "manual", trozaIds: ["t1"] };
    expect(trozasDelBloque(b, f).trozas[0]?.d2Cm).toBeCloseTo(50.8, 2);
  });
});

describe("«Copiar a las vacías» de la planilla", () => {
  const pieza = (id: string, gtf: string, x: Partial<TrozaPatioAPI> = {}) =>
    ({ id, gtfNumber: gtf, d1Cm: null, d2Cm: null, ...x }) as unknown as TrozaPatioAPI;
  const piezas = [pieza("a", "G1"), pieza("b", "G1", { d1Cm: 70 }), pieza("c", "G2")];

  it("llena sólo las casillas vacías y respeta lo tipeado", () => {
    const r = copiarALasVacias(piezas.filter((t) => deLaGuia(t, "G1")), { a: { d1: "62", d2: "" } }, "60");
    expect(r.valores).toEqual({ a: { d1: "62", d2: "60" }, b: { d1: "", d2: "60" } });
    expect(r.tocadas).toBe(2);
  });

  it("las guías de la planilla, con cuántas piezas", () => {
    expect(guiasDeLaPlanilla(piezas)).toEqual([{ gtf: "G1", n: 2 }, { gtf: "G2", n: 1 }]);
    expect(piezas.filter((t) => deLaGuia(t, TODAS_LAS_GUIAS))).toHaveLength(3);
  });
});
