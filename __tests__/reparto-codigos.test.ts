/**
 * El código de cada línea del reparto de rolliza (Brandon, 2026-10-19: «añade
 * un código, correlativo según el bloque…; ojo es código único»). Lo que se
 * protege: que sea estable, que no se reuse y que sea único en la hoja.
 */

import { describe, expect, it } from "vitest";
import {
  REGISTRO_VACIO,
  asignarCodigos,
  compararCodigos,
  guardarRegistro,
  leerRegistro,
  normalizarRegistro,
  type LineaConBloque,
} from "@/lib/forestal/reparto-codigos";
import { textoParaCopiar } from "@/components/admin/forestal/cifra-copiable";

const L = (bloqueId: string, tipo: string, dia = 1): LineaConBloque => ({ clave: `${bloqueId}|d${dia}|${tipo}`, bloqueId });

const HOJA = [L("a", "Comercial"), L("a", "Corta"), L("a", "Larga angosta"), L("b", "Comercial"), L("c", "Corta")];

describe("asignarCodigos", () => {
  it("numera los bloques en el orden de la lista y el correlativo con 2 dígitos", () => {
    const r = asignarCodigos(REGISTRO_VACIO, ["a", "b", "c"], HOJA);
    expect(HOJA.map((l) => r.lineas[l.clave])).toEqual(["1-01", "1-02", "1-03", "2-01", "3-01"]);
    expect(r.bloques).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("es estable: reordenar, filtrar o tildar no cambia ningún código", () => {
    const r1 = asignarCodigos(REGISTRO_VACIO, ["a", "b", "c"], HOJA);
    /* Otro orden de bloques y de líneas, y sólo una parte (un filtro). */
    const r2 = asignarCodigos(r1, ["c", "b", "a"], [...HOJA].reverse());
    const r3 = asignarCodigos(r1, ["a"], HOJA.slice(0, 2));
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
  });

  it("un tipo nuevo toma el siguiente número; uno borrado no se reusa", () => {
    const r1 = asignarCodigos(REGISTRO_VACIO, ["a", "b"], HOJA.slice(0, 4));
    /* Se borra «Corta» del bloque a (1-02) y entra «Corta ancha». */
    const sinCorta = HOJA.slice(0, 4).filter((l) => !l.clave.endsWith("|Corta"));
    const r2 = asignarCodigos(r1, ["a", "b"], [...sinCorta, L("a", "Corta ancha")]);
    expect(r2.lineas["a|d1|Corta ancha"]).toBe("1-04");
    expect(Object.values(r2.lineas)).not.toContain("1-05");
    expect(r2.lineas["a|d1|Comercial"]).toBe("1-01");
  });

  it("un bloque nuevo toma el siguiente número aunque se haya borrado uno", () => {
    const r1 = asignarCodigos(REGISTRO_VACIO, ["a", "b"], HOJA.slice(0, 4));
    /* Se borra el bloque b (2) y se agrega d: es el 3, no el 2. */
    const r2 = asignarCodigos(r1, ["a", "d"], [...HOJA.slice(0, 3), L("d", "Comercial")]);
    expect(r2.bloques.d).toBe(3);
    expect(r2.lineas["d|d1|Comercial"]).toBe("3-01");
  });

  it("es único en toda la hoja, también con días distintos del mismo tipo", () => {
    const lineas = [...HOJA, L("a", "Comercial", 2), L("b", "Comercial", 2)];
    const r = asignarCodigos(REGISTRO_VACIO, ["a", "b", "c"], lineas);
    const codigos = lineas.map((l) => r.lineas[l.clave]);
    expect(new Set(codigos).size).toBe(codigos.length);
  });
});

describe("guardado", () => {
  const almacen = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("lo guardado vuelve igual y sigue sin reusar", () => {
    const s = almacen();
    const r1 = asignarCodigos(REGISTRO_VACIO, ["a", "b"], HOJA.slice(0, 4));
    guardarRegistro(s, "k", r1);
    const leido = leerRegistro(s, "k");
    expect(leido).toEqual(r1);
    expect(asignarCodigos(leido, ["a", "b"], HOJA.slice(0, 4))).toBe(leido);
  });

  it("si el contador llegó a medias, sube a lo más alto ya usado", () => {
    const r = normalizarRegistro({ bloques: { a: 1 }, sigBloque: 0, lineas: { x: "1-07" }, sigLinea: {} });
    expect(r.sigBloque).toBe(1);
    expect(asignarCodigos(r, ["a"], [L("a", "Nueva")]).lineas["a|d1|Nueva"]).toBe("1-08");
  });

  it("basura o vacío = registro vacío", () => {
    expect(normalizarRegistro("x")).toBe(REGISTRO_VACIO);
    expect(leerRegistro(almacen(), "nada")).toBe(REGISTRO_VACIO);
  });
});

it("ordena 1-02 antes que 1-10 y que 2-01; sin código al final", () => {
  expect(["2-01", null, "1-10", "1-02"].sort(compararCodigos)).toEqual(["1-02", "1-10", "2-01", null]);
});

it("copia sin separador de miles: m³ con 3 decimales, piezas enteras", () => {
  expect(textoParaCopiar(11586.4, "m3")).toBe("11586.400");
  expect(textoParaCopiar(0.5, "m3")).toBe("0.500");
  expect(textoParaCopiar(1396, "piezas")).toBe("1396");
  expect(textoParaCopiar(12.345, "piezas")).toBe("12.35");
});
