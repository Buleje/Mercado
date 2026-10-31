/**
 * «Resaltar Variado» del Anexo 04 (Brandon, 2026-10-03): qué renglones vienen
 * de Varios, cuáles mezclan con madera propia, y que la marca NO mueve ningún
 * volumen ni la agrupación oficial.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { VARIADO_DEFAULT, agruparPiezasIguales, desglosarVariado } from "@/lib/forestal/variado-desglose";
import { construirAnexo04 } from "@/lib/forestal/anexo04-serfor";
import { formatoCantidad } from "@/lib/forestal/anexo04-vista";
import { origenVariadoPorFila, resumenVariadoAnexo, textoOrigenVariado } from "@/lib/forestal/anexo04-variado";

const pieza = (id: string, cantidad: number, espesor: number, ancho: number, especie?: string, largo = 10): PiezaCubicada => {
  const base = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id, ...base, ...(especie ? { especie } : {}), ...cubicarPieza(base) };
};
const bloque = (id: string, especie: string, m3: number): BloqueRolliza => ({
  id, etiqueta: id, especie, m3, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null,
});
const bloques = [bloque("b1", "Tornillo", 3), bloque("b2", "Cumala", 2)];
const sinMarca = (p: PiezaCubicada): PiezaCubicada => { const { variadoPiezas: _v, ...resto } = p; return resto; };
const sumar = (f: readonly PiezaCubicada[], k: "cantidad" | "pieTablar" | "m3") => f.reduce((a, p) => a + p[k], 0);
const marcadas = (f: readonly PiezaCubicada[]) => f.reduce((a, p) => a + (p.variadoPiezas ?? 0), 0);

/* 15 paquetes 6×6 de 10′ abiertos entre Tornillo y Cumala + madera propia. */
const variado = Array.from({ length: 15 }, (_, i) => pieza(`v${i}`, 1, 6, 6, "Variado"));
const propia = [pieza("a", 3, 2, 4, "Tornillo"), pieza("z", 2, 1, 6, "Cumala")];
const lote = [...propia, ...variado];
const des = desglosarVariado(lote, bloques, VARIADO_DEFAULT);
const abiertas = agruparPiezasIguales(des.piezas);

describe("la marca del Variado en las piezas", () => {
  it("sólo las piezas abiertas del Variado la llevan, y cuenta sus piezas", () => {
    const delVariado = des.piezas.filter((p) => p.variadoPiezas);
    expect(delVariado.length).toBeGreaterThan(0);
    expect(delVariado.every((p) => p.variadoPiezas === p.cantidad)).toBe(true);
    expect(des.piezas.filter((p) => p.id === "a" || p.id === "z").every((p) => !p.variadoPiezas)).toBe(true);
  });

  it("agruparPiezasIguales y unificarPorMedida la suman sin mover volumen", () => {
    const g = agruparPiezasIguales(des.piezas);
    expect(sumar(g, "cantidad")).toBe(sumar(des.piezas, "cantidad"));
    expect(marcadas(g)).toBe(marcadas(des.piezas));
    const u = unificarPorMedida(des.piezas.map((p) => ({ ...p })));
    expect(marcadas(u)).toBe(marcadas(des.piezas));
    expect(sumar(u, "m3")).toBeCloseTo(sumar(des.piezas, "m3"), 3);
  });

  it("el formato Sumada conserva la marca y Una por pieza la reparte", () => {
    for (const f of ["sumada", "unidad"] as const) {
      const r = formatoCantidad(abiertas, f, "Tornillo");
      expect(marcadas(r)).toBe(marcadas(abiertas));
      expect(sumar(r, "cantidad")).toBe(sumar(abiertas, "cantidad"));
    }
  });
});

describe("origenVariadoPorFila", () => {
  it("con la marca en la fila, el conteo es exacto", () => {
    const filas = [pieza("p", 5, 2, 4, "Tornillo"), { ...pieza("q", 4, 2, 6, "Cumala"), variadoPiezas: 4 }, { ...pieza("r", 10, 2, 8, "Cumala"), variadoPiezas: 6 }];
    const o = origenVariadoPorFila(filas, []);
    expect(o.has("p")).toBe(false);
    expect(o.get("q")).toMatchObject({ variado: 4, propias: 0, exacto: true, mixta: false });
    expect(o.get("r")).toMatchObject({ variado: 6, propias: 4, exacto: true, mixta: true });
    expect(textoOrigenVariado(o.get("r")!)).toContain("6 piezas vienen de Varios y 4 piezas son madera propia");
  });

  it("sin marca en la fila (la perdió el reparto) se reconoce por especie y medida contra el lote", () => {
    const solo = origenVariadoPorFila([pieza("x", 3, 2, 4, "Tornillo")], [{ ...pieza("v", 3, 2, 4, "Tornillo"), variadoPiezas: 3 }]);
    expect(solo.get("x")).toMatchObject({ variado: 3, propias: 0, mixta: false });
    const mezcla = origenVariadoPorFila(
      [pieza("x", 5, 2, 4, "Tornillo")],
      [{ ...pieza("v", 3, 2, 4, "Tornillo"), variadoPiezas: 3 }, pieza("a", 2, 2, 4, "Tornillo")],
    );
    expect(mezcla.get("x")).toMatchObject({ variado: 3, propias: 2, exacto: false, mixta: true });
    expect(textoOrigenVariado(mezcla.get("x")!)).toContain("en todo el lote");
    // otra especie con la misma medida no se marca
    expect(origenVariadoPorFila([pieza("y", 3, 2, 4, "Cumala")], [{ ...pieza("v", 3, 2, 4, "Tornillo"), variadoPiezas: 3 }]).size).toBe(0);
  });

  it("sobre el lote real: hay renglones del Variado y el anexo oficial no cambia con la marca", () => {
    /* El motor del reparto no arrastra la marca: las filas llegan sin ella. */
    const filasPapel = unificarPorMedida([...propia, ...abiertas].map((p) => ({ ...sinMarca(p) })));
    const origen = origenVariadoPorFila(filasPapel, [...propia, ...abiertas]);
    expect(resumenVariadoAnexo(origen).medidas).toBeGreaterThan(0);
    expect([...origen.values()].reduce((a, o) => a + o.variado, 0)).toBeGreaterThan(0);

    const datos = { unidadV: "m3", modo: "oficial" } as const;
    const con = construirAnexo04([...propia, ...abiertas], datos, {});
    const sin = construirAnexo04([...propia, ...abiertas].map(sinMarca), datos, {});
    expect(con.totalM3).toBe(sin.totalM3);
    expect(con.totalPt).toBe(sin.totalPt);
    expect(con.totalPiezas).toBe(sin.totalPiezas);
    expect(JSON.stringify(con.hojas)).toBe(JSON.stringify(sin.hojas));
  });
});
