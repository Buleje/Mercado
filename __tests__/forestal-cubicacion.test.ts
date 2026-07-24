import { describe, it, expect } from "vitest";
import {
  cubicarPieza, parseDictado, parseVozDims, mejoresNumeros, partirEnPiezas, detectarComando,
  leerDictado, medidaSospechosa, partirConFijas, numerosPorPieza,
} from "@/lib/forestal/cubicacion";

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

describe("comandos de resumen y total por voz", () => {
  it("cambia la dimensión del resumen con gatillo + dimensión", () => {
    expect(detectarComando("muéstrame por especie")).toEqual({ tipo: "resumen", dimension: "especie" });
    expect(detectarComando("resumen por largo")).toEqual({ tipo: "resumen", dimension: "largo" });
    expect(detectarComando("agrupa por sección")).toEqual({ tipo: "resumen", dimension: "seccion" });
    expect(detectarComando("agrupame por espesor")).toEqual({ tipo: "resumen", dimension: "espesor" });
  });
  it("'muéstrame por especie' gana sobre el comando de especie", () => {
    // sin el gatillo de resumen, "especie X" fija la especie
    expect(detectarComando("especie tornillo")?.tipo).toBe("especie");
    // con gatillo, es resumen (no intenta fijar especie)
    expect(detectarComando("muéstrame por especie")?.tipo).toBe("resumen");
  });
  it("gatillo de resumen sin dimensión abre el resumen tal cual", () => {
    expect(detectarComando("resumen")).toEqual({ tipo: "resumen", dimension: "" });
  });
  it("dice el total con las frases de total", () => {
    expect(detectarComando("cuánto llevo")?.tipo).toBe("total");
    expect(detectarComando("lee el total")?.tipo).toBe("total");
    expect(detectarComando("dame el total")?.tipo).toBe("total");
  });
  it("un dictado de medidas no dispara resumen ni total", () => {
    expect(detectarComando("2 8 10")).toBeNull();
    expect(detectarComando("dos por ocho por diez")).toBeNull();
  });
});

describe("bugs de campo del dictado (regresión)", () => {
  it('dictar "dos PARA ocho" ya no pausa — el reconocedor confunde el "por"', () => {
    expect(detectarComando("dos para ocho por diez")).toBeNull();
    expect(detectarComando("cuatro por seis alto")).toBeNull();
    expect(detectarComando("2 8 10 sigue")).toBeNull();
  });

  it("un comando dicho SOLO sigue funcionando", () => {
    expect(detectarComando("pausa")?.tipo).toBe("pausar");
    expect(detectarComando("continúa")?.tipo).toBe("continuar");
    expect(detectarComando("borra el ultimo")?.tipo).toBe("borrar-ultimo");
    expect(detectarComando("especie tornillo")?.tipo).toBe("especie");
  });

  it("números pegados: 2812 es 2·8·12, no 2·8·1 + 2 huérfano", () => {
    expect(mejoresNumeros(["2812"])).toEqual([2, 8, 12]);
    expect(mejoresNumeros(["2814"])).toEqual([2, 8, 14]);
    expect(mejoresNumeros(["2810"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["268"])).toEqual([2, 6, 8]);
  });

  it("números pegados sin lectura creíble caen a dígitos sueltos (no inventa)", () => {
    // 9999 no da ninguna medida válida de madera.
    expect(mejoresNumeros(["9999"]).length).toBeGreaterThan(0);
  });

  it("la cantidad dictada no se confunde con el espesor", () => {
    expect(leerDictado("cinco piezas de dos por ocho por diez")).toEqual({ cantidad: 5, nums: [2, 8, 10] });
    expect(leerDictado("3 tablas 2 6 8")).toEqual({ cantidad: 3, nums: [2, 6, 8] });
  });

  it("sin la palabra piezas, todo son medidas", () => {
    expect(leerDictado("dos ocho diez")).toEqual({ cantidad: 1, nums: [2, 8, 10] });
  });

  it("medidas fuera de rango se marcan (nunca se corrigen solas)", () => {
    expect(medidaSospechosa(2, 8, 10)).toBe(false);
    expect(medidaSospechosa(2, 8, 1)).toBe(true);    // largo de 1 pie
    expect(medidaSospechosa(20, 8, 10)).toBe(true);  // espesor de 20 pulgadas
    expect(medidaSospechosa(8, 2, 10)).toBe(true);   // más gruesa que ancha = dado vuelta
  });
});

describe("medidas fijas por voz", () => {
  it('"pon fijo el largo a cuatro" fija el largo', () => {
    const c = detectarComando("pon fijo el largo a cuatro");
    expect(c).toEqual({ tipo: "fijar", dimension: "largo", valor: 4 });
  });

  it("acepta las formas que usa un maderero", () => {
    expect(detectarComando("fija el largo en cuatro")).toEqual({ tipo: "fijar", dimension: "largo", valor: 4 });
    expect(detectarComando("largo fijo 4")).toEqual({ tipo: "fijar", dimension: "largo", valor: 4 });
    expect(detectarComando("fijar espesor dos")).toEqual({ tipo: "fijar", dimension: "espesor", valor: 2 });
    expect(detectarComando("pon fijo el ancho a ocho")).toEqual({ tipo: "fijar", dimension: "ancho", valor: 8 });
    expect(detectarComando("fija el largo a tres punto cinco")).toEqual({ tipo: "fijar", dimension: "largo", valor: 3.5 });
  });

  it("desfijar: todo o una sola dimensión", () => {
    expect(detectarComando("quita el fijo")).toEqual({ tipo: "desfijar", dimension: undefined });
    expect(detectarComando("desfija el largo")).toEqual({ tipo: "desfijar", dimension: "largo" });
    expect(detectarComando("libera el espesor")).toEqual({ tipo: "desfijar", dimension: "espesor" });
    expect(detectarComando("todo libre")).toEqual({ tipo: "desfijar", dimension: undefined });
  });

  it("sin dimensión o sin valor no fija nada (no adivina)", () => {
    expect(detectarComando("pon fijo a cuatro")).toBeNull();
    expect(detectarComando("fija el largo")).toBeNull();
  });

  it("dictar medidas nunca se confunde con fijar", () => {
    expect(detectarComando("dos ocho diez")).toBeNull();
    expect(detectarComando("2 8 10")).toBeNull();
  });

  it("con el largo fijo, cada DOS números son una pieza", () => {
    const r = partirConFijas([2, 8, 2, 6, 2, 10], { largo: 4 });
    expect(r.piezas).toEqual([
      { espesor: 2, ancho: 8, largo: 4 },
      { espesor: 2, ancho: 6, largo: 4 },
      { espesor: 2, ancho: 10, largo: 4 },
    ]);
    expect(r.resto).toEqual([]);
  });

  it("el sobrante se arrastra igual que sin fijas", () => {
    const r = partirConFijas([2, 8, 2], { largo: 4 });
    expect(r.piezas).toHaveLength(1);
    expect(r.resto).toEqual([2]);
  });

  it("con espesor fijo, los libres siguen el orden ancho → largo", () => {
    const r = partirConFijas([8, 10], { espesor: 2 });
    expect(r.piezas).toEqual([{ espesor: 2, ancho: 8, largo: 10 }]);
  });

  it("con dos fijas, cada número suelto es una pieza", () => {
    const r = partirConFijas([8, 6, 10], { espesor: 2, largo: 4 });
    expect(r.piezas).toEqual([
      { espesor: 2, ancho: 8, largo: 4 },
      { espesor: 2, ancho: 6, largo: 4 },
      { espesor: 2, ancho: 10, largo: 4 },
    ]);
  });

  it("con las tres fijas no inventa piezas", () => {
    const r = partirConFijas([5, 5], { espesor: 2, ancho: 8, largo: 4 });
    expect(r.piezas).toEqual([]);
    expect(r.resto).toEqual([5, 5]);
  });

  it("numerosPorPieza dice cuántos hay que dictar", () => {
    expect(numerosPorPieza({})).toBe(3);
    expect(numerosPorPieza({ largo: 4 })).toBe(2);
    expect(numerosPorPieza({ espesor: 2, largo: 4 })).toBe(1);
  });

  it("sin fijas, partirEnPiezas sigue funcionando igual", () => {
    expect(partirEnPiezas([2, 6, 8, 2, 8, 10]).piezas).toHaveLength(2);
  });
});

describe("dictar con medidas fijas: números pegados y de dos cifras (regresión)", () => {
  const largoFijo = { largo: 4 };

  it('con el largo fijo, "dos quince" pegado como "215" es 2 y 15 (no 2·1·5)', () => {
    expect(mejoresNumeros(["215"], largoFijo)).toEqual([2, 15]);
    expect(partirConFijas(mejoresNumeros(["215"], largoFijo), largoFijo).piezas)
      .toEqual([{ espesor: 2, ancho: 15, largo: 4 }]);
  });

  it('con el largo fijo, "dos ocho" pegado como "28" es 2 y 8 (28 no es un espesor)', () => {
    expect(mejoresNumeros(["28"], largoFijo)).toEqual([2, 8]);
  });

  it("con el largo fijo, 2 y 12 pegados", () => {
    expect(mejoresNumeros(["212"], largoFijo)).toEqual([2, 12]);
  });

  it("respeta un valor de dos cifras que SÍ es creíble para su medida", () => {
    // Ya se dictó el espesor: toca el ancho, y 15 es un ancho normal.
    expect(mejoresNumeros(["15"], largoFijo, 1)).toEqual([15]);
    // Sin fijas y con dos números esperando: toca el largo.
    expect(mejoresNumeros(["15"], {}, 2)).toEqual([15]);
  });

  it("2 · 15 · 15 entra bien, junto o separado", () => {
    expect(mejoresNumeros(["21515"])).toEqual([2, 15, 15]);
    expect(mejoresNumeros(["2 15 15"])).toEqual([2, 15, 15]);
    expect(partirEnPiezas([2, 15, 15]).piezas).toEqual([{ espesor: 2, ancho: 15, largo: 15 }]);
  });

  it("elige la hipótesis que trae la medida completa", () => {
    // El motor a veces devuelve primero una lectura truncada.
    expect(mejoresNumeros(["dos", "2 8 10"])).toEqual([2, 8, 10]);
    // O una sin números (ruido del aserradero).
    expect(mejoresNumeros(["mmm", "2 8 10"])).toEqual([2, 8, 10]);
  });

  it("ante empate se queda con la hipótesis principal (no reordena)", () => {
    expect(mejoresNumeros(["2 8 10", "10 8 2"])).toEqual([2, 8, 10]);
  });

  it("una lectura imposible no se fuerza: devuelve los dígitos como vinieron", () => {
    const r = mejoresNumeros(["9999"]);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((n) => n > 0)).toBe(true);
  });
});
