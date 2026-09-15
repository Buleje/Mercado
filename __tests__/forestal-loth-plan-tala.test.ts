/**
 * El plan de tala: qué árboles cubren la meta de la zafra.
 *
 * Lo que se blinda es que la lista NUNCA proponga un árbol que no se puede
 * tumbar. Un plan que cuadra en metros cúbicos pero pasa el saldo de una
 * especie, o incluye un semillero, no es un plan optimista: es una infracción
 * escrita con anticipación.
 */
import { describe, expect, it } from "vitest";
import {
  metaDeDias,
  planDeTala,
  type ArbolParaTalar,
} from "@/lib/forestal/loth-plan-tala";

const a = (
  treeCode: string,
  especie: string,
  volumenM3: number,
  over: Partial<ArbolParaTalar> = {},
): ArbolParaTalar => ({
  id: treeCode,
  treeCode,
  especie,
  volumenM3,
  categoria: "aprovechable",
  estado: "en_pie",
  utmX: null,
  utmY: null,
  parcela: null,
  ...over,
});

describe("plan de tala", () => {
  it("los de mayor volumen primero: menos árboles para los mismos m³", () => {
    const r = planDeTala(
      [a("T1", "Tornillo", 3), a("T2", "Tornillo", 9), a("T3", "Tornillo", 6)],
      [{ especie: "Tornillo", saldoM3: 100 }],
      14,
    );
    expect(r.lineas.map((l) => l.arbol.treeCode)).toEqual(["T2", "T3"]);
    expect(r.totalM3).toBe(15);
    expect(r.faltanteM3).toBe(0);
  });

  it("el acumulado va sumando fila por fila", () => {
    const r = planDeTala(
      [a("T1", "Tornillo", 5), a("T2", "Tornillo", 4)],
      [{ especie: "Tornillo", saldoM3: 100 }],
      9,
    );
    expect(r.lineas.map((l) => l.acumuladoM3)).toEqual([5, 9]);
  });

  it("para apenas pasa la meta, no sigue tumbando de más", () => {
    const r = planDeTala(
      [a("T1", "Tornillo", 10), a("T2", "Tornillo", 10), a("T3", "Tornillo", 10)],
      [{ especie: "Tornillo", saldoM3: 100 }],
      12,
    );
    expect(r.lineas).toHaveLength(2);
    expect(r.totalM3).toBe(20);
  });

  it("⭐ el tope es POR ESPECIE, no sobre el total", () => {
    /* La meta (25) alcanzaría de sobra con el bosque disponible (27 m³), pero
       el Shihuahuaco sólo tiene 8 m³ de saldo: entra S1 y S2 queda afuera
       aunque sobre madera. Cuadrar el total pisando el saldo de una especie es
       exactamente la infracción que este cálculo evita. */
    const r = planDeTala(
      [a("S1", "Shihuahuaco", 8), a("S2", "Shihuahuaco", 7), a("T1", "Tornillo", 12)],
      [{ especie: "Shihuahuaco", saldoM3: 8 }, { especie: "Tornillo", saldoM3: 50 }],
      25,
    );
    expect(r.lineas.map((l) => l.arbol.treeCode)).toEqual(["T1", "S1"]);
    expect(r.totalM3).toBe(20);
    expect(r.faltanteM3).toBe(5);
    expect(r.motivoFaltante).toBe("tope_por_especie");
    expect(r.descartes.some((d) => /saldo que le queda a la especie/.test(d.motivo))).toBe(true);
  });

  it("al llegar a la meta corta y no evalúa el resto: no propone de más", () => {
    const r = planDeTala(
      [a("S1", "Shihuahuaco", 8), a("S2", "Shihuahuaco", 7), a("T1", "Tornillo", 12)],
      [{ especie: "Shihuahuaco", saldoM3: 8 }, { especie: "Tornillo", saldoM3: 50 }],
      20,
    );
    expect(r.lineas.map((l) => l.arbol.treeCode)).toEqual(["T1", "S1"]);
    expect(r.faltanteM3).toBe(0);
    expect(r.descartes).toHaveLength(0);
  });

  it("⭐ una especie sin saldo declarado NO entra: el silencio se lee como cero", () => {
    const r = planDeTala([a("X1", "Misa", 9)], [{ especie: "Tornillo", saldoM3: 50 }], 9);
    expect(r.lineas).toHaveLength(0);
    expect(r.descartes[0].motivo).toBe("especie sin saldo autorizado");
    expect(r.motivoFaltante).toBe("sin_arboles");
  });

  it("⭐ no propone semilleros, bajo DMC ni talados", () => {
    const r = planDeTala(
      [
        a("SEM", "Tornillo", 20, { categoria: "semillero" }),
        a("BAJO", "Tornillo", 20, { categoria: "bajo_dmc" }),
        a("YA", "Tornillo", 20, { estado: "talado" }),
        a("OK", "Tornillo", 5),
      ],
      [{ especie: "Tornillo", saldoM3: 100 }],
      50,
    );
    expect(r.lineas.map((l) => l.arbol.treeCode)).toEqual(["OK"]);
    expect(r.totalM3).toBe(5);
    expect(r.faltanteM3).toBe(45);
  });

  it("un árbol sin volumen no suma ni rompe", () => {
    const r = planDeTala(
      [a("SV", "Tornillo", 0), a("OK", "Tornillo", 4)],
      [{ especie: "Tornillo", saldoM3: 100 }],
      4,
    );
    expect(r.lineas.map((l) => l.arbol.treeCode)).toEqual(["OK"]);
  });

  it("distingue POR QUÉ no llegó: no había árboles vs. el saldo no daba", () => {
    const sinNada = planDeTala([], [{ especie: "Tornillo", saldoM3: 50 }], 10);
    expect(sinNada.motivoFaltante).toBe("sin_arboles");

    const conTope = planDeTala(
      [a("T1", "Tornillo", 30)],
      [{ especie: "Tornillo", saldoM3: 10 }],
      30,
    );
    expect(conTope.motivoFaltante).toBe("tope_por_especie");
    expect(conTope.faltanteM3).toBe(30);
  });

  it("el mismo censo da el mismo plan dos veces (empates por código)", () => {
    const trees = [a("B", "Tornillo", 5), a("A", "Tornillo", 5), a("C", "Tornillo", 5)];
    const uno = planDeTala(trees, [{ especie: "Tornillo", saldoM3: 100 }], 10);
    const dos = planDeTala([...trees].reverse(), [{ especie: "Tornillo", saldoM3: 100 }], 10);
    expect(uno.lineas.map((l) => l.arbol.treeCode)).toEqual(["A", "B"]);
    expect(dos.lineas.map((l) => l.arbol.treeCode)).toEqual(["A", "B"]);
  });

  it("meta cero devuelve un plan vacío, no todo el bosque", () => {
    const r = planDeTala([a("T1", "Tornillo", 5)], [{ especie: "Tornillo", saldoM3: 50 }], 0);
    expect(r.lineas).toHaveLength(0);
    expect(r.faltanteM3).toBe(0);
    expect(r.motivoFaltante).toBeNull();
  });

  it("la especie se compara sin importar mayúsculas ni espacios", () => {
    const r = planDeTala([a("T1", " TORNILLO ", 5)], [{ especie: "Tornillo", saldoM3: 50 }], 5);
    expect(r.lineas).toHaveLength(1);
  });
});

describe("meta de días", () => {
  it("es el ritmo por los días", () => {
    expect(metaDeDias(1.5, 10, 999)).toBe(15);
  });

  it("⭐ nunca pide más que el saldo autorizado", () => {
    expect(metaDeDias(10, 30, 42)).toBe(42);
  });

  it("no inventa con números basura", () => {
    expect(metaDeDias(Number.NaN, 10, 50)).toBe(0);
    expect(metaDeDias(2, -5, 50)).toBe(0);
    expect(metaDeDias(2, 5, -1)).toBe(0);
  });
});
