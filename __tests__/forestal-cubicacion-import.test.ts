/**
 * Importación de piezas desde Excel/CSV: el operario arma su archivo como le
 * sale y el parser se adapta; lo que no puede leer lo reporta, no lo inventa.
 */
import { describe, expect, it } from "vitest";
import { parsearFilasImportadas, type Celda } from "@/lib/forestal/cubicacion-import";

const H = ["Especie", "Espesor", "Ancho", "Largo", "Cantidad"];

describe("parsearFilasImportadas", () => {
  it("lee el formato base y cubica cada fila", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 8, 10, 5]]);
    expect(r.errores).toEqual([]);
    expect(r.piezas).toHaveLength(1);
    const p = r.piezas[0];
    expect(p).toMatchObject({ especie: "Tornillo", espesor: 2, ancho: 8, largo: 10, cantidad: 5 });
    expect(p.pieTablar).toBeCloseTo(66.67, 1); // 2*8*10/12 * 5
  });

  it("acepta las columnas en cualquier orden", () => {
    const r = parsearFilasImportadas([
      ["Largo", "Especie", "Cantidad", "Espesor", "Ancho"],
      [10, "Cedro", 2, 2, 6],
    ]);
    expect(r.piezas[0]).toMatchObject({ especie: "Cedro", espesor: 2, ancho: 6, largo: 10, cantidad: 2 });
  });

  it("tolera acentos, mayúsculas y sinónimos en los títulos", () => {
    const r = parsearFilasImportadas([
      ["ESPÉCIE", "GROSOR", "anchura", "Longitud"],
      ["shihuahuaco", 3, 10, 8],
    ]);
    expect(r.errores).toEqual([]);
    expect(r.piezas[0]).toMatchObject({ especie: "Shihuahuaco", espesor: 3, ancho: 10, largo: 8, cantidad: 1 });
  });

  it("sin columna Cantidad asume 1 por fila", () => {
    const r = parsearFilasImportadas([["Especie", "Espesor", "Ancho", "Largo"], ["Cumala", 2, 8, 10]]);
    expect(r.piezas[0].cantidad).toBe(1);
  });

  it("saltea filas vacías sin marcarlas como error", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 8, 10, 1], [null, null, null, null, null], ["Cedro", 2, 6, 8, 1]]);
    expect(r.piezas).toHaveLength(2);
    expect(r.errores).toEqual([]);
  });

  it("reporta la fila con medidas inválidas, con su número", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 8, 10, 1], ["Cedro", "abc", 6, 8, 1], ["Moena", 2, 6, 8, 1]]);
    expect(r.piezas).toHaveLength(2);
    expect(r.errores).toEqual([{ fila: 3, motivo: expect.stringContaining("no es un número") }]);
  });

  it("rechaza medidas cero o negativas", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 0, 10, 1]]);
    expect(r.piezas).toHaveLength(0);
    expect(r.errores[0].motivo).toContain("mayores que cero");
  });

  it("interpreta números en formato peruano y fracciones", () => {
    const r = parsearFilasImportadas([H, ["Bolaina", "1,5", "2 1/2", "3.5", "2"]]);
    expect(r.piezas[0]).toMatchObject({ espesor: 1.5, ancho: 2.5, largo: 3.5 });
  });

  it("respeta columnas de unidad si vienen", () => {
    const r = parsearFilasImportadas([
      ["Especie", "Espesor", "u.Esp", "Ancho", "u.Anc", "Largo", "u.Lar"],
      ["Catahua", 5, "cm", 20, "cm", 3, "m"],
    ]);
    expect(r.piezas[0]).toMatchObject({ uEspesor: "cm", uAncho: "cm", uLargo: "m" });
  });

  it("marca medidas raras pero las importa igual", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 8, 1, 1]]); // largo de 1 pie
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0].sospechosa).toBe(true);
  });

  it("sin encabezado reconocible avisa qué falta", () => {
    const r = parsearFilasImportadas([["hola", "mundo"], [1, 2]]);
    expect(r.piezas).toHaveLength(0);
    expect(r.errores[0].motivo).toContain("Especie, Espesor, Ancho y Largo");
  });

  it("con encabezado pero sin una columna obligatoria lo dice", () => {
    const r = parsearFilasImportadas([["Especie", "Espesor", "Ancho"], ["Cedro", 2, 6]]);
    expect(r.errores[0].motivo).toContain("Faltan columnas");
    expect(r.errores[0].motivo).toContain("largo");
  });

  it("una especie desconocida se respeta tal cual", () => {
    const r = parsearFilasImportadas([H, ["Pino radiata", 2, 8, 10, 1]]);
    expect(r.piezas[0].especie).toBe("Pino radiata");
  });

  it("encuentra el encabezado aunque haya filas de título arriba", () => {
    const r = parsearFilasImportadas([
      ["ASERRADERO SAN MARTÍN", null, null, null],
      ["Lote del 20 de julio", null, null, null],
      H,
      ["Tornillo", 2, 8, 10, 4],
    ]);
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0].filaOrigen).toBe(4);
  });
});
