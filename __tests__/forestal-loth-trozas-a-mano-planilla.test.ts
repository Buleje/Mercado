import { describe, expect, it } from "vitest";
import {
  deshacerOrden,
  filasAlReves,
  numeroEnVoz,
  ordenarDiametros,
  rehacerOrden,
  revisarCeldaAMano,
  textoDeFilaAMano,
  type FilaEnVoz,
} from "@/lib/forestal/loth-trozas-a-mano-planilla";
import { volumenDeFila, type TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";

type Fila = TrozaAMano & { key: number };
const fila = (key: number, d1Cm: number, d2Cm: number, largoM = 3.2, cantidad = 1): Fila => ({
  key,
  d1Cm,
  d2Cm,
  largoM,
  cantidad,
  especie: "Tornillo",
});

/** 3 de 5 al revés (D2 > D1); una pareja (iguales) y una ya ordenada. */
const FILAS: Fila[] = [fila(1, 40, 45), fila(2, 50, 46, 4), fila(3, 38.5, 52, 2.75, 3), fila(4, 60, 60), fila(5, 33, 41.2, 5.1)];

describe("Ordenar Ø: mayor en D1, menor en D2", () => {
  it("da vuelta sólo las filas con D2 > D1 y dice cuántas", () => {
    expect(filasAlReves(FILAS)).toBe(3);
    const r = ordenarDiametros(FILAS);
    expect(r.cambio.antes.map((a) => a.key)).toEqual([1, 3, 5]);
    expect(r.filas.map((f) => [f.d1Cm, f.d2Cm])).toEqual([[45, 40], [50, 46], [52, 38.5], [60, 60], [41.2, 33]]);
    expect(filasAlReves(r.filas)).toBe(0);
    /* Las que ya estaban no se tocan: el mismo objeto. */
    expect(r.filas[1]).toBe(FILAS[1]);
    expect(r.filas[3]).toBe(FILAS[3]);
  });

  it("el volumen no cambia: Smalian SERFOR promedia los dos Ø", () => {
    const r = ordenarDiametros(FILAS);
    r.filas.forEach((f, i) => expect(volumenDeFila(f)).toBe(volumenDeFila(FILAS[i])));
    const total = (fs: readonly Fila[]) => fs.reduce((a, f) => a + volumenDeFila(f), 0);
    expect(total(r.filas)).toBe(total(FILAS));
    /* 40 × 45 × 3,2 → 0,454 m³ en los dos sentidos. */
    expect(volumenDeFila(r.filas[0])).toBe(0.454);
  });

  it("Deshacer devuelve EXACTAMENTE lo de antes y Rehacer lo vuelve a ordenar", () => {
    const orden = ordenarDiametros(FILAS);
    const deshecho = deshacerOrden(orden.filas, orden.cambio);
    expect(deshecho.cambiadas).toBe(3);
    expect(deshecho.filas).toEqual(FILAS);
    const rehecho = rehacerOrden(deshecho.filas, orden.cambio);
    expect(rehecho.cambiadas).toBe(3);
    expect(rehecho.filas).toEqual(orden.filas);
  });

  it("Deshacer no pisa una medida corregida después, no revive una quitada y deja la agregada", () => {
    const orden = ordenarDiametros(FILAS);
    const despues = orden.filas
      .filter((f) => f.key !== 5) // quitada
      .map((f) => (f.key === 3 ? { ...f, d2Cm: 39 } : f)) // corregida a mano
      .concat(fila(6, 30, 35)); // agregada después (al revés, pero no es de ese orden)
    const r = deshacerOrden(despues, orden.cambio);
    expect(r.cambiadas).toBe(1);
    expect(r.filas.map((f) => [f.key, f.d1Cm, f.d2Cm])).toEqual([
      [1, 40, 45],
      [2, 50, 46],
      [3, 52, 39],
      [4, 60, 60],
      [6, 30, 35],
    ]);
  });

  it("sin filas al revés no hay nada que ordenar", () => {
    const r = ordenarDiametros([fila(1, 50, 46)]);
    expect(r.cambio.antes).toEqual([]);
  });
});

describe("corregir una medida ya anotada", () => {
  const f = fila(1, 45, 40);
  it("con coma decimal y dentro de los límites, pasa el valor nuevo", () => {
    expect(revisarCeldaAMano(f, "largo", "3,25", 0)).toEqual({ ok: true, cambio: { largoM: 3.25 } });
    expect(revisarCeldaAMano(f, "d2", "41.5", 0)).toEqual({ ok: true, cambio: { d2Cm: 41.5 } });
  });
  it("fuera de rango o vacía, dice por qué", () => {
    const r = revisarCeldaAMano(f, "d1", "900", 0);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/D1 va de/);
    expect(revisarCeldaAMano(f, "cantidad", "", 0)).toEqual({ ok: false, error: "Falta la cantidad" });
  });
  it("la cantidad no pasa el tope de la guía (150)", () => {
    const r = revisarCeldaAMano(f, "cantidad", "11", 140);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/caben 10/);
    expect(revisarCeldaAMano(f, "cantidad", "10", 140)).toEqual({ ok: true, cambio: { cantidad: 10 } });
  });
});

describe("leer fila por fila", () => {
  const enVoz = (id: string, d1Cm: number, d2Cm: number, largoM: number, especie?: string, cantidad = 1): FilaEnVoz => ({
    id,
    d1Cm,
    d2Cm,
    largoM,
    cantidad,
    especie,
  });
  const leer = (lista: FilaEnVoz[]) =>
    lista.map((f, indice) => textoDeFilaAMano(f, { indice, lista, haciaAtras: false, primera: indice === 0 }));

  it("dice D1, D2 y largo con «coma», no con «punto»", () => {
    expect(numeroEnVoz(3.2)).toBe("3 coma 2");
    expect(numeroEnVoz(45)).toBe("45");
    expect(leer([enVoz("1", 45, 40, 3.2)])).toEqual(["Fila 1: 45, 40, 3 coma 2"]);
  });

  it("la especie: una vez al entrar a un tramo; sola, al final; con cantidad, cuántas", () => {
    expect(
      leer([
        enVoz("1", 45, 40, 3.2, "Tornillo"),
        enVoz("2", 50, 46, 4, "Tornillo"),
        enVoz("3", 38.5, 52, 2.75, "Cedro", 3),
      ]),
    ).toEqual([
      "Continúa con Tornillo. Fila 1: 45, 40, 3 coma 2",
      "Fila 2: 50, 46, 4",
      "Fila 3: 38 coma 5, 52, 2 coma 75, 3 trozas, Cedro",
    ]);
  });
});
