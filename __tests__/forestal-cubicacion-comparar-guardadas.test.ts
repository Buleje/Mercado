/**
 * Comparar dos guardadas desde la sección «Guardadas» (Brandon 24-10): con cuál
 * se compara por defecto y el cuadro que se baja a Excel.
 *
 * Lo que se protege: B por defecto es la más reciente de la MISMA especie (no
 * la de otra especie aunque sea más nueva) y nunca la propia A; el CSV trae el
 * total y dice quién es A y quién B (sin eso, el archivo suelto no se entiende).
 */
import { describe, expect, it } from "vitest";
import { construirRegistro, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { diferenciasACsv, diferenciasPor, especiesDeCubicacion, ordenRecientes, parejaPorDefecto, totalesComparados } from "@/lib/forestal/cubicacion-diferencias";

const pz = (id: string, cantidad: number, largo: number, especie?: string) => ({
  id, cantidad, espesor: 2, ancho: 8, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie,
});

const guardada = (id: string, fecha: string, especie: string, updatedAt = `${fecha}T10:00:00.000Z`): CubicacionRegistro => ({
  ...construirRegistro({ nombre: `Lote ${id}`, fecha, precioPt: 3, piezas: [pz(`${id}-1`, 2, 10, especie)] }),
  id,
  updatedAt,
});

describe("parejaPorDefecto · con cuál comparar si nadie eligió", () => {
  const a = guardada("a", "2026-10-20", "Tornillo");
  const cedroNueva = guardada("c", "2026-10-23", "Cedro");
  const tornilloVieja = guardada("t1", "2026-10-10", "Tornillo");
  const tornilloNueva = guardada("t2", "2026-10-18", "Tornillo");

  it("la más reciente de la misma especie, aunque haya otra especie más nueva", () => {
    expect(parejaPorDefecto([a, cedroNueva, tornilloVieja, tornilloNueva], a)?.id).toBe("t2");
  });

  it("si ninguna comparte especie, la más reciente; nunca la misma", () => {
    expect(parejaPorDefecto([a, cedroNueva, guardada("s", "2026-10-01", "Shihuahuaco")], a)?.id).toBe("c");
    expect(parejaPorDefecto([a], a)).toBeNull();
  });

  it("el mismo día manda la última tocada", () => {
    const x = guardada("x", "2026-10-18", "Tornillo", "2026-10-18T08:00:00.000Z");
    const y = guardada("y", "2026-10-18", "Tornillo", "2026-10-18T15:00:00.000Z");
    expect(ordenRecientes([x, y]).map((c) => c.id)).toEqual(["y", "x"]);
  });

  it("sin especie en las piezas usa la del lote", () => {
    const sin = { ...construirRegistro({ nombre: "s", fecha: "2026-10-01", precioPt: 0, especie: "Capirona", piezas: [pz("s1", 1, 8)] }), id: "s" };
    expect(especiesDeCubicacion(sin)).toEqual(["Capirona"]);
  });
});

describe("diferenciasACsv · el cuadro para Excel", () => {
  const a = { ...construirRegistro({ nombre: "Lunes", fecha: "2026-10-20", precioPt: 3, piezas: [pz("1", 2, 10, "Tornillo")] }), id: "a" };
  const b = { ...construirRegistro({ nombre: "Martes", fecha: "2026-10-21", precioPt: 3, piezas: [pz("1", 2, 10, "Tornillo"), pz("2", 1, 8, "Cedro")] }), id: "b" };
  const d = diferenciasPor(a, b, "especie");

  it("separado por ; con BOM, una fila por grupo, el total y quién es A y B", () => {
    const csv = diferenciasACsv(d, "Especie", "Lunes", "Martes");
    expect(csv.startsWith("﻿Especie;Piezas A;Piezas B;Dif. piezas")).toBe(true);
    const lineas = csv.replace("﻿", "").split("\n");
    expect(lineas.find((l) => l.startsWith("Cedro;"))).toMatch(/^Cedro;0;1;1;.*;Sólo en B$/);
    expect(lineas.find((l) => l.startsWith("TOTAL;"))).toMatch(/^TOTAL;2;3;1;/);
    expect(lineas.slice(-2)).toEqual(["A;Lunes", "B;Martes"]);
  });

  it("con tabuladores para pegar, sin BOM", () => {
    const tsv = diferenciasACsv(d, "Especie", "Lunes", "Martes", "\t");
    expect(tsv.startsWith("Especie\tPiezas A")).toBe(true);
    expect(tsv).not.toContain(";");
  });
});

describe("totalesComparados · el cuadro de arriba es el dato guardado", () => {
  const conTotales = (pt: number, piezas: number, valor: number) =>
    ({ totales: { piezas, pieTablar: pt, m3: 0 }, valor }) as Pick<CubicacionRegistro, "totales" | "valor">;

  it("m³ = PT ÷ 424 de cada una (lo del cubicador), y la diferencia es la resta de lo que se ve", () => {
    const t = totalesComparados(conTotales(966.66, 90, 386.66), conTotales(253.33, 19, 100));
    expect(t.m3A).toBe(2.28);
    expect(t.m3B).toBe(0.598);
    expect(t.deltaM3).toBe(-1.682);
    expect(t.deltaPt).toBe(-713.33);
    expect(t.deltaPiezas).toBe(-71);
    expect(t.deltaValor).toBe(-286.66);
  });

  it("si una se guardó sin precio, sus soles y la diferencia son null", () => {
    const t = totalesComparados(conTotales(100, 5, 300), conTotales(80, 4, 0));
    expect(t.valorA).toBe(300);
    expect(t.valorB).toBeNull();
    expect(t.deltaValor).toBeNull();
  });
});
