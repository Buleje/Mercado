import { describe, expect, it } from "vitest";
import {
  devolverFilas,
  idsEntre,
  idsPorNumero,
  quitarFilas,
  resumenDeMarcadas,
  validarRangoDeFilas,
} from "@/lib/forestal/seleccion-filas";

const ids = Array.from({ length: 100 }, (_, i) => `p${i + 1}`);

describe("idsEntre (Shift+clic)", () => {
  it("de arriba hacia abajo y al revés dan el mismo tramo", () => {
    const bajando = idsEntre(ids, "p50", "p80");
    const subiendo = idsEntre(ids, "p80", "p50");
    expect(bajando).toHaveLength(31);
    expect(subiendo).toEqual(bajando);
    expect(bajando[0]).toBe("p50");
    expect(bajando.at(-1)).toBe("p80");
  });
  it("sin ancla, o con el ancla escondida por un filtro, sólo la clicada", () => {
    expect(idsEntre(ids, null, "p7")).toEqual(["p7"]);
    expect(idsEntre(ids, "no-esta", "p7")).toEqual(["p7"]);
  });
  it("la clicada que no se ve no marca nada", () => {
    expect(idsEntre(ids, "p1", "no-esta")).toEqual([]);
  });
});

describe("validarRangoDeFilas («de la fila X a la Y»)", () => {
  it("50→80 y 80→50 son el mismo tramo", () => {
    expect(validarRangoDeFilas(50, 80, 100)).toEqual({ ok: true, desde: 50, hasta: 80 });
    expect(validarRangoDeFilas(80, 50, 100)).toEqual({ ok: true, desde: 50, hasta: 80 });
  });
  it("una sola fila vale", () => {
    expect(validarRangoDeFilas(7, 7, 10)).toEqual({ ok: true, desde: 7, hasta: 7 });
  });
  it("fuera de la tabla avisa cuántas filas hay", () => {
    const r = validarRangoDeFilas(90, 120, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("100 filas");
    expect(validarRangoDeFilas(0, 5, 100).ok).toBe(false);
  });
  it("vacío, decimales o tabla sin filas", () => {
    expect(validarRangoDeFilas(null, 5, 100).ok).toBe(false);
    expect(validarRangoDeFilas(5, Number.NaN, 100).ok).toBe(false);
    expect(validarRangoDeFilas(5.5, 9, 100).ok).toBe(false);
    expect(validarRangoDeFilas(1, 1, 0).ok).toBe(false);
  });
});

describe("idsPorNumero", () => {
  it("toma el N° que se ve, también con «más nuevas primero» (N° de mayor a menor)", () => {
    const recientes = ids.map((id, i) => ({ id, numero: 100 - i }));
    const r = idsPorNumero(recientes, 50, 80);
    expect(r).toHaveLength(31);
    expect(r[0]).toBe("p21"); // N° 80 va arriba
    expect(r.at(-1)).toBe("p51"); // N° 50
  });
  it("con filtro sólo marca lo visible del tramo", () => {
    const visibles = [{ id: "a", numero: 3 }, { id: "b", numero: 9 }, { id: "c", numero: 40 }];
    expect(idsPorNumero(visibles, 1, 10)).toEqual(["a", "b"]);
  });
});

describe("resumenDeMarcadas", () => {
  const rows = [
    { id: "1", cantidad: 3, pieTablar: 26.67, especie: "Tornillo" },
    { id: "2", cantidad: 2, pieTablar: 13.33, especie: "Cumala" },
    { id: "3", cantidad: 1, pieTablar: 0.1, especie: "TORNILLO" },
    { id: "4", cantidad: 5, pieTablar: 0.2 },
    { id: "5", cantidad: 9, pieTablar: 999, especie: "Tornillo" },
  ];
  it("suma sólo lo marcado, sin deriva de float, y el m³ sale del pie tablar total", () => {
    const r = resumenDeMarcadas(rows, new Set(["1", "2", "3", "4"]));
    expect(r.filas).toBe(4);
    expect(r.piezas).toBe(11);
    expect(r.pt).toBe(40.3); // 0,1 + 0,2 no deja 0,30000000000000004
    expect(r.m3).toBe(0.095); // 40,3 ÷ 424 = 0,09504… → 4 decimales
  });
  it("300 filas de 0,1 pt dan 30 exacto", () => {
    const muchas = Array.from({ length: 300 }, (_, i) => ({ id: `x${i}`, cantidad: 1, pieTablar: 0.1, especie: "Tornillo" }));
    const r = resumenDeMarcadas(muchas, new Set(muchas.map((m) => m.id)));
    expect(r.pt).toBe(30);
    expect(r.especies).toHaveLength(1);
    expect(r.especies[0].pt).toBe(30);
  });
  it("agrupa por especie sin mirar mayúsculas, la de más volumen primero y «sin especie» al final", () => {
    const r = resumenDeMarcadas(rows, new Set(["1", "2", "3", "4"]));
    expect(r.especies.map((e) => e.especie)).toEqual(["Tornillo", "Cumala", null]);
    expect(r.especies[0]).toMatchObject({ filas: 2, piezas: 4, pt: 26.77 });
    expect(r.especies[2]).toMatchObject({ filas: 1, piezas: 5, pt: 0.2 });
  });
  it("sin marcadas, todo en cero", () => {
    expect(resumenDeMarcadas(rows, new Set())).toEqual({ filas: 0, piezas: 0, pt: 0, m3: 0, especies: [] });
  });
});

describe("quitarFilas + devolverFilas (Eliminar y Deshacer)", () => {
  const rows = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  it("quita las marcadas y Deshacer las devuelve a su lugar", () => {
    const { quedan, quitadas } = quitarFilas(rows, new Set(["b", "d"]));
    expect(quedan.map((r) => r.id)).toEqual(["a", "c", "e"]);
    expect(devolverFilas(quedan, quitadas).map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("si se dictó otra pieza después, vuelven igual y la nueva no se pierde", () => {
    const { quedan, quitadas } = quitarFilas(rows, new Set(["d", "e"]));
    const conNueva = [...quedan, { id: "nueva" }];
    expect(devolverFilas(conNueva, quitadas).map((r) => r.id)).toEqual(["a", "b", "c", "d", "e", "nueva"]);
  });
  it("Deshacer dos veces no duplica", () => {
    const { quedan, quitadas } = quitarFilas(rows, new Set(["a"]));
    const una = devolverFilas(quedan, quitadas);
    expect(devolverFilas(una, quitadas).map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
