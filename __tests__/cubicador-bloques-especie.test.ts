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
  FUERA_PARA_SOLTAR,
  largoDelTramo,
  largoFijoEn,
  MINIMO_RACHA_LARGO,
  ordenDeDictado,
  ordenarFilas,
  textoPorTramos,
  ultimaDictada,
  unidadDeLargoEnVoz,
  type LargoEnLectura,
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

/**
 * Largo fijo al leer (Brandon, 2026-09-23): «si el 7 de largo se repite
 * continuamente, que diga la especie con largo fijo de 7 pies y después sólo
 * espesor y ancho».
 */
describe("leer con largo fijo", () => {
  interface P { id: string; especie?: string; e: number; a: number; l: number; u?: "pies" | "m" }
  let n = 0;
  const p = (especie: string | undefined, e: number, a: number, l: number, u?: "pies" | "m"): P => ({ id: `p-${++n}-0`, especie, e, a, l, u });
  /** `k` piezas iguales de largo `l`. */
  const varias = (k: number, especie: string | undefined, l: number, u?: "pies" | "m") =>
    Array.from({ length: k }, (_, i) => p(especie, 2, 8 - (i % 2) * 2, l, u));
  const LARGO: LargoEnLectura<P> = {
    largo: (x) => x.l,
    unidad: (x, v) => unidadDeLargoEnVoz(x.u ?? "pies", v),
    sinLargo: (x) => `${x.e}, ${x.a}`,
  };
  const medida = (x: P) => `${x.e}, ${x.a}, ${x.l}`;
  /** Lo que sonaría leyendo la tabla entera (o desde `desde`), como lo pide el hook. */
  const leer = (lista: P[], { haciaAtras = false, desde }: { haciaAtras?: boolean; desde?: number } = {}) => {
    const orden = lista.map((_, i) => i);
    if (haciaAtras) orden.reverse();
    const inicio = desde === undefined ? 0 : orden.indexOf(desde);
    return orden.slice(inicio).map((i, k) =>
      textoPorTramos(lista[i], { indice: i, lista, haciaAtras, primera: k === 0 }, medida, LARGO),
    );
  };

  it("los umbrales son los medidos: 5 filas para fijar, 3 fuera para soltar", () => {
    expect(MINIMO_RACHA_LARGO).toBe(5);
    expect(FUERA_PARA_SOLTAR).toBe(3);
  });

  it("una racha de 5+ con el mismo largo se anuncia con la especie y después sólo espesor y ancho", () => {
    const lista = [...varias(6, "Panguana", 7), p("Panguana", 3, 10, 8)];
    expect(leer(lista)).toEqual([
      "Continúa con Panguana, largo fijo 7 pies. 2, 8",
      "2, 6",
      "2, 8",
      "2, 6",
      "2, 8",
      "2, 6",
      "3, 10, largo 8",
    ]);
  });

  it("si la especie ya venía sonando, sólo «Largo fijo»", () => {
    const lista = [p("Panguana", 2, 4, 6), ...varias(5, "Panguana", 7)];
    expect(leer(lista).slice(0, 3)).toEqual([
      "Continúa con Panguana. 2, 4, 6",
      "Largo fijo 7 pies. 2, 8",
      "2, 6",
    ]);
  });

  it("una pieza suelta de otro largo NO suelta el fijo; dos seguidas tampoco", () => {
    const suelta = [...varias(5, "Tornillo", 7), p("Tornillo", 2, 8, 8), ...varias(2, "Tornillo", 7)];
    expect(leer(suelta).slice(4)).toEqual(["2, 8", "2, 8, largo 8", "2, 8", "2, 6"]);
    const dos = [...varias(5, "Tornillo", 7), p("Tornillo", 2, 8, 8), p("Tornillo", 2, 8, 9), ...varias(1, "Tornillo", 7)];
    expect(leer(dos).slice(5)).toEqual(["2, 8, largo 8", "2, 8, largo 9", "2, 8"]);
  });

  it("tres piezas seguidas fuera del fijo lo sueltan: «Largo libre» y otra vez las tres medidas", () => {
    const lista = [
      ...varias(5, "Tornillo", 7),
      p("Tornillo", 2, 8, 8), p("Tornillo", 2, 8, 9), p("Tornillo", 2, 8, 6),
      ...varias(2, "Tornillo", 7),
    ];
    expect(leer(lista).slice(5)).toEqual([
      "Largo libre. 2, 8, 8",
      "2, 8, 9",
      "2, 8, 6",
      // el 7 vuelve pero en racha corta: ya no hay fijo, se dice entero
      "2, 8, 7",
      "2, 6, 7",
    ]);
  });

  it("una racha nueva de 5+ con otro largo cambia el fijo y se anuncia; con el MISMO largo no se repite", () => {
    const cambia = [...varias(5, "Tornillo", 7), ...varias(5, "Tornillo", 8)];
    expect(leer(cambia)[5]).toBe("Largo fijo 8 pies. 2, 8");
    const igual = [...varias(5, "Tornillo", 7), p("Tornillo", 2, 8, 8), ...varias(5, "Tornillo", 7)];
    expect(leer(igual).slice(5, 7)).toEqual(["2, 8, largo 8", "2, 8"]);
  });

  it("4 piezas iguales no alcanzan: el anuncio no se pagaría", () => {
    expect(leer(varias(4, "Tornillo", 7))).toEqual([
      "Continúa con Tornillo. 2, 8, 7",
      "2, 6, 7",
      "2, 8, 7",
      "2, 6, 7",
    ]);
  });

  it("cambiar de especie reinicia: el fijo es del tramo, y se vuelve a anunciar con la especie nueva", () => {
    const lista = [...varias(5, "Panguana", 7), ...varias(5, "Tornillo", 7)];
    const leido = leer(lista);
    expect(leido[4]).toBe("2, 8");
    expect(leido[5]).toBe("Continúa con Tornillo, largo fijo 7 pies. 2, 8");
  });

  it("una fila sin especie en el medio corta el tramo y su fijo", () => {
    const lista = [...varias(5, "Panguana", 7), p(undefined, 2, 8, 7), ...varias(2, "Panguana", 7)];
    expect(leer(lista).slice(5)).toEqual([
      "Sin especie. 2, 8, 7",
      "Continúa con Panguana. 2, 8, 7",
      "2, 6, 7",
    ]);
  });

  it("un lote dictado sin especie también se beneficia", () => {
    expect(leer(varias(6, undefined, 7)).slice(0, 2)).toEqual(["Largo fijo 7 pies. 2, 8", "2, 6"]);
    const trasTramo = [...varias(2, "Cumala", 10), ...varias(5, undefined, 7)];
    expect(leer(trasTramo)[2]).toBe("Sin especie, largo fijo 7 pies. 2, 8");
  });

  it("hacia atrás las rachas se cuentan en el orden en que se lee", () => {
    const lista = [p("Panguana", 2, 8, 8), ...varias(5, "Panguana", 7)];
    // al derecho: la de 8 va primero, sin fijo; la racha de 7 se anuncia después
    expect(leer(lista).slice(0, 2)).toEqual(["Continúa con Panguana. 2, 8, 8", "Largo fijo 7 pies. 2, 8"]);
    // al revés: se entra por la racha de 7 y la de 8 es una excepción al final
    const alReves = leer(lista, { haciaAtras: true });
    expect(alReves[0]).toBe("Continúa con Panguana, largo fijo 7 pies. 2, 8");
    expect(alReves[alReves.length - 1]).toBe("2, 8, largo 8");
  });

  it("al revés, lo que al derecho era el final suelto que suelta el fijo, se lee antes de la racha", () => {
    const lista = [...varias(5, "Tornillo", 7), p("Tornillo", 2, 8, 8), p("Tornillo", 2, 8, 9), p("Tornillo", 2, 8, 6)];
    expect(leer(lista, { haciaAtras: true }).slice(0, 4)).toEqual([
      "Continúa con Tornillo. 2, 8, 6",
      "2, 8, 9",
      "2, 8, 8",
      "Largo fijo 7 pies. 2, 8",
    ]);
  });

  it("arrancar o saltar a mitad de una racha dice la especie y el fijo vigente", () => {
    const lista = [...varias(6, "Panguana", 7), p("Panguana", 3, 10, 8)];
    expect(leer(lista, { desde: 3 })[0]).toBe("Continúa con Panguana, largo fijo 7 pies. 2, 6");
    // arrancar justo en la excepción: el fijo se dice igual y la pieza lleva su largo
    expect(leer(lista, { desde: 6 })[0]).toBe("Continúa con Panguana, largo fijo 7 pies. 3, 10, largo 8");
    // arrancar donde el fijo ya se soltó: no se nombra ningún fijo
    const suelto = [...varias(5, "Tornillo", 7), p("Tornillo", 2, 8, 8), p("Tornillo", 2, 8, 9), p("Tornillo", 2, 8, 6)];
    expect(leer(suelto, { desde: 6 })[0]).toBe("Continúa con Tornillo. 2, 8, 9");
  });

  it("la unidad sale de la fila: metros en trozas, singular cuando es uno; 7 pies y 7 metros no son el mismo largo", () => {
    expect(leer(varias(5, "Tornillo", 3.5, "m"))[0]).toBe("Continúa con Tornillo, largo fijo 3.5 metros. 2, 8");
    expect(leer(varias(5, "Tornillo", 1))[0]).toBe("Continúa con Tornillo, largo fijo 1 pie. 2, 8");
    const mezcla = [...varias(3, "Tornillo", 7), ...varias(3, "Tornillo", 7, "m")];
    expect(largoFijoEn(mezcla, 0, false, LARGO).fijo).toBeNull();
  });

  it("sin la opción, se lee exactamente como antes", () => {
    const lista = varias(6, "Panguana", 7);
    expect(textoPorTramos(lista[0], { indice: 0, lista, haciaAtras: false, primera: true }, medida)).toBe("Continúa con Panguana. 2, 8, 7");
  });

  it("una fila suelta de especie no cambia", () => {
    const lista = [...varias(5, "Panguana", 7), p("Tornillo", 1, 4, 7)];
    expect(leer(lista)[5]).toBe("1, 4, 7, Tornillo");
  });
});
