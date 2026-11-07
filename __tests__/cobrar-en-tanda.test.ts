/**
 * Cobrar aserrío en tanda — lo que agrega el tope de 45 s del servidor
 * (ADR-412). El servidor cobra de a 3 corridas; una tanda grande puede volver
 * con algunas `cobrado:false` por falta de tiempo, no por falta de datos.
 * Esto prueba qué corridas se pueden reintentar solas y que una pasada nueva
 * no borra lo que una pasada anterior ya cobró.
 */

import { describe, expect, it } from "vitest";
import {
  esPendientePorTiempo,
  fusionarResultadosTanda,
  podarSeleccion,
  superaUmbralDeTanda,
  UMBRAL_AVISO_TANDA,
  type ResultadoFilaTanda,
} from "@/lib/forestal/cobrar-en-tanda";

const fila = (o: Partial<ResultadoFilaTanda> = {}): ResultadoFilaTanda => ({
  id: "c1",
  lineNo: 1,
  cobrado: false,
  importe: null,
  parteNombre: null,
  motivo: null,
  ...o,
});

describe("esPendientePorTiempo", () => {
  it("una que se quedó sin tiempo se puede reintentar sola", () => {
    const f = fila({ motivo: "No alcanzó el tiempo para esta corrida: vuelve a cobrarla en otra tanda." });
    expect(esPendientePorTiempo(f)).toBe(true);
  });

  it("una que no cobró por falta de tarifa NO se ofrece para reintentar: fallaría igual", () => {
    const f = fila({ motivo: "No hay tarifa vigente para esta fecha." });
    expect(esPendientePorTiempo(f)).toBe(false);
  });

  it("una ya cobrada no es pendiente aunque el motivo esté vacío", () => {
    expect(esPendientePorTiempo(fila({ cobrado: true, importe: 120, motivo: null }))).toBe(false);
  });

  it("sin motivo (null) no es pendiente por tiempo", () => {
    expect(esPendientePorTiempo(fila({ cobrado: false, motivo: null }))).toBe(false);
  });
});

describe("fusionarResultadosTanda", () => {
  it("una pasada nueva agrega las que faltaban sin tocar las de antes", () => {
    const previos = new Map([["a", fila({ id: "a", cobrado: true, importe: 50 })]]);
    const combinado = fusionarResultadosTanda(previos, [fila({ id: "b", cobrado: true, importe: 30 })]);
    expect(combinado.size).toBe(2);
    expect(combinado.get("a")?.importe).toBe(50);
    expect(combinado.get("b")?.importe).toBe(30);
  });

  it("una corrida que se reintenta y esta vez cobra reemplaza su fila vieja de 'sin tiempo'", () => {
    const previos = new Map([
      ["a", fila({ id: "a", cobrado: true, importe: 50 })],
      ["b", fila({ id: "b", cobrado: false, motivo: "No alcanzó el tiempo para esta corrida: vuelve a cobrarla en otra tanda." })],
    ]);
    const combinado = fusionarResultadosTanda(previos, [fila({ id: "b", cobrado: true, importe: 70 })]);
    expect(combinado.get("a")?.cobrado).toBe(true);
    expect(combinado.get("b")?.cobrado).toBe(true);
    expect(combinado.get("b")?.importe).toBe(70);
  });

  it("no muta el mapa previo (inmutable)", () => {
    const previos = new Map([["a", fila({ id: "a" })]]);
    fusionarResultadosTanda(previos, [fila({ id: "b" })]);
    expect(previos.size).toBe(1);
  });
});

describe("superaUmbralDeTanda", () => {
  it(`avisa por encima de ${UMBRAL_AVISO_TANDA}`, () => {
    expect(superaUmbralDeTanda(UMBRAL_AVISO_TANDA)).toBe(false);
    expect(superaUmbralDeTanda(UMBRAL_AVISO_TANDA + 1)).toBe(true);
  });

  it("no avisa con una tanda chica (las 14 del tenant real)", () => {
    expect(superaUmbralDeTanda(14)).toBe(false);
  });
});

describe("podarSeleccion — cambiar período/búsqueda/filtro/página no puede dejar cobrando lo que no se ve (MEDIO 2026-09-14)", () => {
  it("saca de la selección lo que ya no está visible", () => {
    const seleccion = new Set(["a", "b", "c"]);
    const podada = podarSeleccion(seleccion, ["b", "c", "d"]);
    expect(podada).toEqual(new Set(["b", "c"]));
  });

  it("no resucita nada: sólo saca, nunca agrega", () => {
    const podada = podarSeleccion(new Set(["a"]), ["a", "z"]);
    expect(podada).toEqual(new Set(["a"]));
  });

  it("si todo lo marcado sigue visible, devuelve el MISMO Set (sin re-render de más)", () => {
    const seleccion = new Set(["a", "b"]);
    expect(podarSeleccion(seleccion, ["a", "b", "c"])).toBe(seleccion);
  });

  it("una selección vacía se queda vacía sin tocar nada", () => {
    const vacia = new Set<string>();
    expect(podarSeleccion(vacia, [])).toBe(vacia);
  });

  it("cambiar de página a una sin ninguna de las marcadas deja la selección vacía", () => {
    expect(podarSeleccion(new Set(["a", "b"]), ["x", "y"])).toEqual(new Set());
  });
});
