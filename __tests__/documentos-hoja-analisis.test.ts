/**
 * Mirar, ordenar y filtrar: lo que se hace con un catálogo apenas pasa de
 * veinte filas.
 *
 * El riesgo acá es sutil: un orden que trata "S/ 1,250.00" como texto pone el
 * 1,250 antes que el 640, y el usuario toma decisiones de precio sobre una
 * lista mal ordenada sin darse cuenta.
 */
import { describe, expect, it } from "vitest";
import type { CeldaHoja } from "@/lib/documentos/xlsx-formato";
import {
  comoNumeroVisible, filasOcultasPorFiltro, ordenDeFilas, resumir, valoresDeColumna,
} from "@/lib/documentos/hoja-analisis";

/** Atajo para armar celdas: `c("Arroz")` o `c("S/ 1,250.00", "1250")`. */
const c = (texto: string, crudo?: string): CeldaHoja => ({ texto, crudo: crudo ?? texto });

const catalogo: CeldaHoja[][] = [
  [c("Especie"), c("Precio"), c("Piezas"), c("Destino")],
  [c("Tornillo"), c("S/ 1,250.00", "1250"), c("120"), c("Pucallpa")],
  [c("Bolaina"), c("S/ 640.00", "640"), c("310"), c("Pucallpa")],
  [c("Shihuahuaco"), c("S/ 2,380.00", "2380"), c("42"), c("Callao")],
  [c("Ñandubay"), c("", ""), c("88"), c("Callao")],
];

const rangoDatos = { filaIni: 1, filaFin: 4, colIni: 0, colFin: 3 };

describe("leer un número como lo ve el usuario", () => {
  it("le saca el símbolo de moneda y los miles", () => {
    expect(comoNumeroVisible(c("S/ 1,250.00", "1250"))).toBe(1250);
    expect(comoNumeroVisible(c("$1,000"))).toBe(1000);
  });

  it("el texto que no es número no cuenta", () => {
    expect(comoNumeroVisible(c("Tornillo"))).toBeNull();
    expect(comoNumeroVisible(c(""))).toBeNull();
  });

  it("los negativos y decimales salen bien", () => {
    expect(comoNumeroVisible(c("-45.32"))).toBe(-45.32);
  });

  it("toma el resultado mostrado cuando la celda es una fórmula", () => {
    expect(comoNumeroVisible({ texto: "S/ 56,650.00", crudo: "", formula: "D3*E3" })).toBe(56650);
  });
});

describe("resumen de la selección", () => {
  it("suma, promedio, mínimo y máximo de una columna de precios", () => {
    const r = resumir(catalogo, { filaIni: 1, filaFin: 4, colIni: 1, colFin: 1 });
    expect(r.suma).toBe(4270);
    expect(r.numericas).toBe(3);      // la celda vacía no cuenta
    expect(r.promedio).toBeCloseTo(1423.33, 1);
    expect(r.minimo).toBe(640);
    expect(r.maximo).toBe(2380);
  });

  it("cuenta las celdas y cuántas tienen datos", () => {
    const r = resumir(catalogo, rangoDatos);
    expect(r.celdas).toBe(16);
    expect(r.conDatos).toBe(15);      // una está vacía
  });

  it("una selección de puro texto no inventa una suma", () => {
    const r = resumir(catalogo, { filaIni: 1, filaFin: 4, colIni: 0, colFin: 0 });
    expect(r.numericas).toBe(0);
    expect(r.suma).toBe(0);
    expect(r.promedio).toBe(0);
  });
});

describe("ordenar", () => {
  it("EL CASO QUE IMPORTA: los precios se ordenan como números, no como texto", () => {
    // Como texto, "S/ 1,250.00" iría antes que "S/ 640.00" y la lista mentiría.
    const orden = ordenDeFilas(catalogo, rangoDatos, 1, "asc");
    const precios = orden.map((f) => catalogo[f][1].texto);
    expect(precios.slice(0, 3)).toEqual(["S/ 640.00", "S/ 1,250.00", "S/ 2,380.00"]);
  });

  it("descendente da la vuelta", () => {
    const orden = ordenDeFilas(catalogo, rangoDatos, 1, "desc");
    expect(catalogo[orden[0]][1].texto).toBe("S/ 2,380.00");
  });

  it("las celdas vacías van al final en cualquier dirección", () => {
    const asc = ordenDeFilas(catalogo, rangoDatos, 1, "asc");
    const desc = ordenDeFilas(catalogo, rangoDatos, 1, "desc");
    expect(catalogo[asc.at(-1)!][0].texto).toBe("Ñandubay");
    expect(catalogo[desc.at(-1)!][0].texto).toBe("Ñandubay");
  });

  it("el texto se ordena con las reglas del español", () => {
    const orden = ordenDeFilas(catalogo, rangoDatos, 0, "asc");
    const nombres = orden.map((f) => catalogo[f][0].texto);
    expect(nombres).toEqual(["Bolaina", "Ñandubay", "Shihuahuaco", "Tornillo"]);
  });

  it("no toca las filas de afuera del rango", () => {
    const orden = ordenDeFilas(catalogo, rangoDatos, 1, "asc");
    expect(orden).toHaveLength(4);
    expect(orden).not.toContain(0);   // el encabezado se queda donde está
  });
});

describe("filtrar", () => {
  it("lista los valores de la columna con su cantidad", () => {
    const valores = valoresDeColumna(catalogo, 3, 1);
    expect(valores).toEqual([
      { valor: "Callao", cantidad: 2 },
      { valor: "Pucallpa", cantidad: 2 },
    ]);
  });

  it("oculta las filas que no pasan el filtro", () => {
    const filtros = new Map([[3, new Set(["Callao"])]]);
    const ocultas = filasOcultasPorFiltro(catalogo, filtros, 1);
    expect(ocultas[0]).toBe(false);   // el encabezado nunca se oculta
    expect(ocultas[1]).toBe(true);    // Pucallpa
    expect(ocultas[3]).toBe(false);   // Callao
  });

  it("dos filtros a la vez se cumplen los dos", () => {
    const filtros = new Map([
      [3, new Set(["Callao"])],
      [0, new Set(["Shihuahuaco"])],
    ]);
    const ocultas = filasOcultasPorFiltro(catalogo, filtros, 1);
    expect(ocultas[3]).toBe(false);   // Shihuahuaco + Callao
    expect(ocultas[4]).toBe(true);    // Ñandubay es Callao pero no pasa el otro
  });

  it("sin filtros no se oculta nada", () => {
    expect(filasOcultasPorFiltro(catalogo, new Map(), 1).some(Boolean)).toBe(false);
  });
});
