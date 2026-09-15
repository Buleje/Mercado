/**
 * Dictado por voz del cubicador: fracciones de pulgada, centenas, el "por"
 * como separador, el desempate por lo que esta sierra ya cortó y los
 * homófonos del motor es-PE.
 *
 * Las frases son las que se dicen en el patio de Pucallpa mientras se mide la
 * pila. Regla del archivo que estos tests protegen: ante la duda NO se inventa
 * una medida, y los números de una hipótesis NUNCA se reordenan.
 */
import { describe, it, expect } from "vitest";
import {
  cubicarPieza,
  detectarComando,
  escuadriasFrecuentes,
  esEco,
  leerDictado,
  medidaSospechosa,
  mejoresNumeros,
  parseDictado,
  partirConFijas,
  type Escuadria,
  type PiezaCubicada,
} from "@/lib/forestal/cubicacion";

const nums = (frase: string, ...resto: [] | [Parameters<typeof leerDictado>[1]]) =>
  leerDictado(frase, ...resto).nums;

describe("fracciones de pulgada (media pulgada = ~6 % del volumen declarado)", () => {
  it('"dos y medio por ocho por diez" → 2.5 · 8 · 10', () => {
    expect(nums("dos y medio por ocho por diez")).toEqual([2.5, 8, 10]);
  });

  it('"una y cuarto" y "dos y tres cuartos" entran enteras', () => {
    expect(nums("una y cuarto por seis por ocho")).toEqual([1.25, 6, 8]);
    expect(nums("dos y tres cuartos por ocho por diez")).toEqual([2.75, 8, 10]);
  });

  it("la fracción suelta también: tres cuartos, un cuarto, media pulgada", () => {
    expect(nums("tres cuartos por seis por ocho")).toEqual([0.75, 6, 8]);
    expect(nums("un cuarto por seis por ocho")).toEqual([0.25, 6, 8]);
    expect(nums("media pulgada por ocho por diez")).toEqual([0.5, 8, 10]);
  });

  it('el "y" de las decenas sigue siendo decena: "treinta y cinco piezas" son 35', () => {
    expect(leerDictado("treinta y cinco piezas de dos por ocho por diez"))
      .toEqual({ cantidad: 35, nums: [2, 8, 10] });
    expect(parseDictado("cuarenta y dos piezas de dos por ocho por diez").cantidad).toBe(42);
  });

  it("la fracción llega hasta la fila de la tabla (no se redondea por el camino)", () => {
    const { piezas } = partirConFijas(nums("dos y medio por ocho por diez"), {});
    expect(piezas).toEqual([{ espesor: 2.5, ancho: 8, largo: 10 }]);
    // PT = 2.5" × 8" × 10' / 12. Con la fracción perdida (2") serían 13.33 PT.
    expect(cubicarPieza({ cantidad: 1, ...piezas[0], uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" }).pieTablar)
      .toBeCloseTo(16.67, 2);
  });

  it("una tabla de media pulgada ya no se marca como rara (era un rojo falso)", () => {
    expect(medidaSospechosa(0.5, 8, 10)).toBe(false);
    expect(medidaSospechosa(0.75, 6, 8)).toBe(false);
    expect(medidaSospechosa(0.25, 8, 10)).toBe(true); // un cuarto de pulgada no es una tabla
  });
});

describe("centenas: la CANTIDAD de piezas se dicta hablada", () => {
  it('"ciento veinte piezas de dos por ocho" → 120 piezas, medidas 2 y 8', () => {
    expect(leerDictado("ciento veinte piezas de dos por ocho")).toEqual({ cantidad: 120, nums: [2, 8] });
  });

  it("se componen con las decenas y las unidades que ya existían", () => {
    expect(leerDictado("doscientos cincuenta piezas de dos por ocho por diez").cantidad).toBe(250);
    expect(leerDictado("ciento treinta y cinco tablas de dos por ocho por diez").cantidad).toBe(135);
    expect(leerDictado("ciento cinco piezas de dos por ocho por diez").cantidad).toBe(105);
    expect(leerDictado("cien tablas de dos por ocho por diez").cantidad).toBe(100);
  });

  it("la cantidad sigue topeada en 999 (no se inventan lotes imposibles)", () => {
    expect(leerDictado("novecientos noventa y nueve piezas de dos por ocho por diez").cantidad).toBe(999);
  });

  it("una centena sin la palabra piezas no se cuela como medida de una tabla", () => {
    // "doscientos" solo no da una escuadría: el UI cae al ingreso manual.
    expect(parseDictado("doscientos").ok).toBe(false);
  });
});

describe('"por" / "x" como separador explícito', () => {
  it("las cuatro formas dan los mismos tres números", () => {
    expect(mejoresNumeros(["2 por 8 por 10"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["2x8x10"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["2 x 8 x 10"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["2 × 8 × 10"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["12x8x10"])).toEqual([12, 8, 10]);
  });

  it("lo que vino delimitado NO se parte: se respeta y se marca", () => {
    // 35 no es un ancho creíble, pero el hablante dijo dónde termina cada
    // medida: partirlo en 3 y 5 sería inventar una tabla que nadie dictó.
    expect(mejoresNumeros(["2 por 35 por 10"])).toEqual([2, 35, 10]);
    expect(medidaSospechosa(2, 35, 10)).toBe(true);
  });

  it('si el motor se comió un "por" al pegar los dígitos, igual se separa', () => {
    // "dos por ocho por diez" dicho rápido llega como "2 por 810": no existe
    // una medida de 810, así que el delimitador no salva ese token.
    expect(mejoresNumeros(["2 por 810"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["dos por ocho diez"])).toEqual([2, 8, 10]);
  });

  it("entre dos lecturas igual de creíbles gana la que trae los separadores", () => {
    expect(mejoresNumeros(["2 6 8", "2 por 8 por 10"])).toEqual([2, 8, 10]);
    // Sin separadores en ninguna, sigue ganando la hipótesis #1 del motor.
    expect(mejoresNumeros(["2 6 8", "2 8 10"])).toEqual([2, 6, 8]);
  });

  it('el "por" mal escuchado como "para" entre dos números no pausa el dictado', () => {
    expect(mejoresNumeros(["2 para 8 para 10"])).toEqual([2, 8, 10]);
    expect(detectarComando("dos para ocho para diez")).toBeNull();
    // Dicho solo, "para" sigue siendo el comando de pausa.
    expect(detectarComando("para")?.tipo).toBe("pausar");
  });
});

describe("desempate por lo que esta sierra ya cortó", () => {
  const frecuentes: Escuadria[] = [[2, 8, 10]];

  it("desempata entre hipótesis igual de plausibles", () => {
    expect(mejoresNumeros(["2 6 8", "2 8 10"])).toEqual([2, 6, 8]);
    expect(mejoresNumeros(["2 6 8", "2 8 10"], {}, 0, { frecuentes })).toEqual([2, 8, 10]);
  });

  it("NO le gana a la lectura con más números en rango", () => {
    // 40 pies de largo no existe: aunque la escuadría "frecuente" sea esa, la
    // lectura creíble manda.
    expect(mejoresNumeros(["2 8 10", "2 8 40"], {}, 0, { frecuentes: [[2, 8, 40]] })).toEqual([2, 8, 10]);
  });

  it("nunca reemplaza un número por el de la escuadría frecuente", () => {
    expect(mejoresNumeros(["2 8 12"], {}, 0, { frecuentes })).toEqual([2, 8, 12]);
    expect(mejoresNumeros([], {}, 0, { frecuentes })).toEqual([]);
  });

  it("escuadriasFrecuentes pesa por cantidad de piezas, no por filas", () => {
    const piezas: PiezaCubicada[] = [
      fila("a", 3, 2, 6, 8),
      fila("b", 200, 2, 8, 10),
      fila("c", 2, 2, 6, 8),
      fila("d", 1, 2, 4, 10),
    ];
    expect(escuadriasFrecuentes(piezas)).toEqual([[2, 8, 10], [2, 6, 8], [2, 4, 10]]);
    expect(escuadriasFrecuentes(piezas, 2)).toEqual([[2, 8, 10], [2, 6, 8]]);
    expect(escuadriasFrecuentes([])).toEqual([]);
  });

  it("deja afuera lo que no está en la unidad del dictado ni en rango", () => {
    const enCm: PiezaCubicada = { ...fila("e", 50, 5, 20, 3), uEspesor: "cm", uAncho: "cm" };
    expect(escuadriasFrecuentes([enCm])).toEqual([]);
    expect(escuadriasFrecuentes([fila("f", 9, 2, 8, 99)])).toEqual([]);
  });

  it("la lista sale del libro y vuelve al reconocedor (vuelta completa)", () => {
    const historial: PiezaCubicada[] = [fila("g", 120, 2, 8, 10)];
    const conocidas = escuadriasFrecuentes(historial);
    expect(mejoresNumeros(["2 6 8", "2 8 10"], {}, 0, { frecuentes: conocidas })).toEqual([2, 8, 10]);
  });
});

describe("lo que el motor es-PE escucha mal", () => {
  it("las variantes sistemáticas ya no pierden la medida en silencio", () => {
    expect(mejoresNumeros(["sais por hocho por dies"])).toEqual([6, 8, 10]);
    expect(mejoresNumeros(["dos por onse por catorse"])).toEqual([2, 11, 14]);
    expect(mejoresNumeros(["dós por dose por trese"])).toEqual([2, 12, 13]);
  });

  it("no le toca la palabra a las especies ni a los comandos", () => {
    expect(detectarComando("especie catahua")).toEqual({ tipo: "especie", palabra: "catahua" });
    expect(detectarComando("especie cedro")).toEqual({ tipo: "especie", palabra: "cedro" });
    expect(detectarComando("dueño juan")).toEqual({ tipo: "dueno", palabra: "juan" });
  });
});

describe("no-regresión: lo que ya funcionaba sigue igual", () => {
  it("dígitos pegados por hablar rápido", () => {
    expect(mejoresNumeros(["2810"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["268"])).toEqual([2, 6, 8]);
    expect(mejoresNumeros(["2810258 2910"])).toEqual([2, 8, 10, 2, 5, 8, 2, 9, 10]);
    expect(mejoresNumeros(["dos catorce doce"])).toEqual([2, 14, 12]);
  });

  it('con el largo fijo en 3, "dos quince" sigue siendo 2 y 15', () => {
    const largoFijo = { largo: 3 };
    expect(mejoresNumeros(["215"], largoFijo)).toEqual([2, 15]);
    expect(mejoresNumeros(["dos quince"], largoFijo)).toEqual([2, 15]);
    expect(partirConFijas(mejoresNumeros(["215"], largoFijo), largoFijo).piezas)
      .toEqual([{ espesor: 2, ancho: 15, largo: 3 }]);
  });

  it("elegir entre hipótesis no reordena los números dictados", () => {
    expect(mejoresNumeros(["269", "9 6 2"])).toEqual([2, 6, 9]);
    expect(mejoresNumeros(["2 8 10", "10 8 2"])).toEqual([2, 8, 10]);
    expect(mejoresNumeros(["dos", "2 8 10"])).toEqual([2, 8, 10]);
  });

  it("los comandos y el eco siguen detectándose", () => {
    expect(detectarComando("pausa")?.tipo).toBe("pausar");
    expect(detectarComando("continúa")?.tipo).toBe("continuar");
    expect(detectarComando("borra el ultimo")?.tipo).toBe("borrar-ultimo");
    expect(detectarComando("pon fijo el largo a cuatro")).toEqual({ tipo: "fijar", dimension: "largo", valor: 4 });
    expect(detectarComando("quita el fijo")?.tipo).toBe("desfijar");
    expect(detectarComando("cuanto llevo")?.tipo).toBe("total");
    expect(esEco("2 8 10", "dos por ocho por diez")).toBe(true);
    expect(esEco("2 8 12", "dos por ocho por diez")).toBe(false);
  });

  it("una frase sin lectura creíble no inventa medidas", () => {
    expect(nums("la sierra esta caliente")).toEqual([]);
    expect(nums("mmm")).toEqual([]);
    expect(parseDictado("hola que tal").ok).toBe(false);
    expect(leerDictado("ciento veinte piezas de").nums).toEqual([]);
  });
});

/** Una fila ya cubicada del libro, como la guarda el cubicador. */
function fila(id: string, cantidad: number, espesor: number, ancho: number, largo: number): PiezaCubicada {
  const { pieTablar, m3 } = cubicarPieza({
    cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies",
  });
  return {
    id, cantidad, espesor, ancho, largo,
    uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", pieTablar, m3,
  };
}
