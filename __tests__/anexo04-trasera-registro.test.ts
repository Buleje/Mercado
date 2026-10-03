/**
 * La trasera guardada con el emitido (Brandon, 2026-10-03: «el anexo que
 * bajas desde el historial sale sin el croquis»). El schema del registro, lo
 * que se guarda (lo justo), cómo se rehidrata para el PDF y qué trasera queda
 * al volver a guardar el mismo N° + GTF.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  construirEmision, traseraDelEmitido, traseraParaGuardar, traseraQueSigue,
  type EntradaEmision,
} from "@/lib/forestal/anexo04-registro";
import { MAX_FILAS_TRASERA, traseraDelBody, traseraRegistroSchema } from "@/lib/forestal/anexo04-trasera-schema";

function pieza(id: string, cantidad: number, espesor: number, ancho: number, largo: number, especie?: string): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id, ...dims, especie, ...cubicarPieza(dims), dueno: "Blas", codigo: "T-12", observacion: "nota interna" };
}

const PIEZAS = [pieza("a", 40, 2, 8, 10, "Tornillo"), pieza("b", 12, 1, 6, 10, "Cumala")];
const DATOS: EntradaEmision["datos"] = {
  numero: "12", gtf: "0012345", empresa: "X", firmante: "Y", documento: "1", cargo: "Z", observaciones: "", unidadV: "pt", modo: "oficial",
};

describe("traseraRegistroSchema", () => {
  it("acepta la trasera mínima y pone pulgadas/pies por omisión", () => {
    const r = traseraRegistroSchema.safeParse({ anchoM: 2.4, piezas: [{ cantidad: 3, espesor: 2, ancho: 8, largo: 10 }] });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const t = traseraDelBody(r.data);
    expect(t.piezas[0]).toMatchObject({ id: "t-0", uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" });
    expect(t.catalogo).toBeUndefined();
  });

  it("rechaza ancho fuera del camión, filas de más, medidas imposibles y catálogo enorme", () => {
    const fila = { cantidad: 1, espesor: 2, ancho: 8, largo: 10 };
    expect(traseraRegistroSchema.safeParse({ anchoM: 0.2, piezas: [fila] }).success).toBe(false);
    expect(traseraRegistroSchema.safeParse({ anchoM: 9, piezas: [fila] }).success).toBe(false);
    expect(traseraRegistroSchema.safeParse({ anchoM: 2.4, piezas: [] }).success).toBe(false);
    expect(traseraRegistroSchema.safeParse({ anchoM: 2.4, piezas: Array.from({ length: MAX_FILAS_TRASERA + 1 }, () => fila) }).success).toBe(false);
    expect(traseraRegistroSchema.safeParse({ anchoM: 2.4, piezas: [{ ...fila, cantidad: -1 }] }).success).toBe(false);
    expect(traseraRegistroSchema.safeParse({ anchoM: 2.4, piezas: [{ ...fila, uLargo: "yardas" }] }).success).toBe(false);
    expect(traseraRegistroSchema.safeParse({ anchoM: 2.4, piezas: [fila], catalogo: Array.from({ length: 61 }, (_, i) => `E${i}`) }).success).toBe(false);
  });
});

describe("traseraParaGuardar / traseraDelEmitido", () => {
  it("guarda lo justo (sin dueño, código, nota ni volumen) y lo rehidrata con el mismo m³", () => {
    const g = traseraParaGuardar({ piezas: PIEZAS, anchoM: 2.4, catalogo: ["Tornillo", "Cumala"] })!;
    expect(Object.keys(g.piezas[0]).sort()).toEqual(["ancho", "cantidad", "especie", "espesor", "id", "largo", "uAncho", "uEspesor", "uLargo"]);
    const r = traseraDelEmitido({ trasera: g })!;
    expect(r.anchoM).toBe(2.4);
    expect(r.catalogo).toEqual(["Tornillo", "Cumala"]);
    expect(r.piezas.map((p) => p.m3)).toEqual(PIEZAS.map((p) => p.m3));
    expect(r.piezas.map((p) => p.pieTablar)).toEqual(PIEZAS.map((p) => p.pieTablar));
  });

  it("sin trasera (emitidos viejos) → null: el PDF sale como siempre", () => {
    expect(traseraParaGuardar(null)).toBeNull();
    expect(traseraParaGuardar({ piezas: [], anchoM: 2.4 })).toBeNull();
    expect(traseraDelEmitido({})).toBeNull();
    expect(traseraDelEmitido({ trasera: null })).toBeNull();
  });
});

describe("construirEmision + traseraQueSigue", () => {
  const trasera = traseraParaGuardar({ piezas: PIEZAS, anchoM: 2.4 })!;

  it("el emitido guarda su trasera; sin trasera no aparece el campo", () => {
    expect(construirEmision({ datos: DATOS, piezas: PIEZAS, trasera }).trasera).toEqual(trasera);
    expect("trasera" in construirEmision({ datos: DATOS, piezas: PIEZAS })).toBe(false);
  });

  it("re-guardar el mismo N° + GTF: la nueva manda; sin nueva, sigue la vieja sólo si las piezas no cambiaron", () => {
    const existente = construirEmision({ datos: DATOS, piezas: PIEZAS, trasera });
    const otra = traseraParaGuardar({ piezas: [PIEZAS[0]], anchoM: 3 })!;
    expect(traseraQueSigue(existente, { piezas: PIEZAS, trasera: otra })).toEqual(otra);
    expect(traseraQueSigue(existente, { piezas: PIEZAS.map((p) => ({ ...p })) })).toEqual(trasera);
    /* Corrigió una medida y no mandó trasera: el croquis viejo no es de este papel. */
    expect(traseraQueSigue(existente, { piezas: [{ ...PIEZAS[0], largo: 12 }, PIEZAS[1]] })).toBeNull();
    expect(traseraQueSigue(null, { piezas: PIEZAS })).toBeNull();
  });
});
