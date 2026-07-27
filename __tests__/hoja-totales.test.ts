/**
 * Totales automáticos de la vista previa de planillas.
 *
 * La primera versión sumaba lo que no era plata: una columna "Partida 7,
 * Partida 8…" daba un total de 46.897,5 (el limpiador de prefijos leía el
 * número del final) y una columna de IGV al 18% "sumaba" 0,72. Un total
 * inventado es peor que ningún total: alguien lo copia en un presupuesto.
 */

import { describe, it, expect } from "vitest";
import { totalesDeColumnas } from "@/lib/documentos/hoja-analisis";
import type { CeldaHoja } from "@/lib/documentos/xlsx-formato";

/** Arma una hoja mínima a partir de una matriz de textos. */
function hoja(filas: string[][]) {
  const cols = Math.max(...filas.map((f) => f.length));
  return {
    filas: filas.map((f) => Array.from({ length: cols }, (_, i): CeldaHoja => ({ texto: f[i] ?? "", crudo: f[i] ?? "" }))),
    anchos: new Array(cols).fill(64),
    columnasOcultas: new Array(cols).fill(false),
  };
}

describe("totalesDeColumnas", () => {
  it("suma la columna de importes con moneda y separadores", () => {
    const t = totalesDeColumnas(hoja([
      ["Descripción", "Importe"],
      ["Cemento", "S/ 1,200.50"],
      ["Fierro", "S/ 800.00"],
      ["Arena", "S/ 1,000.00"],
      ["Ladrillo", "S/ 999.50"],
    ]));
    expect(t).toHaveLength(1);
    expect(t[0].titulo).toBe("Importe");
    expect(t[0].suma).toBeCloseTo(4000, 2);
    expect(t[0].cuenta).toBe(4);
  });

  it("NO suma una columna de textos que terminan en número", () => {
    const t = totalesDeColumnas(hoja([
      ["Partida"],
      ["Partida 7"],
      ["Partida 8"],
      ["Partida 9"],
      ["Partida 10"],
    ]));
    expect(t).toHaveLength(0);
  });

  it("NO suma porcentajes", () => {
    const t = totalesDeColumnas(hoja([
      ["IGV"],
      ["18.00%"],
      ["18.00%"],
      ["18.00%"],
      ["18.00%"],
    ]));
    expect(t).toHaveLength(0);
  });

  it("ignora una columna con pocos números sueltos entre texto", () => {
    const t = totalesDeColumnas(hoja([
      ["Notas"],
      ["revisar"],
      ["12"],
      ["pendiente"],
      ["8"],
      ["ok"],
      ["3"],
      ["falta"],
    ]));
    expect(t).toHaveLength(0);
  });

  it("respeta las columnas ocultas del archivo", () => {
    const h = hoja([
      ["Costo", "Oculta"],
      ["10", "100"],
      ["20", "200"],
      ["30", "300"],
    ]);
    h.columnasOcultas[1] = true;
    const t = totalesDeColumnas(h);
    expect(t.map((x) => x.columna)).toEqual([0]);
  });

  it("usa «Columna X» cuando la columna no tiene encabezado", () => {
    const t = totalesDeColumnas(hoja([["10"], ["20"], ["30"], ["40"]]));
    expect(t[0].titulo).toBe("Columna A");
    expect(t[0].suma).toBe(100);
  });

  it("devuelve como mucho `max` columnas", () => {
    const filas = [["a", "b", "c", "d", "e", "f", "g", "h"]];
    for (let i = 0; i < 5; i++) filas.push(new Array(8).fill(String(i + 1)));
    expect(totalesDeColumnas(hoja(filas), 3)).toHaveLength(3);
  });

  it("no bautiza las columnas con el título combinado de arriba", () => {
    // Una celda combinada devuelve el mismo texto en todas las columnas que
    // tapa: sin filtrarla, cada total se llamaba como el título del documento.
    const h = hoja([
      ["Presupuesto de obra", "Presupuesto de obra", "Presupuesto de obra"],
      ["Descripción", "Cantidad", "Precio"],
      ["Cemento", "10", "28.90"],
      ["Fierro", "20", "41.50"],
      ["Arena", "30", "65.00"],
    ]);
    // Las que tapa la combinada del título, marcadas como en el archivo real.
    h.filas[0][1].tapada = true;
    h.filas[0][2].tapada = true;
    const t = totalesDeColumnas(h);
    expect(t.map((x) => x.titulo)).toEqual(["Cantidad", "Precio"]);
  });

  it("entiende negativos y paréntesis contables", () => {
    const t = totalesDeColumnas(hoja([
      ["Saldo"],
      ["-100"],
      ["250"],
      ["-50.5"],
      ["300"],
    ]));
    expect(t[0].suma).toBeCloseTo(399.5, 2);
  });
});
