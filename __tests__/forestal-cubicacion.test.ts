import { describe, it, expect } from "vitest";
import { cubicarPieza, parseDictado, parseVozDims, mejoresNumeros, partirEnPiezas, detectarComando } from "@/lib/forestal/cubicacion";

describe("cubicarPieza", () => {
  it("pie tablar comercial 2x8x10 pulg/pulg/pies", () => {
    const r = cubicarPieza({ cantidad: 1, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" });
    expect(r.pieTablar).toBeCloseTo(13.33, 1); // 2*8*10/12
  });
  it("multiplica por cantidad y da m³ real", () => {
    const r = cubicarPieza({ cantidad: 5, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" });
    expect(r.pieTablar).toBeCloseTo(66.67, 1);
    expect(r.m3).toBeCloseTo(0.157, 2);
  });
});

describe("parseDictado", () => {
  it("frase completa con cantidad y palabras", () => {
    const p = parseDictado("cinco piezas de dos por ocho por diez");
    expect(p.ok).toBe(true);
    expect(p.cantidad).toBe(5);
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 8, 10]);
    expect([p.uEspesor, p.uAncho, p.uLargo]).toEqual(["pulg", "pulg", "pies"]);
  });
  it("sin cantidad → 1 pieza", () => {
    const p = parseDictado("dos por ocho por diez");
    expect(p.ok).toBe(true);
    expect(p.cantidad).toBe(1);
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 8, 10]);
  });
  it("dígitos crudos del reconocedor", () => {
    const p = parseDictado("2 por 8 por 10");
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 8, 10]);
  });
  it("etiquetas explícitas + largo en metros", () => {
    const p = parseDictado("espesor dos ancho ocho largo tres metros");
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 8, 3]);
    expect(p.uLargo).toBe("m");
  });
  it("decimal hablado 'uno y medio'", () => {
    const p = parseDictado("uno y medio por seis por doce");
    expect(p.espesor).toBe(1.5);
  });
  it("frase sin medidas → ok false", () => {
    expect(parseDictado("hola qué tal").ok).toBe(false);
  });
});

describe("parseVozDims (dictado continuo de 3 números)", () => {
  it("tres palabras-número: 'dos seis ocho' → 2,6,8", () => {
    const p = parseVozDims(["dos seis ocho"]);
    expect(p.ok).toBe(true);
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 6, 8]);
    expect(p.cantidad).toBe(1);
  });
  it("dígitos separados '2 6 8'", () => {
    const p = parseVozDims(["2 6 8"]);
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 6, 8]);
  });
  it("fallback: reconocedor pegó '268' → 2,6,8", () => {
    const p = parseVozDims(["268"]);
    expect(p.ok).toBe(true);
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 6, 8]);
  });
  it("elige la alternativa que sí da 3 números", () => {
    const p = parseVozDims(["doscientos", "dos seis diez"]);
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 6, 10]);
  });
  it("ancho de dos dígitos por palabra: 'dos doce diez'", () => {
    const p = parseVozDims(["dos doce diez"]);
    expect([p.espesor, p.ancho, p.largo]).toEqual([2, 12, 10]);
  });
});

describe("dictado rápido: varias piezas en una frase", () => {
  it("respeta el orden dictado: 'dos seis nueve' → 2,6,9 (no reversa)", () => {
    expect(mejoresNumeros(["dos seis nueve"])).toEqual([2, 6, 9]);
  });
  it("no elige una alternativa reordenada aunque tenga más números", () => {
    // alt[0] es la más confiable (pegó '269'); ignora la mal-escuchada '9 6 2'.
    expect(mejoresNumeros(["269", "9 6 2"])).toEqual([2, 6, 9]);
    expect(mejoresNumeros(["2 6 9", "9 6 2"])).toEqual([2, 6, 9]);
  });
  it("separa dígitos pegados en medio de la frase (dictado rápido)", () => {
    expect(mejoresNumeros(["269 dos ocho diez"])).toEqual([2, 6, 9, 2, 8, 10]);
  });
  it("respeta medidas de 2 cifras (10, 12, 14) sin separarlas", () => {
    expect(mejoresNumeros(["dos catorce doce"])).toEqual([2, 14, 12]);
  });
  it("separa tokens pegados con 10/20/30/40 (dictado continuo)", () => {
    // '2810' = 2·8·10 (no 2,8,1,0); '2910' = 2·9·10
    expect(mejoresNumeros(["2810"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["2810 258 2910"])).toEqual([2, 8, 10, 2, 5, 8, 2, 9, 10]);
    expect(mejoresNumeros(["2810258 2910"])).toEqual([2, 8, 10, 2, 5, 8, 2, 9, 10]);
  });
  it("3 medidas continuas '2 8 10 2 5 8 2 9 10' → 9 números en orden", () => {
    expect(mejoresNumeros(["dos ocho diez dos cinco ocho dos nueve diez"]))
      .toEqual([2, 8, 10, 2, 5, 8, 2, 9, 10]);
  });
  it("captura varias piezas desde la hipótesis #1", () => {
    expect(mejoresNumeros(["dos seis ocho dos ocho diez", "dos seis"])).toEqual([2, 6, 8, 2, 8, 10]);
  });
  it("parte 6 números en 2 piezas, sin resto", () => {
    const { piezas, resto } = partirEnPiezas([2, 6, 8, 2, 8, 10]);
    expect(piezas).toEqual([{ espesor: 2, ancho: 6, largo: 8 }, { espesor: 2, ancho: 8, largo: 10 }]);
    expect(resto).toEqual([]);
  });
  it("arrastra el resto (número suelto) a la siguiente frase", () => {
    const r1 = partirEnPiezas([2, 6, 8, 2]);
    expect(r1.piezas).toHaveLength(1);
    expect(r1.resto).toEqual([2]);
    const r2 = partirEnPiezas([...r1.resto, 8, 10]); // "2" arrastrado + "ocho diez"
    expect(r2.piezas).toEqual([{ espesor: 2, ancho: 8, largo: 10 }]);
    expect(r2.resto).toEqual([]);
  });
});

describe("comandos de voz", () => {
  it("pausar / continuar", () => {
    expect(detectarComando("pausa")?.tipo).toBe("pausar");
    expect(detectarComando("pausar")?.tipo).toBe("pausar");
    expect(detectarComando("continúa")?.tipo).toBe("continuar");
    expect(detectarComando("sigue")?.tipo).toBe("continuar");
  });
  it("borrar el último", () => {
    expect(detectarComando("elimina el último")?.tipo).toBe("borrar-ultimo");
    expect(detectarComando("borra el ultimo")?.tipo).toBe("borrar-ultimo");
    expect(detectarComando("deshacer")?.tipo).toBe("borrar-ultimo");
  });
  it("fijar especie por voz", () => {
    const c = detectarComando("especie tornillo");
    expect(c?.tipo).toBe("especie");
    expect(c && c.tipo === "especie" && c.palabra).toBe("tornillo");
  });
  it("un dictado de números NO es comando", () => {
    expect(detectarComando("dos seis nueve")).toBeNull();
    expect(detectarComando("2 8 10")).toBeNull();
  });
});
