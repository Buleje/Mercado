/**
 * El estado del editor de planillas: combinar celdas como datos y el remapeo
 * de pendientes cuando la estructura corre las direcciones.
 *
 * El remapeo es el que evita el bug silencioso de "escribí B5, inserté una
 * fila arriba, y el valor se guardó en la fila equivocada".
 */
import { describe, expect, it } from "vitest";
import { aCambiosDeArchivo, aplicar, mergesDe, remapearPendientes, type Accion } from "@/components/admin/documentos/hoja/estado-hoja";
import type { HojaFormato } from "@/lib/documentos/xlsx-formato";

function hojaDe(filas: string[][]): HojaFormato {
  const cols = Math.max(...filas.map((f) => f.length));
  return {
    nombre: "Datos",
    filas: filas.map((f) => Array.from({ length: cols }, (_, i) => ({ texto: f[i] ?? "", crudo: f[i] ?? "" }))),
    anchos: new Array(cols).fill(64),
    altos: new Array(filas.length).fill(20),
    columnasOcultas: new Array(cols).fill(false),
    filasOcultas: new Array(filas.length).fill(false),
    congelado: { filas: 0, columnas: 0 },
    tieneFormulas: false,
    oculta: false,
  };
}

describe("combinar celdas en pantalla", () => {
  it("marca ancla, tapadas y continuación igual que la lectura del archivo", () => {
    const { hoja } = aplicar(hojaDe([["Título", "", ""], ["", "", ""], ["a", "b", "c"]]),
      { tipo: "combinar", filaIni: 0, colIni: 0, filaFin: 1, colFin: 2 });
    expect(hoja.filas[0][0].colspan).toBe(3);
    expect(hoja.filas[0][0].rowspan).toBe(2);
    expect(hoja.filas[0][1].tapada).toBe(true);
    expect(hoja.filas[1][0].continuaArriba).toBe(true);
    expect(hoja.filas[1][1].tapada).toBe(true);
    expect(hoja.filas[2][0].colspan).toBeUndefined();
  });

  it("la inversa separa y los valores tapados reaparecen", () => {
    const base = hojaDe([["Título", "oculto"]]);
    const { hoja, inversa } = aplicar(base, { tipo: "combinar", filaIni: 0, colIni: 0, filaFin: 0, colFin: 1 });
    expect(hoja.filas[0][1].tapada).toBe(true);
    expect(hoja.filas[0][1].crudo).toBe("oculto"); // el valor no se pierde
    const { hoja: vuelta } = aplicar(hoja, inversa);
    expect(vuelta.filas[0][1].tapada).toBeUndefined();
    expect(mergesDe(vuelta)).toHaveLength(0);
  });

  it("mergesDe reconstruye los bloques desde las señales", () => {
    const { hoja } = aplicar(hojaDe([["a", "", "b", ""], ["", "", "", ""]]),
      { tipo: "combinar", filaIni: 0, colIni: 2, filaFin: 1, colFin: 3 });
    expect(mergesDe(hoja)).toEqual([{ filaIni: 0, colIni: 2, filaFin: 1, colFin: 3 }]);
  });

  it("viaja al archivo como referencia de Excel", () => {
    const cambios = aCambiosDeArchivo([{ tipo: "combinar", filaIni: 0, colIni: 0, filaFin: 0, colFin: 2 }], 0);
    expect(cambios.combinadas).toEqual([{ hoja: 0, ref: "A1:C1", modo: "agregar" }]);
  });
});

describe("remapeo de pendientes al mover la estructura", () => {
  const escribirB5: Accion = { tipo: "valores", celdas: [{ fila: 4, columna: 1, valor: "990" }] };

  it("insertar una fila arriba corre la escritura pendiente hacia abajo", () => {
    const [movida] = remapearPendientes([escribirB5], "fila", 3, 1);
    expect(movida).toEqual({ tipo: "valores", celdas: [{ fila: 5, columna: 1, valor: "990" }] });
  });

  it("eliminar la fila de una escritura pendiente la descarta", () => {
    expect(remapearPendientes([escribirB5], "fila", 5, -1)).toHaveLength(0);
  });

  it("insertar una columna a la izquierda corre celdas y anchos", () => {
    const pendientes: Accion[] = [escribirB5, { tipo: "ancho", columna: 3, anchoPx: 120 }];
    const out = remapearPendientes(pendientes, "columna", 1, 1);
    expect(out[0]).toEqual({ tipo: "valores", celdas: [{ fila: 4, columna: 2, valor: "990" }] });
    expect(out[1]).toEqual({ tipo: "ancho", columna: 4, anchoPx: 120 });
  });

  it("lo que quedó por encima del corte no se mueve", () => {
    const [igual] = remapearPendientes([escribirB5], "fila", 6, 1);
    expect(igual).toEqual(escribirB5);
  });

  it("un combinado pendiente se estira con la fila insertada adentro", () => {
    const combinar: Accion = { tipo: "combinar", filaIni: 1, colIni: 0, filaFin: 3, colFin: 2 };
    const [movido] = remapearPendientes([combinar], "fila", 3, 1);
    expect(movido).toEqual({ tipo: "combinar", filaIni: 1, colIni: 0, filaFin: 4, colFin: 2 });
  });

  it("un combinado que queda de una sola celda desaparece", () => {
    const combinar: Accion = { tipo: "combinar", filaIni: 1, colIni: 0, filaFin: 2, colFin: 0 };
    expect(remapearPendientes([combinar], "fila", 3, -1)).toHaveLength(0);
  });

  it("las acciones de estructura no se tocan: son un programa secuencial", () => {
    const insertar: Accion = { tipo: "estructura", eje: "fila", indice: 2, delta: 1 };
    expect(remapearPendientes([insertar], "fila", 1, 1)).toEqual([insertar]);
  });
});
