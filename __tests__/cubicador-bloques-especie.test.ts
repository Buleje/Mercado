/**
 * __tests__/cubicador-bloques-especie.test.ts
 *
 * La especie por bloques (Brandon, 2026-09-22): ordenar la tabla en bloques,
 * volver al orden dictado, dictar «panguana» sin el «especie» delante y leer
 * «Continúa con panguana» una sola vez por tramo.
 */
import { describe, expect, it } from "vitest";
import {
  agruparPorEspecie,
  claveDeDictado,
  empiezaBloque,
  especieAlInicio,
  largoDelTramo,
  ordenDeDictado,
  ordenarFilas,
  textoPorTramos,
  ultimaDictada,
  type PosicionEnLectura,
} from "@/lib/forestal/cubicador-bloques-especie";

interface F { id: string; especie?: string; m: string }
/** Una fila con id de dictado `p-<ms>-<n>` y una medida para reconocerla. */
const f = (ms: number, n: number, especie: string | undefined, m: string): F => ({ id: `p-${ms}-${n}`, especie, m });
const medidas = (xs: F[]) => xs.map((x) => x.m);

describe("orden de dictado", () => {
  it("lee milisegundo y contador del id", () => {
    expect(claveDeDictado("p-1700000000000-3")).toEqual([1700000000000, 3]);
    expect(claveDeDictado("t-5-0")).toEqual([5, 0]);
    expect(claveDeDictado("imp-t-7-2")).toEqual([7, 2]);
    expect(claveDeDictado("ocr-t-9-0")).toEqual([9, 0]);
    expect(claveDeDictado("otra-cosa")).toBeNull();
  });

  it("vuelve al orden en que se anotó, con el contador como desempate del mismo milisegundo", () => {
    const tabla = [f(20, 0, "Tornillo", "c"), f(10, 1, "Panguana", "b"), f(10, 0, "Tornillo", "a"), f(30, 0, undefined, "d")];
    expect(medidas(ordenDeDictado(tabla))).toEqual(["a", "b", "c", "d"]);
  });

  it("un id sin forma conocida hereda el lugar de la fila de delante, no salta a la punta", () => {
    const tabla: F[] = [f(10, 0, "A", "a"), { id: "rara", especie: "A", m: "x" }, f(20, 0, "A", "b")];
    expect(medidas(ordenDeDictado(tabla))).toEqual(["a", "x", "b"]);
  });
});

describe("agrupar por especie", () => {
  const dictado = [
    f(1, 0, "Panguana", "p1"),
    f(2, 0, "Tornillo", "t1"),
    f(3, 0, "Panguana", "p2"),
    f(4, 0, undefined, "s1"),
    f(5, 0, "TORNILLO", "t2"),
    f(6, 0, "Cumala", "c1"),
  ];

  it("bloques en el orden en que apareció cada especie; «sin especie» al final; mayúsculas no parten el bloque", () => {
    expect(medidas(agruparPorEspecie(dictado))).toEqual(["p1", "p2", "t1", "t2", "c1", "s1"]);
  });

  it("es idempotente", () => {
    const una = agruparPorEspecie(dictado);
    expect(medidas(agruparPorEspecie(una))).toEqual(medidas(una));
  });

  it("una pieza nueva cae al final de su bloque, no al final de la tabla", () => {
    const agrupada = agruparPorEspecie(dictado);
    const conNueva = [...agrupada, f(7, 0, "Panguana", "p3")];
    expect(medidas(agruparPorEspecie(conNueva))).toEqual(["p1", "p2", "p3", "t1", "t2", "c1", "s1"]);
  });

  it("una fila duplicada queda debajo de su original (manda el orden actual adentro del bloque)", () => {
    const agrupada = agruparPorEspecie(dictado);
    const i = agrupada.findIndex((x) => x.m === "p1");
    const conCopia = [...agrupada.slice(0, i + 1), f(9, 0, "Panguana", "p1-copia"), ...agrupada.slice(i + 1)];
    expect(medidas(agruparPorEspecie(conCopia)).slice(0, 3)).toEqual(["p1", "p1-copia", "p2"]);
  });

  it("corregir la especie de una fila del medio la lleva a su bloque sin mover los demás", () => {
    const agrupada = agruparPorEspecie(dictado).map((x) => (x.m === "p2" ? { ...x, especie: "Cumala" } : x));
    expect(medidas(agruparPorEspecie(agrupada))).toEqual(["p1", "t1", "t2", "p2", "c1", "s1"]);
  });

  it("corregir la PRIMERA pieza de un bloque puede adelantar a la especie nueva (se dictó antes)", () => {
    const agrupada = agruparPorEspecie(dictado).map((x) => (x.m === "t1" ? { ...x, especie: "Cumala" } : x));
    expect(medidas(agruparPorEspecie(agrupada))).toEqual(["p1", "p2", "t1", "c1", "t2", "s1"]);
  });

  it("volver a «como se dictó» recupera el orden original", () => {
    expect(medidas(ordenarFilas(agruparPorEspecie(dictado), "dictado"))).toEqual(medidas(dictado));
  });

  it("«elimina el último» apunta a la última anotada, aunque la tabla esté agrupada", () => {
    const agrupada = agruparPorEspecie(dictado);
    expect(agrupada[agrupada.length - 1].m).toBe("s1");
    expect(ultimaDictada(agrupada)?.m).toBe("c1");
  });

  it("empiezaBloque marca el cambio de especie contra la fila de arriba", () => {
    expect(empiezaBloque(f(2, 0, "Tornillo", ""), f(1, 0, "Panguana", ""))).toBe(true);
    expect(empiezaBloque(f(2, 0, "tornillo", ""), f(1, 0, "TORNILLO", ""))).toBe(false);
    expect(empiezaBloque(f(1, 0, "Tornillo", ""), undefined)).toBe(false);
  });
});

describe("leer por tramos", () => {
  const lista = [
    f(1, 0, "Panguana", "2, 4, 10"),
    f(2, 0, "Panguana", "2, 6, 10"),
    f(3, 0, "Panguana", "2, 8, 10"),
    f(4, 0, "Tornillo", "1, 4, 8"),
    f(5, 0, "Cumala", "3, 3, 12"),
    f(6, 0, "Cumala", "3, 4, 12"),
    f(7, 0, undefined, "1, 1, 1"),
  ];
  const pos = (indice: number, extra: Partial<PosicionEnLectura<F>> = {}): PosicionEnLectura<F> => ({ indice, lista, haciaAtras: false, primera: false, ...extra });
  const texto = (indice: number, extra: Partial<PosicionEnLectura<F>> = {}) => textoPorTramos(lista[indice], pos(indice, extra), (x) => x.m);

  it("mide el tramo de la fila", () => {
    expect(largoDelTramo(lista, 1)).toBe(3);
    expect(largoDelTramo(lista, 3)).toBe(1);
    expect(largoDelTramo(lista, 6)).toBe(0);
  });

  it("al derecho: anuncia al entrar a cada tramo, después sólo medidas; la suelta lleva su especie", () => {
    const leido = lista.map((_, i) => texto(i, { primera: i === 0 }));
    expect(leido).toEqual([
      "Continúa con Panguana. 2, 4, 10",
      "2, 6, 10",
      "2, 8, 10",
      "1, 4, 8, Tornillo",
      "Continúa con Cumala. 3, 3, 12",
      "3, 4, 12",
      "Sin especie. 1, 1, 1",
    ]);
  });

  it("una fila sin especie tras un tramo se anuncia: si no, sonaría como una más del tramo", () => {
    expect(texto(6)).toBe("Sin especie. 1, 1, 1");
    // al arrancar justo en ella no se escuchó ningún tramo antes
    expect(texto(6, { primera: true })).toBe("1, 1, 1");
    // tras una fila suelta (que ya dijo su especie) no hace falta
    const suelta = [f(1, 0, "Tornillo", "1, 4, 8"), f(2, 0, undefined, "1, 1, 1")];
    expect(textoPorTramos(suelta[1], { indice: 1, lista: suelta, haciaAtras: false, primera: false }, (x) => x.m)).toBe("1, 1, 1");
  });

  it("al revés: el tramo empieza por abajo", () => {
    expect(texto(5, { haciaAtras: true })).toBe("Continúa con Cumala. 3, 4, 12");
    expect(texto(4, { haciaAtras: true })).toBe("3, 3, 12");
    expect(texto(2, { haciaAtras: true })).toBe("Continúa con Panguana. 2, 8, 10");
    expect(texto(0, { haciaAtras: true })).toBe("2, 4, 10");
  });

  it("arrancar o retomar a mitad de un tramo vuelve a decir la especie", () => {
    expect(texto(1)).toBe("2, 6, 10");
    expect(texto(1, { primera: true })).toBe("Continúa con Panguana. 2, 6, 10");
  });
});

describe("dictar la especie sola", () => {
  const catalogo = ["Panguana", "Cumala", "Cumala Blanca", "Cedro", "Tornillo (Cedrelinga cateniformis)"];

  it("«panguana» sola cambia la especie y no deja números", () => {
    expect(especieAlInicio("panguana", catalogo)).toEqual({ especie: "Panguana", resto: "" });
  });

  it("especie y medidas en la misma frase: el resto queda con el texto original", () => {
    expect(especieAlInicio("Panguana dos cuatro diez", catalogo)).toEqual({ especie: "Panguana", resto: "dos cuatro diez" });
    expect(especieAlInicio("tornillo, veintitrés", catalogo)).toEqual({ especie: "Tornillo (Cedrelinga cateniformis)", resto: "veintitrés" });
  });

  it("gana la especie de más palabras", () => {
    expect(especieAlInicio("cumala blanca 2 8 10", catalogo)?.especie).toBe("Cumala Blanca");
    expect(especieAlInicio("cumala 2 8 10", catalogo)?.especie).toBe("Cumala");
  });

  it("palabra entera, sin tildes ni mayúsculas que la escondan; una especie en el medio no cuenta", () => {
    expect(especieAlInicio("cedrón 2 4 8", catalogo)).toBeNull();
    expect(especieAlInicio("CEDRO", catalogo)?.especie).toBe("Cedro");
    expect(especieAlInicio("dos cuatro panguana", catalogo)).toBeNull();
    expect(especieAlInicio("", catalogo)).toBeNull();
  });
});
