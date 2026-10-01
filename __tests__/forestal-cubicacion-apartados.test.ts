/**
 * Apartados del cubicador: separar el lote en bloques con su propio total.
 * La asignación vive fuera de PiezaCubicada — estos tests son sobre esa capa,
 * no sobre la cubicación en sí.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  siguienteApartado, filasPendientes, asignarApartado, disolverApartado,
  quitarAsignaciones, podarAsignados, resumenApartados, totalizarFilas,
  nombreDeApartado, etiquetaApartado, renombrarApartado, podarNombres,
  type ApartadosAsignados, type NombresApartado,
} from "@/lib/forestal/cubicacion-apartados";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie?: string): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `p${++seq}`, ...dims, especie, ...cubicarPieza(dims) };
}

describe("siguienteApartado", () => {
  it("empieza en 1 sin asignaciones", () => {
    expect(siguienteApartado({})).toBe(1);
  });
  it("sigue después del más alto, no del tamaño del mapa", () => {
    expect(siguienteApartado({ a: 1, b: 3 })).toBe(4);
  });
});

describe("filasPendientes", () => {
  it("las filas sin asignar quedan pendientes", () => {
    const a = pieza(1, 2, 8, 10), b = pieza(1, 2, 8, 10);
    const asignados: ApartadosAsignados = { [a.id]: 1 };
    expect(filasPendientes([a, b], asignados)).toEqual([b]);
  });
  it("todas pendientes cuando no hay nada asignado", () => {
    const a = pieza(1, 2, 8, 10);
    expect(filasPendientes([a], {})).toEqual([a]);
  });
});

describe("asignarApartado", () => {
  it("asigna varias filas al mismo número", () => {
    const next = asignarApartado({}, ["x", "y"], 1);
    expect(next).toEqual({ x: 1, y: 1 });
  });
  it("con ids vacíos devuelve la MISMA referencia (no crea un objeto nuevo de la nada)", () => {
    const prev: ApartadosAsignados = { x: 1 };
    expect(asignarApartado(prev, [], 2)).toBe(prev);
  });
  it("reasigna una fila que ya estaba en otro apartado", () => {
    const next = asignarApartado({ x: 1 }, ["x"], 2);
    expect(next.x).toBe(2);
  });
});

describe("disolverApartado", () => {
  it("quita sólo las filas del número indicado, el resto queda", () => {
    const next = disolverApartado({ a: 1, b: 1, c: 2 }, 1);
    expect(next).toEqual({ c: 2 });
  });
});

describe("quitarAsignaciones", () => {
  it("quita varios ids a la vez, deja el resto", () => {
    const next = quitarAsignaciones({ a: 1, b: 1, c: 2 }, ["a", "c"]);
    expect(next).toEqual({ b: 1 });
  });
  it("un id que no estaba asignado no rompe nada", () => {
    const next = quitarAsignaciones({ a: 1 }, ["fantasma"]);
    expect(next).toEqual({ a: 1 });
  });
  it("sin nada que quitar devuelve la MISMA referencia", () => {
    const prev: ApartadosAsignados = { a: 1 };
    expect(quitarAsignaciones(prev, ["fantasma"])).toBe(prev);
  });
  it("ids vacíos devuelve la MISMA referencia", () => {
    const prev: ApartadosAsignados = { a: 1 };
    expect(quitarAsignaciones(prev, [])).toBe(prev);
  });
});

describe("totalizarFilas", () => {
  it("suma piezas, pie tablar y m³ de cualquier lista de filas (no sólo apartados cerrados)", () => {
    const a = pieza(10, 2, 8, 10, "Tornillo");
    const b = pieza(4, 6, 6, 4, "Cedro");
    const t = totalizarFilas([a, b]);
    expect(t.filas).toBe(2);
    expect(t.piezas).toBe(14);
    expect(t.pieTablar).toBeCloseTo(a.pieTablar + b.pieTablar, 2);
    expect(t.especies).toEqual(["Tornillo", "Cedro"]);
  });
  it("lista vacía da todo en cero, sin especies", () => {
    expect(totalizarFilas([])).toEqual({ filas: 0, piezas: 0, pieTablar: 0, m3: 0, especies: [], ids: [] });
  });
  it("trae los ids de las filas que entraron en la cuenta", () => {
    const a = pieza(1, 2, 8, 10), b = pieza(1, 6, 6, 4);
    expect(totalizarFilas([a, b]).ids).toEqual([a.id, b.id]);
  });
});

describe("podarAsignados", () => {
  it("filas borradas del lote se caen de la asignación", () => {
    const viva = pieza(1, 2, 8, 10);
    const next = podarAsignados({ [viva.id]: 1, fantasma: 1 }, [viva]);
    expect(next).toEqual({ [viva.id]: 1 });
  });
  it("sin nada que podar devuelve la MISMA referencia (evita loops de efecto)", () => {
    const viva = pieza(1, 2, 8, 10);
    const asignados: ApartadosAsignados = { [viva.id]: 1 };
    expect(podarAsignados(asignados, [viva])).toBe(asignados);
  });
});

describe("resumenApartados", () => {
  it("suma piezas, pie tablar y m³ por apartado, ordenado por número", () => {
    const a = pieza(10, 2, 8, 10, "Tornillo");  // 13.33 PT c/u
    const b = pieza(5, 2, 8, 10, "Tornillo");
    const c = pieza(4, 6, 6, 4, "Cedro");
    const asignados: ApartadosAsignados = { [a.id]: 2, [b.id]: 1, [c.id]: 1 };
    const r = resumenApartados([a, b, c], asignados);
    expect(r.map((x) => x.numero)).toEqual([1, 2]);
    const ap1 = r[0];
    expect(ap1.filas).toBe(2);
    expect(ap1.piezas).toBe(9); // 5 + 4
    expect(ap1.pieTablar).toBeCloseTo(b.pieTablar + c.pieTablar, 2);
    expect(ap1.especies).toEqual(["Tornillo", "Cedro"]);
    expect(ap1.ids).toEqual([b.id, c.id]);
  });

  it("filas pendientes (sin apartado) no aparecen en el resumen", () => {
    const a = pieza(1, 2, 8, 10);
    expect(resumenApartados([a], {})).toEqual([]);
  });

  it("sin especie cae en «Sin especie», sin duplicar la etiqueta", () => {
    const a = pieza(1, 2, 8, 10), b = pieza(1, 2, 8, 10);
    const r = resumenApartados([a, b], { [a.id]: 1, [b.id]: 1 });
    expect(r[0].especies).toEqual(["Sin especie"]);
  });
});

describe("nombreDeApartado / etiquetaApartado", () => {
  it("sin nombre, la etiqueta es sólo el número", () => {
    expect(nombreDeApartado(1, {})).toBe("");
    expect(etiquetaApartado(1, {})).toBe("Apartado 1");
  });
  it("con nombre, la etiqueta lo suma", () => {
    const nombres: NombresApartado = { 1: "Camión A" };
    expect(nombreDeApartado(1, nombres)).toBe("Camión A");
    expect(etiquetaApartado(1, nombres)).toBe("Apartado 1 · Camión A");
  });
  it("un nombre de sólo espacios cuenta como sin nombre", () => {
    expect(nombreDeApartado(1, { 1: "   " })).toBe("");
    expect(etiquetaApartado(1, { 1: "   " })).toBe("Apartado 1");
  });
});

describe("renombrarApartado", () => {
  it("pone un nombre nuevo", () => {
    expect(renombrarApartado({}, 1, "Camión A")).toEqual({ 1: "Camión A" });
  });
  it("string vacío borra el nombre existente", () => {
    expect(renombrarApartado({ 1: "Camión A" }, 1, "")).toEqual({});
  });
  it("sólo espacios también borra (no guarda basura)", () => {
    expect(renombrarApartado({ 1: "Camión A" }, 1, "   ")).toEqual({});
  });
  it("vaciar un apartado que no tenía nombre devuelve la MISMA referencia", () => {
    const prev: NombresApartado = { 1: "x" };
    expect(renombrarApartado(prev, 2, "")).toBe(prev);
  });
  it("poner el mismo nombre que ya tenía devuelve la MISMA referencia", () => {
    const prev: NombresApartado = { 1: "Camión A" };
    expect(renombrarApartado(prev, 1, "Camión A")).toBe(prev);
  });
});

describe("podarNombres", () => {
  it("un apartado sin filas asignadas pierde su nombre", () => {
    const nombres: NombresApartado = { 1: "Camión A", 2: "Cliente López" };
    const asignados: ApartadosAsignados = { x: 2 }; // sólo el 2 sigue vivo
    expect(podarNombres(nombres, asignados)).toEqual({ 2: "Cliente López" });
  });
  it("lote vaciado (asignados vacío) borra todos los nombres — el próximo Apartado 1 no hereda el nombre viejo", () => {
    const nombres: NombresApartado = { 1: "Camión A" };
    expect(podarNombres(nombres, {})).toEqual({});
  });
  it("sin nada que podar devuelve la MISMA referencia", () => {
    const nombres: NombresApartado = { 1: "Camión A" };
    expect(podarNombres(nombres, { x: 1 })).toBe(nombres);
  });
});
