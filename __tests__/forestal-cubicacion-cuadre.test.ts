import { describe, expect, it } from "vitest";
import {
  cuadrarConLibro,
  cuadrarConjunto,
  tonoGeneral,
  TOLERANCIA_M3,
  type FilaDeclarada,
} from "@/lib/forestal/cubicacion-cuadre";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

/** Una tabla de 1.5×8×10 pies (Comercial): lo que sale de verdad de una sierra. */
const pieza = (over: Partial<PiezaCubicada> = {}): PiezaCubicada => ({
  id: "p1",
  cantidad: 10,
  espesor: 1.5,
  ancho: 8,
  largo: 10,
  uEspesor: "pulg",
  uAncho: "pulg",
  uLargo: "pies",
  especie: "Tornillo",
  pieTablar: 100,
  m3: 0.236,
  ...over,
});

const de = (campo: string, avisos: ReturnType<typeof cuadrarConLibro>) => avisos.find((a) => a.campo === campo);

describe("cuadrarConLibro — la cinta contra el asiento", () => {
  it("sin piezas no inventa un veredicto", () => {
    expect(cuadrarConLibro([], { piezas: 10, volumenM3: 1 })).toEqual([]);
  });

  it("todo coincide: dice que cuadra, no se queda callado", () => {
    const avisos = cuadrarConLibro([pieza()], {
      producto: "MADERA ASERRADA (COMERCIAL)",
      especie: "Tornillo",
      piezas: 10,
      volumenM3: 0.236,
    });
    expect(tonoGeneral(avisos)).toBe("ok");
    expect(de("volumen", avisos)?.tono).toBe("ok");
    expect(de("piezas", avisos)?.tono).toBe("ok");
  });

  it("diez litros de diferencia son la misma pila medida dos veces", () => {
    const avisos = cuadrarConLibro([pieza({ m3: 0.3146 })], { volumenM3: 0.3146 + TOLERANCIA_M3 });
    expect(de("volumen", avisos)?.tono).toBe("ok");
  });

  it("medir de MÁS que lo declarado avisa y dice por qué importa", () => {
    const avisos = cuadrarConLibro([pieza({ m3: 0.5 })], { volumenM3: 0.3146 });
    const v = de("volumen", avisos);
    expect(v?.tono).toBe("error"); // 59 % de diferencia
    expect(v?.delta).toBeCloseTo(0.1854, 4);
    expect(v?.texto).toContain("sin amparo");
  });

  it("una diferencia chica avisa sin gritar", () => {
    // 2 % de diferencia: hay que mirarlo, no es una alarma.
    const avisos = cuadrarConLibro([pieza({ m3: 1.02 })], { volumenM3: 1 });
    expect(de("volumen", avisos)?.tono).toBe("aviso");
  });

  it("las piezas se cuentan con la mano: una de más ya se dice", () => {
    const avisos = cuadrarConLibro([pieza({ cantidad: 11 })], { piezas: 10 });
    expect(de("piezas", avisos)?.delta).toBe(1);
    expect(de("piezas", avisos)?.tono).toBe("aviso");
  });

  it("otra especie es error: la guía ampara la que dice el asiento", () => {
    const avisos = cuadrarConLibro([pieza({ especie: "Capirona" })], { especie: "Tornillo" });
    expect(de("especie", avisos)?.tono).toBe("error");
  });

  it("sin especie cargada pide cargarla, no la da por buena", () => {
    const avisos = cuadrarConLibro([pieza({ especie: undefined })], { especie: "Tornillo" });
    expect(de("especie", avisos)?.tono).toBe("aviso");
  });

  it("el tipo se compara por palabra: «Paq. corta» ES «PAQUETERIA CORTA»", () => {
    // 6×6×3 pies cae en paquetería corta según `tipoDePieza`.
    const paq = pieza({ espesor: 6, ancho: 6, largo: 3, cantidad: 58 });
    const avisos = cuadrarConLibro([paq], { producto: "MADERA ASERRADA (PAQUETERIA CORTA)" });
    expect(de("tipo", avisos)?.tono).toBe("ok");
  });

  it("un tipo ajeno al producto declarado se nombra", () => {
    const paq = pieza({ espesor: 6, ancho: 6, largo: 3, cantidad: 58 });
    const avisos = cuadrarConLibro([paq], { producto: "MADERA ASERRADA (TABLILLAS)" });
    expect(de("tipo", avisos)?.tono).toBe("aviso");
  });

  it("lo que el libro no declara no se compara", () => {
    const avisos = cuadrarConLibro([pieza()], {});
    expect(avisos).toEqual([]);
  });
});

describe("cuadrarConjunto — una cubicación contra varias filas del libro", () => {
  const fila = (over: Partial<FilaDeclarada> = {}): FilaDeclarada => ({
    id: "f1", etiqueta: "PQ-001", especie: "Tornillo", piezas: 10, volumenM3: 1, ...over,
  });
  const med = (especie: string, cantidad: number, m3: number): PiezaCubicada => ({
    ...pieza({ especie, cantidad, m3 }),
    id: `${especie}-${cantidad}-${m3}`,
  });

  it("agrupa por especie y cuadra cuando coincide", () => {
    const r = cuadrarConjunto([med("Tornillo", 10, 1)], [fila()]);
    expect(r.tono).toBe("ok");
    expect(r.avisos).toEqual([]);
    expect(r.total.m3Medido).toBe(1);
  });

  it("suma varias filas de la misma especie", () => {
    const r = cuadrarConjunto([med("Tornillo", 20, 2)], [fila(), fila({ id: "f2", etiqueta: "PQ-002" })]);
    expect(r.porEspecie).toHaveLength(1);
    expect(r.total.piezasDeclaradas).toBe(20);
    expect(r.tono).toBe("ok");
  });

  it("lo que sobra de una especie NO tapa lo que falta de otra", () => {
    // El total da 2 m³ de los dos lados; por especie está todo cruzado.
    const r = cuadrarConjunto(
      [med("Tornillo", 10, 2)],
      [fila({ volumenM3: 1 }), fila({ id: "f2", especie: "Capirona", piezas: 10, volumenM3: 1 })],
    );
    expect(r.total.deltaM3).toBe(0);
    expect(r.tono).not.toBe("ok");
    expect(r.avisos[0].texto).toContain("no especie por especie");
  });

  it("medir una especie que no se eligió es un error, no un aviso", () => {
    const r = cuadrarConjunto([med("Capirona", 5, 0.5)], [fila()]);
    expect(r.avisos.some((a) => a.tono === "error" && a.texto.includes("Capirona"))).toBe(true);
  });

  it("elegir una especie que no se midió también", () => {
    const r = cuadrarConjunto([med("Tornillo", 10, 1)], [fila(), fila({ id: "f2", especie: "Cachimbo", volumenM3: 3 })]);
    expect(r.avisos.some((a) => a.tono === "error" && a.texto.includes("Cachimbo"))).toBe(true);
  });

  it("las piezas sin especie se agrupan y se NOMBRAN", () => {
    const r = cuadrarConjunto([med("", 4, 0.4)], [fila({ especie: null, piezas: 4, volumenM3: 0.4 })]);
    expect(r.porEspecie[0].especie).toBe("sin especie");
    expect(r.tono).toBe("ok");
  });

  it("diez litros de diferencia siguen cuadrando", () => {
    const r = cuadrarConjunto([med("Tornillo", 10, 1.01)], [fila({ volumenM3: 1 })]);
    expect(r.porEspecie[0].tono).toBe("ok");
  });

  it("sin filas elegidas informa lo medido sin inventar un veredicto de más", () => {
    const r = cuadrarConjunto([med("Tornillo", 10, 1)], []);
    expect(r.total.m3Declarado).toBe(0);
    expect(r.avisos.some((a) => a.tono === "error")).toBe(true);
  });
});
