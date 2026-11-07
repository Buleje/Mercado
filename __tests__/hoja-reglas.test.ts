/**
 * Resaltar por regla: qué celdas se pintan.
 *
 * El riesgo de esta función es pintar de más (marcar como "menor que 5" una
 * celda de texto) o de menos (no entender "S/ 4.50"). Las dos cosas se ven
 * enseguida en un inventario y hacen que nadie vuelva a usar la herramienta.
 */

import { describe, it, expect } from "vitest";
import { celdasQueCumplen, describirRegla } from "@/lib/documentos/hoja-reglas";
import type { CeldaHoja } from "@/lib/documentos/xlsx-formato";

function filas(matriz: string[][]): CeldaHoja[][] {
  return matriz.map((f) => f.map((v): CeldaHoja => ({ texto: v, crudo: v })));
}

const TODO = { filaIni: 0, filaFin: 99, colIni: 0, colFin: 99 };

describe("celdasQueCumplen", () => {
  it("compara números aunque vengan con moneda y miles", () => {
    const f = filas([["S/ 1,200.00"], ["S/ 80.50"], ["S/ 4.20"]]);
    const r = celdasQueCumplen(f, TODO, { comparador: "menor", valor: "100" });
    expect(r).toEqual([{ fila: 1, columna: 0 }, { fila: 2, columna: 0 }]);
  });

  it("acepta la coma decimal peruana en el valor de referencia", () => {
    const f = filas([["4.5"], ["4.4"]]);
    const r = celdasQueCumplen(f, TODO, { comparador: "mayor", valor: "4,45" });
    expect(r).toEqual([{ fila: 0, columna: 0 }]);
  });

  it("NO marca texto con un comparador numérico", () => {
    const f = filas([["Arroz"], ["3"]]);
    const r = celdasQueCumplen(f, TODO, { comparador: "menor", valor: "5" });
    expect(r).toEqual([{ fila: 1, columna: 0 }]);
  });

  it("«contiene» ignora mayúsculas y acentos de caja", () => {
    const f = filas([["Aceite Primor"], ["Arroz"], ["ACEITE vegetal"]]);
    const r = celdasQueCumplen(f, TODO, { comparador: "contiene", valor: "aceite" });
    expect(r).toEqual([{ fila: 0, columna: 0 }, { fila: 2, columna: 0 }]);
  });

  it("«contiene» sin texto no marca nada (no pinta la planilla entera)", () => {
    const f = filas([["a"], ["b"]]);
    expect(celdasQueCumplen(f, TODO, { comparador: "contiene", valor: "  " })).toEqual([]);
  });

  it("«está vacía» marca sólo las celdas sin nada", () => {
    const f = filas([["a", ""], ["", "b"]]);
    const r = celdasQueCumplen(f, TODO, { comparador: "vacia", valor: "" });
    expect(r).toEqual([{ fila: 0, columna: 1 }, { fila: 1, columna: 0 }]);
  });

  it("respeta el rango seleccionado", () => {
    const f = filas([["1", "1"], ["1", "1"]]);
    const r = celdasQueCumplen(f, { filaIni: 0, filaFin: 0, colIni: 1, colFin: 1 }, { comparador: "igual", valor: "1" });
    expect(r).toEqual([{ fila: 0, columna: 1 }]);
  });

  it("saltea las celdas tapadas por una combinada", () => {
    const f = filas([["10", "10"]]);
    f[0][1].tapada = true;
    const r = celdasQueCumplen(f, TODO, { comparador: "igual", valor: "10" });
    expect(r).toEqual([{ fila: 0, columna: 0 }]);
  });

  it("describe la regla en criollo", () => {
    expect(describirRegla({ comparador: "menor", valor: "5" })).toBe("menor que 5");
    expect(describirRegla({ comparador: "vacia", valor: "" })).toBe("está vacía");
  });
});
