/**
 * Importación de trozas desde Excel/CSV: columnas Especie · D1 · D2 · Largo
 * en cualquier orden; cada troza se RECUBICA (Smalian), nunca se confía en
 * un volumen que venga en el archivo.
 */
import { describe, expect, it } from "vitest";
import { cubicarTroza } from "@/lib/forestal/cubicacion-trozas";
import { parsearFilasTrozas, type Celda } from "@/lib/forestal/cubicacion-trozas-import";

const H = ["Especie", "D1 (cm)", "D2 (cm)", "Largo (m)"];

describe("parsearFilasTrozas", () => {
  it("lee el formato base y cubica cada fila por Smalian", () => {
    const r = parsearFilasTrozas([H, ["Tornillo", 40, 45, 3]]);
    expect(r.errores).toEqual([]);
    expect(r.trozas).toHaveLength(1);
    const t = r.trozas[0];
    expect(t).toMatchObject({ especie: "Tornillo", d1: 40, d2: 45, largo: 3 });
    expect(t.m3).toBeCloseTo(cubicarTroza(40, 3, 45), 4);
  });

  it("acepta las columnas en cualquier orden", () => {
    const r = parsearFilasTrozas([
      ["Largo (m)", "Especie", "D1 (cm)", "D2 (cm)"],
      [3.5, "Cedro", 30, 32],
    ]);
    expect(r.trozas[0]).toMatchObject({ especie: "Cedro", d1: 30, d2: 32, largo: 3.5 });
  });

  it("sin D2 asume troza pareja (cilindro con D1)", () => {
    const r = parsearFilasTrozas([H, ["Capirona", 40, "", 3]]);
    expect(r.trozas[0].d2).toBe(40);
    expect(r.trozas[0].m3).toBeCloseTo(cubicarTroza(40, 3), 4);
  });

  it("marca sospechosa una medida fuera de lo común, pero la importa igual", () => {
    const r = parsearFilasTrozas([H, ["Tornillo", 40, 45, 30]]); // 30 m de largo no existe
    expect(r.trozas).toHaveLength(1);
    expect(r.trozas[0].sospechosa).toBe(true);
  });

  it("saltea filas vacías sin marcarlas como error", () => {
    const r = parsearFilasTrozas([H, ["Tornillo", 40, 45, 3], [null, null, null, null], ["Cedro", 30, 32, 4]]);
    expect(r.trozas).toHaveLength(2);
    expect(r.errores).toEqual([]);
  });

  it("reporta la fila con medidas inválidas, con su número", () => {
    const r = parsearFilasTrozas([H, ["Tornillo", 40, 45, 3], ["Cedro", "abc", 32, 4], ["Moena", 30, 32, 4]]);
    expect(r.trozas).toHaveLength(2);
    expect(r.errores).toEqual([{ fila: 3, motivo: expect.stringContaining("no es un número") }]);
  });

  it("rechaza D1 o Largo cero o negativos", () => {
    const r = parsearFilasTrozas([H, ["Tornillo", 0, 45, 3]]);
    expect(r.trozas).toHaveLength(0);
    expect(r.errores[0].motivo).toContain("mayores que cero");
  });

  it("sin encabezado reconocible, avisa en vez de adivinar", () => {
    const r = parsearFilasTrozas([["a", "b"], [1, 2]]);
    expect(r.trozas).toEqual([]);
    expect(r.errores[0].motivo).toContain("D1 y Largo");
  });

  it("tolera acentos y mayúsculas en los títulos", () => {
    const filas: Celda[][] = [["ESPÉCIE", "Diámetro menor", "Diámetro mayor", "Longitud"], ["shihuahuaco", 50, 55, 5]];
    const r = parsearFilasTrozas(filas);
    expect(r.errores).toEqual([]);
    expect(r.trozas[0].especie).toBe("Shihuahuaco");
  });
});
