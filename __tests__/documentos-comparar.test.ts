/**
 * Comparar dos versiones de un documento (lib pura).
 *
 * Lo que tiene que contestar: "¿qué se tocó?". Y sobre todo lo que NO tiene que
 * hacer: marcar la planilla entera como cambiada porque alguien insertó una
 * fila arriba, o el documento entero porque se agregó un párrafo al principio.
 */

import { describe, it, expect } from "vitest";
import { compararLibros, compararTextos, resumenTexto } from "@/lib/documentos/comparar";
import type { CeldaHoja, HojaFormato } from "@/lib/documentos/xlsx-formato";

function hoja(nombre: string, filas: string[][]): HojaFormato {
  const cols = Math.max(1, ...filas.map((f) => f.length));
  return {
    nombre,
    filas: filas.map((f) => Array.from({ length: cols }, (_, i): CeldaHoja => ({ texto: f[i] ?? "", crudo: f[i] ?? "" }))),
    anchos: new Array(cols).fill(64),
    altos: new Array(filas.length).fill(20),
    columnasOcultas: new Array(cols).fill(false),
    filasOcultas: new Array(filas.length).fill(false),
    congelado: { filas: 0, columnas: 0 },
    tieneFormulas: false,
    oculta: false,
  };
}

describe("compararLibros", () => {
  it("marca la celda que cambió con su dirección de Excel", () => {
    const a = [hoja("Precios", [["Producto", "Precio"], ["Arroz", "24.90"], ["Aceite", "11.50"]])];
    const b = [hoja("Precios", [["Producto", "Precio"], ["Arroz", "26.50"], ["Aceite", "11.50"]])];
    const d = compararLibros(a, b);
    expect(d.total).toBe(1);
    expect(d.hojas[0].estado).toBe("cambiada");
    expect(d.hojas[0].cambios).toEqual([
      { ref: "B2", fila: 1, columna: 1, antes: "24.90", despues: "26.50" },
    ]);
  });

  it("dos versiones idénticas no tienen cambios", () => {
    const a = [hoja("H", [["a", "b"], ["1", "2"]])];
    const d = compararLibros(a, [hoja("H", [["a", "b"], ["1", "2"]])]);
    expect(d.total).toBe(0);
    expect(d.hojas[0].estado).toBe("igual");
  });

  it("cuenta las filas agregadas sin inventar cambios de celda", () => {
    const a = [hoja("H", [["Producto"], ["Arroz"]])];
    const b = [hoja("H", [["Producto"], ["Arroz"], ["Azúcar"]])];
    const d = compararLibros(a, b);
    expect(d.hojas[0].filasAgregadas).toBe(1);
    expect(d.hojas[0].cambios).toHaveLength(0);
  });

  it("detecta una hoja nueva y una borrada", () => {
    const d = compararLibros([hoja("Vieja", [["x"]])], [hoja("Nueva", [["y"]])]);
    const estados = Object.fromEntries(d.hojas.map((h) => [h.nombre, h.estado]));
    expect(estados).toEqual({ Vieja: "quitada", Nueva: "agregada" });
  });

  it("recorta la lista pero informa cuántos quedaron afuera", () => {
    const filasA = Array.from({ length: 300 }, (_, i) => [String(i)]);
    const filasB = Array.from({ length: 300 }, (_, i) => [String(i + 1000)]);
    const d = compararLibros([hoja("H", filasA)], [hoja("H", filasB)]);
    expect(d.hojas[0].cambios).toHaveLength(200);
    expect(d.hojas[0].recortados).toBe(100);
    expect(d.total).toBe(300);
  });
});

describe("compararTextos", () => {
  it("un párrafo insertado al principio NO marca todo como cambiado", () => {
    const antes = ["Primera cláusula", "Segunda cláusula", "Tercera cláusula"];
    const despues = ["Encabezado nuevo", "Primera cláusula", "Segunda cláusula", "Tercera cláusula"];
    const r = resumenTexto(compararTextos(antes, despues));
    expect(r).toEqual({ agregadas: 1, quitadas: 0, iguales: 3 });
  });

  it("un párrafo editado sale como uno quitado y uno agregado", () => {
    const d = compararTextos(["alquiler S/ 1500", "garantía S/ 3000"], ["alquiler S/ 1800", "garantía S/ 3000"]);
    expect(d.filter((l) => l.tipo === "quitada").map((l) => l.texto)).toEqual(["alquiler S/ 1500"]);
    expect(d.filter((l) => l.tipo === "agregada").map((l) => l.texto)).toEqual(["alquiler S/ 1800"]);
    expect(d.filter((l) => l.tipo === "igual")).toHaveLength(1);
  });

  it("documentos iguales no muestran cambios", () => {
    const r = resumenTexto(compararTextos(["a", "b"], ["a", "b"]));
    expect(r).toEqual({ agregadas: 0, quitadas: 0, iguales: 2 });
  });

  it("mantiene el orden de lectura del documento nuevo", () => {
    const d = compararTextos(["uno", "dos"], ["uno", "extra", "dos"]);
    expect(d.map((l) => l.texto)).toEqual(["uno", "extra", "dos"]);
  });
});
