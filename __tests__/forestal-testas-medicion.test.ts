/**
 * «Medir por foto» (16-10, F1): la escala por las hojas 248/249, el Ø de cada
 * testa como lo guarda el libro, el N° que imprimirá la guía (ADR-474) y lo
 * que pasa a «Anotar a mano» (D2 vacío = pareja, ADR-492, marcada).
 */
import { describe, expect, it } from "vitest";
import { htmlHojasDeEscala } from "@/lib/camaras/marcador-a4";
import { leerMedida, notaPorFoto, observacionAMano, piezasAMano, volumenPorTroza, type TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";
import {
  IDS_HOJA_ESCALA,
  LADO_HOJA_ESCALA_MM,
  aTrozasAMano,
  aplicar,
  codigosDeLaCarga,
  conDiametro,
  cuadradoDeLaHoja,
  diametroCm,
  escalaDeLasHojas,
  filasDeLaCarga,
  hojaChica,
  homografia,
  invertir,
  ladoEnPx,
  marcoEnderezado,
  ordenDeLectura,
  resumenDeLaCarga,
  siguientesCorrelativos,
  testaDeElipse,
  type Matriz3,
  type Punto,
  type TestaPropuesta,
} from "@/lib/forestal/testas-medicion";

/** Una cámara inventada: plano (mm) → foto (px), con perspectiva. */
const CAMARA: Matriz3 = [2.1, 0.15, 400, -0.08, 2.05, 300, 0.00011, 0.00004, 1];
const aFoto = (p: Punto): Punto => aplicar(CAMARA, p);
const hoja = (id: number, x0: number, y0: number) => ({
  id,
  esquinas: cuadradoDeLaHoja().map(([x, y]) => aFoto([x + x0, y + y0])),
});
const cerca = (a: Punto, b: Punto, tol = 1e-6) => {
  expect(a[0]).toBeCloseTo(b[0], -Math.log10(tol));
  expect(a[1]).toBeCloseTo(b[1], -Math.log10(tol));
};

function testa(id: string, cx: number, cy: number, r: number): TestaPropuesta {
  return testaDeElipse({ cx, cy, ancho: 2 * r, alto: 2 * r, angulo: 0, puntos: 100 }, 2, id, "auto");
}

describe("homografía", () => {
  it("con 4 pares es exacta y su inversa vuelve", () => {
    const origen = cuadradoDeLaHoja(180);
    const destino = origen.map(aFoto);
    const H = homografia(origen, destino);
    expect(H).not.toBeNull();
    for (const p of [[90, 90], [0, 180], [37, 12]] as Punto[]) cerca(aplicar(H!, p), aFoto(p), 1e-4);
    const Hi = invertir(H!);
    cerca(aplicar(Hi!, aplicar(H!, [55, 70])), [55, 70], 1e-4);
  });

  it("con puntos colineales o pocos pares no inventa", () => {
    expect(homografia([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 1], [2, 2], [3, 3]])).toBeNull();
    expect(homografia([[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1]])).toBeNull();
  });
});

describe("escala de la foto por las hojas", () => {
  it("una hoja: cada px de la foto cae en su mm del plano", () => {
    const e = escalaDeLasHojas([hoja(248, 0, 0)]);
    expect(e?.hojas.map((h) => h.id)).toEqual([248]);
    cerca(aplicar(e!.H, aFoto([900, 400])), [900, 400], 1e-3);
  });

  it("ignora marcadores que no son de escala (chalecos 200-244, prueba 245-247)", () => {
    expect(escalaDeLasHojas([hoja(200, 0, 0), hoja(246, 500, 0)])).toBeNull();
    expect(IDS_HOJA_ESCALA.every((id) => id > 247)).toBe(true);
  });

  it("dos hojas: las dos quedan como cuadrados de 18 cm y la distancia entre ellas sale bien", () => {
    const e = escalaDeLasHojas([hoja(249, 2200, 600), hoja(248, 0, 0)]);
    expect(e?.hojas.map((h) => h.id)).toEqual([248, 249]);
    const [a, b] = e!.hojas;
    expect(ladoEnPx(a.esquinasMm)).toBeCloseTo(LADO_HOJA_ESCALA_MM, 1);
    expect(ladoEnPx(b.esquinasMm)).toBeCloseTo(LADO_HOJA_ESCALA_MM, 1);
    cerca(b.esquinasMm[0], [2200, 600], 0.1);
  });

  it("dos hojas con las esquinas redondeadas al px: el plano no se va más de 1 mm", () => {
    const redondo = (h: { id: number; esquinas: Punto[] }) => ({ ...h, esquinas: h.esquinas.map(([x, y]) => [Math.round(x), Math.round(y)] as Punto) });
    const e = escalaDeLasHojas([redondo(hoja(248, 0, 0)), redondo(hoja(249, 2200, 600))]);
    const [x, y] = aplicar(e!.H, aFoto([1200, 300]));
    expect(Math.abs(x - 1200)).toBeLessThan(1);
    expect(Math.abs(y - 300)).toBeLessThan(1);
  });

  it("la foto enderezada: mm por px parejo y el origen dentro del plano visto", () => {
    const e = escalaDeLasHojas([hoja(248, 0, 0)])!;
    const m = marcoEnderezado(e, { ancho: 4000, alto: 3000 });
    expect(m.mmPorPx).toBeGreaterThanOrEqual(1.5);
    expect(Math.max(m.ancho, m.alto)).toBeLessThanOrEqual(2400);
    const [x, y] = aplicar(m.M, aFoto([m.origenMm[0] + 100 * m.mmPorPx, m.origenMm[1] + 50 * m.mmPorPx]));
    expect(x).toBeCloseTo(100, 3);
    expect(y).toBeCloseTo(50, 3);
  });

  it("hoja chica (<100 px de lado) avisa", () => {
    expect(hojaChica({ ladoHojaPx: [140, 90] })).toBe(true);
    expect(hojaChica({ ladoHojaPx: [140, 120] })).toBe(false);
  });
});

describe("Ø de la testa", () => {
  it("promedio de los dos ejes a 1 decimal, como el libro", () => {
    expect(diametroCm(200, 180, 2)).toBe(38);
    expect(diametroCm(201, 180, 2.03)).toBe(38.7);
    const t = testaDeElipse({ cx: 10.04, cy: 20, ancho: 200, alto: 180, angulo: 12.34, puntos: 80 }, 2, "a", "auto");
    expect(t).toMatchObject({ cx: 10, aPx: 100, bPx: 90, anguloGrados: 12.3, ejeMayorCm: 40, ejeMenorCm: 36, dCm: 38 });
  });

  it("corregir el Ø agranda la elipse pareja y la marca ajustada", () => {
    const t = conDiametro(testa("a", 0, 0, 100), 44, 2);
    expect(t.dCm).toBe(44);
    expect(t.aPx).toBe(110);
    expect(t.origen).toBe("ajustada");
    expect(conDiametro({ ...t, origen: "agregada" }, 30, 2).origen).toBe("agregada");
  });

  it("orden de lectura: por filas de arriba abajo, cada fila de izquierda a derecha", () => {
    const orden = ordenDeLectura([testa("c", 500, 110, 50), testa("d", 120, 200, 50), testa("a", 100, 100, 50), testa("b", 300, 95, 50)]);
    expect(orden.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("tabla de la carga → Anotar a mano", () => {
  const testas = [testa("a", 100, 100, 100), testa("b", 300, 100, 110)];

  it("especie y largo de la carga; D2 vacío pasa pareja y marcado", () => {
    const filas = filasDeLaCarga(testas, ["24", "25"], { largoM: 3.2, especie: " Tornillo " });
    expect(filas.map((f) => [f.codigo, f.d1Cm, f.d2Cm, f.especie])).toEqual([
      ["24", 40, null, "Tornillo"],
      ["25", 44, null, "Tornillo"],
    ]);
    const { listas, faltan } = aTrozasAMano(filas);
    expect(faltan).toEqual([]);
    expect(listas[0]).toMatchObject({ d1Cm: 40, d2Cm: 40, largoM: 3.2, cantidad: 1, especie: "Tornillo", medidoPorFoto: true, d2Supuesto: true });
  });

  it("lo tipeado gana: D2 medido no lleva la marca y D1 a mano cambia el origen", () => {
    const filas = filasDeLaCarga(testas, ["1", "2"], { largoM: 3.2, especie: "Tornillo" }, { d1Cm: { a: 41.5 }, d2Cm: { b: 39 } });
    expect(filas[0]).toMatchObject({ d1Cm: 41.5, origenD1: "mano" });
    expect(filas[1]).toMatchObject({ d2Cm: 39, origenD2: "mano" });
    const { listas } = aTrozasAMano(filas);
    expect(listas[1].d2Supuesto).toBeUndefined();
  });

  it("sin especie ni largo, o fuera de rango, dice qué falta de cuál", () => {
    const sin = aTrozasAMano(filasDeLaCarga(testas, ["1", "2"], { largoM: null, especie: "" }));
    expect(sin.listas).toEqual([]);
    expect(sin.faltan).toContainEqual({ codigo: "1", campo: "especie" });
    expect(sin.faltan).toContainEqual({ codigo: "2", campo: "largo" });
    const fuera = aTrozasAMano(filasDeLaCarga(testas, ["1", "2"], { largoM: 3, especie: "Tornillo" }, { d1Cm: { a: 9999 } }));
    expect(fuera.faltan).toEqual([{ codigo: "1", campo: "d1" }]);
    expect(fuera.listas).toHaveLength(1);
  });

  it("el resumen es el volumen del libro (Smalian SERFOR por troza)", () => {
    const filas = filasDeLaCarga(testas, ["1", "2"], { largoM: 3.2, especie: "Tornillo" });
    const esperado = volumenPorTroza({ d1Cm: 40, d2Cm: 40, largoM: 3.2 }) + volumenPorTroza({ d1Cm: 44, d2Cm: 44, largoM: 3.2 });
    const r = resumenDeLaCarga(filas);
    expect(r.trozas).toBe(2);
    expect(r.volumenM3).toBeCloseTo(esperado, 4);
  });
});

describe("N° de la guía (ADR-474)", () => {
  const fila = (cantidad = 1): TrozaAMano => ({ d1Cm: 40, d2Cm: 40, largoM: 3, cantidad });

  it("las de la foto van detrás de lo anotado y saltan los códigos del libro", () => {
    expect(codigosDeLaCarga([fila(2)], 3, { ocupados: ["3"] })).toEqual(["4", "5", "6"]);
    expect(codigosDeLaCarga([], 3, { ocupados: ["25"], desde: 24 })).toEqual(["24", "26", "27"]);
  });

  it("piezasAMano numera desde `desde` (1 = lo de siempre)", () => {
    expect(piezasAMano([fila(2)]).map((p) => p.codigo)).toEqual(["1", "2"]);
    expect(piezasAMano([fila(2)], [], new Map(), 24).map((p) => p.codigo)).toEqual(["24", "25"]);
  });

  it("piezasAMano lleva de dónde salió la medida", () => {
    const [foto, pareja, mano] = piezasAMano([
      { ...fila(), medidoPorFoto: true },
      { ...fila(), medidoPorFoto: true, d2Supuesto: true },
      fila(),
    ]);
    expect([foto.porFoto, pareja.porFoto, mano.porFoto]).toEqual(["medida", "pareja", null]);
  });

  it("el que sigue por permiso: el mayor código numérico + 1; los de árbol no cuentan", () => {
    const sig = siguientesCorrelativos([
      { planId: "p1", trozaCode: "23" },
      { planId: "p1", trozaCode: "7" },
      { planId: "p1", trozaCode: "001-TOR-A" },
      { planId: "p2", trozaCode: "4" },
      { planId: null, trozaCode: "9" },
      { planId: "p3", trozaCode: null },
      { planId: "p3", trozaCode: "20261016" },
    ]);
    expect(sig).toEqual({ p1: 24, p2: 5, sin_permiso: 10 });
  });
});

describe("lo que queda escrito", () => {
  it("la nota del Trozado dice de dónde salió cada Ø", () => {
    expect(notaPorFoto(null, "Ana")).toBeNull();
    expect(notaPorFoto("pareja", "Ana")).toContain("D2 = D1");
    expect(notaPorFoto("medida", "Ana")).toContain("D2 a mano");
    expect(observacionAMano("0001", "24", "Medido por foto")).toBe("Troza anotada a mano al despachar con la GTF 0001 (en la guía: 24). Medido por foto");
  });

  it("leerMedida acepta coma y espacios; vacío es null", () => {
    expect(leerMedida(" 45,3 ")).toBe(45.3);
    expect(leerMedida("")).toBeNull();
    expect(leerMedida("abc")).toBeNull();
  });

  it("las hojas de escala imprimen los marcadores 248 y 249 a 18 cm", () => {
    const html = htmlHojasDeEscala();
    expect(html).toContain("ESCALA 1");
    expect(html).toContain("ESCALA 2");
    expect(html).toContain(`${LADO_HOJA_ESCALA_MM}mm`);
    expect((html.match(/<section class="hoja">/g) ?? []).length).toBe(2);
  });
});
