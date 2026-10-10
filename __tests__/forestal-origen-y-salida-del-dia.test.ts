/**
 * Origen y salida de cada día de producción (ADR-445).
 *
 * Los casos son los del libro real (Blas, leído el 27-09 con `BEGIN READ ONLY`)
 * y el paquete de muestra de `main`:
 *  · 01/08 — 5 corridas de inventario marcadas «usado», 20 paquetes sin
 *    escuadría (19 en 0 piezas) → por tipo, salió SIN GUÍA (76,564 m³);
 *  · 27/09 — la N° 61 (13,254 m³) mandó 12,5 en la GTF 19-00000-000001 con el
 *    paquete SL-680 y la N° 62 está por declarar → por tipo, PARCIAL;
 *  · 29/08 — una corrida de 1 litro marcada usada: no es «cubicada» por no
 *    tener nada, y salió sin guía (no «despachada»);
 *  · PQ-DIM-9427 (`main`) — tiene escuadría pero NO explica su m³.
 * Y el cuadre: despachado + reprocesado + sin guía + en patio = declarado.
 */

import { describe, it, expect } from "vitest";
import {
  cubicacionesVinculadas,
  estadoDeSalida,
  m3DeLaEscuadria,
  origenDeCorrida,
  origenDelDia,
  origenDePaquete,
  origenYSalidaDeCorrida,
  origenYSalidaDelDia,
  salidaDeCorrida,
  salidaDelDia,
  type CorridaParaOrigenYSalida,
  type CubicacionParaVincular,
  type PaqueteParaOrigen,
  type SalidaDelDia,
  type SalidaRegistrada,
} from "@/lib/forestal/origen-y-salida-del-dia";
import { jornadasDesdeFilas, type FilaDeLaSemana } from "@/lib/forestal/detalle-de-jornada";
import { conOrigenYSalida, type CorridaDelDia } from "@/lib/forestal/piezas-del-dia";
import { corridasDeCubicacion } from "@/lib/forestal/cubicacion-registro";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Un paquete por tipo del libro: sin escuadría. */
const porTipo = (codigo: string, cantidad: number, volumenM3: number): PaqueteParaOrigen => ({
  id: `paq-${codigo}`,
  codigo,
  cantidad,
  volumenM3,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
});

const corrida = (over: Partial<CorridaParaOrigenYSalida> & { id: string }): CorridaParaOrigenYSalida => ({
  cantidad: over.m3Declarado ?? 0,
  m3Declarado: 0,
  usado: false,
  despachado: 0,
  reprocesado: 0,
  paquetes: [],
  salidas: [],
  apartados: [],
  ...over,
});

/** El cuadre que el ADR promete, sobre lo que devolvió la función. */
const cuadra = (s: SalidaDelDia, declarado: number) =>
  r4(s.m3Despachado + s.m3Reprocesado + s.m3SinGuia + s.m3EnPatio) === r4(declarado);

// ── Blas 01/08: inventario de apertura, marcado «usado» ──────────────────────
const blas0108: CorridaParaOrigenYSalida[] = [
  corrida({ id: "c15", m3Declarado: 15.211, usado: true, paquetes: [porTipo("55", 0, 0.002), porTipo("56", 0, 9.753), porTipo("57", 0, 5.456)] }),
  corrida({ id: "c16", m3Declarado: 2.982, usado: true, paquetes: [porTipo("58", 0, 0.001), porTipo("59", 0, 1.892), porTipo("60", 0, 1.089)] }),
  corrida({ id: "c17", m3Declarado: 3.51, usado: true, paquetes: [porTipo("61", 0, 3.264), porTipo("62", 0, 0.112), porTipo("63", 0, 0.134)] }),
  corrida({
    id: "c18",
    m3Declarado: 35.647,
    usado: true,
    paquetes: [porTipo("64", 0, 26.852), porTipo("65", 0, 2.349), porTipo("66", 0, 3.689), porTipo("67", 0, 1.773), porTipo("68", 0, 0.984)],
  }),
  corrida({
    id: "c19",
    m3Declarado: 19.214,
    usado: true,
    paquetes: [
      porTipo("69", 0, 0.309),
      porTipo("70", 0, 0.018),
      porTipo("71", 0, 15.39),
      porTipo("72", 0, 3.263),
      porTipo("73", 0, 0.123),
      porTipo("SL-679", 12, 0.111),
    ],
  }),
];

// ── Blas 27/09: la N° 61 salió en parte en la GTF 19-00000-000001 ────────────
const guia1: SalidaRegistrada = {
  despachoEntryId: "cmuk5wrm9002izhvzv2z5ftjb",
  lineNo: 1,
  gtfNumber: "19-00000-000001",
  fecha: "2026-09-27",
  m3: 12.5,
  codigoProducto: "SL-680",
  esSalidaDeTrozas: false,
};
const blas2709: CorridaParaOrigenYSalida[] = [
  corrida({
    id: "c61",
    m3Declarado: 13.254,
    despachado: 12.5,
    paquetes: [porTipo("SL-680", 50, 12.5), porTipo("SL-681", 156, 0.254), porTipo("SL-682", 15, 0.5)],
    salidas: [guia1],
  }),
  corrida({ id: "c62", cantidad: null, m3Declarado: 0 }),
];

// ── Blas 29/08: una corrida de un litro ──────────────────────────────────────
const blas2908 = corrida({ id: "c26", m3Declarado: 0.001, usado: true, paquetes: [porTipo("d1d15", 141, 0.001)] });

describe("origenDePaquete — la escuadría tiene que EXPLICAR el m³", () => {
  it("paquetes cubicados reales de Blas (12/09) se reconocen", () => {
    const sl543 = { cantidad: 2, volumenM3: 0.2642, espesorCm: 10.16, anchoCm: 30.48, largoM: 4.27 };
    const sl567 = { cantidad: 5, volumenM3: 0.047, espesorCm: 2.54, anchoCm: 15.24, largoM: 2.44 };
    expect(origenDePaquete(sl543)).toBe("cubicado");
    expect(origenDePaquete(sl567)).toBe("cubicado");
    expect(m3DeLaEscuadria(sl543)).toBeCloseTo(0.2645, 4);
  });

  it("PQ-DIM-9427 de main: tiene escuadría pero no explica su m³ → por tipo", () => {
    const pq = { cantidad: 12, volumenM3: 0.0336, espesorCm: 2.5, anchoCm: 20, largoM: 2.8 };
    expect(m3DeLaEscuadria(pq)).toBeCloseTo(0.168, 4);
    expect(origenDePaquete(pq)).toBe("por_tipo");
  });

  it("sin una de las cuatro medidas (o 0 piezas) no hay cubicación", () => {
    expect(origenDePaquete(porTipo("56", 0, 9.753))).toBe("por_tipo");
    expect(origenDePaquete({ cantidad: 0, volumenM3: 0.05, espesorCm: 2.54, anchoCm: 15.24, largoM: 2.44 })).toBe("por_tipo");
    expect(m3DeLaEscuadria({ cantidad: 3, volumenM3: 1, espesorCm: 2.54, anchoCm: null, largoM: 2.44 })).toBeNull();
  });

  it("la tolerancia es máx(10 L; 2 %): un paquete grande admite el 2 %, uno chico los 10 L", () => {
    // 10 m³ declarados, escuadría 10,19 → 1,9 % → cubicado; 10,25 → 2,5 % → no.
    const grande = (largoM: number) => ({ cantidad: 100, volumenM3: 10, espesorCm: 10, anchoCm: 25, largoM });
    expect(origenDePaquete(grande(4.076))).toBe("cubicado");
    expect(origenDePaquete(grande(4.1))).toBe("por_tipo");
    // 0,05 m³ declarados: 0,059 entra por los 10 L aunque sea +18 %.
    expect(origenDePaquete({ cantidad: 1, volumenM3: 0.05, espesorCm: 10, anchoCm: 10, largoM: 5.9 })).toBe("cubicado");
  });
});

describe("origenDeCorrida y origenDelDia", () => {
  it("01/08 de Blas: 5 corridas por tipo → el día es por tipo", () => {
    const origenes = blas0108.map(origenDeCorrida);
    expect(origenes.every((o) => o.origen === "por_tipo")).toBe(true);
    expect(origenDelDia(origenes.map((o) => o.origen))).toBe("por_tipo");
  });

  it("27/09: la N° 62 sin cantidad ni paquetes está por declarar y NO vota", () => {
    const [n61, n62] = blas2709.map(origenDeCorrida);
    expect(n61?.origen).toBe("por_tipo");
    expect(n62?.origen).toBe("por_declarar");
    expect(origenDelDia(["por_tipo", "por_declarar"])).toBe("por_tipo");
    expect(origenDelDia(["por_declarar"])).toBe("por_declarar");
  });

  it("29/08: una corrida de 1 L no es «cubicada» por no tener nada que cubicar", () => {
    expect(origenDeCorrida(blas2908).origen).toBe("por_tipo");
    expect(origenDeCorrida(corrida({ id: "x", m3Declarado: 0.001 })).origen).toBe("por_tipo");
  });

  it("cubicada si lo cubicado llega al declarado −10 L; si no, parcial; mezcla → mixto", () => {
    const cub = { id: "a", codigo: "A", cantidad: 10, volumenM3: 0.5, espesorCm: 5, anchoCm: 10, largoM: 10 };
    const entera = corrida({ id: "e", m3Declarado: 0.508, paquetes: [cub] });
    const mitad = corrida({ id: "m", m3Declarado: 1, paquetes: [cub, porTipo("B", 10, 0.5)] });
    expect(origenDeCorrida(entera)).toMatchObject({ origen: "cubicada", m3Cubicado: 0.5, paquetesCubicados: 1 });
    expect(origenDeCorrida(mitad)).toMatchObject({ origen: "parcial", m3Cubicado: 0.5 });
    expect(origenDelDia(["cubicada", "cubicada"])).toBe("cubicado");
    expect(origenDelDia(["cubicada", "por_tipo"])).toBe("mixto");
    expect(origenDelDia(["parcial"])).toBe("mixto");
  });
});

describe("salida — despachado, sin guía, en patio", () => {
  it("01/08: todo salió marcado «usado», sin guía en el libro", () => {
    const dia = origenYSalidaDelDia(blas0108, []);
    expect(dia.origen).toBe("por_tipo");
    expect(dia.m3Declarado).toBe(76.564);
    expect(dia.salida).toMatchObject({ estado: "sin_guia", m3SinGuia: 76.564, m3EnPatio: 0, m3Despachado: 0, guias: [] });
    expect(cuadra(dia.salida, dia.m3Declarado)).toBe(true);
  });

  it("27/09: 12,5 en la GTF 19-00000-000001 con SL-680, 0,754 quedan → parcial", () => {
    const dia = origenYSalidaDelDia(blas2709, []);
    expect(dia.porDeclarar).toBe(1);
    expect(dia.salida.estado).toBe("parcial");
    expect(dia.salida.m3Despachado).toBe(12.5);
    expect(dia.salida.m3EnPatio).toBe(0.754);
    expect(dia.salida.guias).toEqual([
      { despachoEntryId: guia1.despachoEntryId, lineNo: 1, gtfNumber: "19-00000-000001", fecha: "2026-09-27", m3: 12.5, paquetes: ["SL-680"] },
    ]);
    expect(cuadra(dia.salida, 13.254)).toBe(true);
  });

  it("29/08: el litro usado salió sin guía, no «despachado»", () => {
    const s = salidaDeCorrida(blas2908);
    expect(s).toMatchObject({ estado: "sin_guia", m3SinGuia: 0.001, m3EnPatio: 0 });
    expect(cuadra(s, 0.001)).toBe(true);
  });

  it("un día sin movimiento es sin_salida; entero en guía (aunque sea borrador) es despachado", () => {
    expect(salidaDeCorrida(corrida({ id: "a", m3Declarado: 7.6389 })).estado).toBe("sin_salida");
    const borrador = { ...guia1, gtfNumber: null, codigoProducto: "PQ-1" };
    const entera = salidaDeCorrida(corrida({ id: "b", m3Declarado: 2, despachado: 2, salidas: [{ ...borrador, m3: 2 }] }));
    expect(entera.estado).toBe("despachado");
    expect(entera.guias[0]?.gtfNumber).toBeNull();
    // Quedan 5 litros: dentro de la tolerancia de 10 L, ya salió.
    expect(salidaDeCorrida(corrida({ id: "c", m3Declarado: 2.005, despachado: 2 })).estado).toBe("despachado");
  });

  it("reprocesada entera sale del patio por el libro: despachado, con el monto en reprocesado", () => {
    const s = salidaDeCorrida(corrida({ id: "r", m3Declarado: 3, reprocesado: 3 }));
    expect(s).toMatchObject({ estado: "despachado", m3Reprocesado: 3, m3EnPatio: 0 });
    expect(estadoDeSalida({ m3Despachado: 1, m3Reprocesado: 0, m3SinGuia: 0.5, m3EnPatio: 0 })).toBe("sin_guia");
  });

  it("el código de una salida de TROZAS no nombra al paquete (Blas: «55»…«72» = 18 trozas)", () => {
    const deTrozas: SalidaRegistrada = { ...guia1, despachoEntryId: "d-t", codigoProducto: "55", esSalidaDeTrozas: true, m3: 0.002 };
    const conPaquete: SalidaRegistrada = { ...guia1, despachoEntryId: "d-p", codigoProducto: "56", m3: 1 };
    const ajeno: SalidaRegistrada = { ...guia1, despachoEntryId: "d-a", codigoProducto: "SL-999", m3: 1 };
    const c15 = blas0108[0];
    if (!c15) throw new Error("falta el fixture");
    const s = salidaDeCorrida({ ...c15, usado: false, despachado: 2.002, salidas: [deTrozas, conPaquete, ajeno] });
    const porId = new Map(s.guias.map((g) => [g.despachoEntryId, g.paquetes]));
    expect(porId.get("d-t")).toEqual([]);
    expect(porId.get("d-p")).toEqual(["56"]);
    expect(porId.get("d-a")).toEqual([]);
  });

  it("un despacho que se lleva dos corridas del mismo día es UNA guía con la suma", () => {
    const a = salidaDeCorrida(corrida({ id: "a", m3Declarado: 1, despachado: 1, paquetes: [porTipo("A", 1, 1)], salidas: [{ ...guia1, codigoProducto: "A", m3: 1 }] }));
    const b = salidaDeCorrida(corrida({ id: "b", m3Declarado: 2, despachado: 0.5, salidas: [{ ...guia1, codigoProducto: null, m3: 0.5 }] }));
    const dia = salidaDelDia([a, b]);
    expect(dia.guias).toHaveLength(1);
    expect(dia.guias[0]).toMatchObject({ m3: 1.5, paquetes: ["A"] });
    expect(dia.estado).toBe("parcial");
    expect(cuadra(dia, 3)).toBe(true);
  });

  it("apartados: cuentan los paquetes reservados que no salieron, mientras quede madera", () => {
    const base = corrida({
      id: "a",
      m3Declarado: 2,
      despachado: 1,
      paquetes: [porTipo("A", 1, 1), porTipo("B", 1, 1)],
      salidas: [{ ...guia1, codigoProducto: "A", m3: 1 }],
      apartados: [{ paqueteId: "paq-A" }, { paqueteId: "paq-B" }, { paqueteId: null }],
    });
    expect(salidaDeCorrida(base).apartados).toBe(2);
    expect(salidaDeCorrida({ ...base, usado: true }).apartados).toBe(0);
  });

  it("el cuadre cierra en todos los casos del libro", () => {
    for (const c of [...blas0108, ...blas2709, blas2908]) {
      expect(cuadra(salidaDeCorrida(c), c.m3Declarado)).toBe(true);
    }
  });
});

describe("cubicaciones ligadas", () => {
  const cub = (id: string, corridas: string[], m3: number): CubicacionParaVincular => ({
    id,
    nombre: id,
    m3,
    pt: m3 * 424,
    piezas: 10,
    corridas,
  });

  it("sólo del día suma en m3ConCubicacion; la que abarca otro día se lista pero no se reparte", () => {
    const dia = [corrida({ id: "a", m3Declarado: 1 }), corrida({ id: "b", m3Declarado: 1 })];
    const lista = [cub("c1", ["a"], 0.9), cub("c2", ["b", "otro-dia"], 5), cub("c3", ["x"], 1)];
    const os = origenYSalidaDelDia(dia, lista);
    expect(os.cubicaciones.map((c) => [c.id, c.soloEsteDia])).toEqual([
      ["c1", true],
      ["c2", false],
    ]);
    expect(os.m3ConCubicacion).toBe(0.9);
    expect(cubicacionesVinculadas(["b"], ["a", "b"], lista).map((c) => c.id)).toEqual(["c2"]);
  });

  it("lee ctpEntryIds Y el ctpEntryId viejo (main: una de cada formato sobre la N° 95052)", () => {
    expect(corridasDeCubicacion({ ctpEntryId: "cmskdtwun001hrwvzsq3syra3" })).toEqual(["cmskdtwun001hrwvzsq3syra3"]);
    expect(corridasDeCubicacion({ ctpEntryId: "a", ctpEntryIds: ["a", "b"] })).toEqual(["a", "b"]);
    expect(corridasDeCubicacion({})).toEqual([]);
  });

  it("la corrida trae sus cubicaciones y su propia salida", () => {
    const c = corrida({ id: "a", m3Declarado: 1 });
    const o = origenYSalidaDeCorrida(c, { idsDelDia: ["a"], cubicaciones: [cub("c1", ["a"], 1)] });
    expect(o).toMatchObject({ origen: "por_tipo", m3Declarado: 1, m3Cubicado: 0, salida: { estado: "sin_salida" } });
    expect(o.cubicaciones[0]?.soloEsteDia).toBe(true);
  });
});

describe("cableado: la tira de días y el detalle del día", () => {
  const fila = (id: string, dia: string, c?: CorridaParaOrigenYSalida): FilaDeLaSemana => ({
    dia,
    lineNo: 1,
    quantity: c?.m3Declarado ?? 1,
    unit: "m3",
    pieces: 0,
    volumeInputM3: null,
    consumos: 0,
    reprocesosEntrada: 0,
    speciesCommon: "Tornillo",
    duenoMadera: null,
    titularNombre: null,
    originCode: null,
    lineaProduccion: null,
    materiaPrimaRef: null,
    paquetes: [],
    corrida: c,
  });

  it("producción trae origenYSalida por día; consumo no; una fila sin datos no inventa veredicto", () => {
    const filas = [
      ...blas0108.map((c) => fila(c.id, "2026-08-01", c)),
      ...blas2709.map((c) => fila(c.id, "2026-09-27", c)),
      fila("sin", "2026-09-28"),
    ];
    const jornadas = jornadasDesdeFilas(filas, "produccion");
    const de = (d: string) => jornadas.find((j) => j.dia === d)?.origenYSalida;
    expect(de("2026-08-01")?.salida.estado).toBe("sin_guia");
    expect(de("2026-09-27")?.salida.estado).toBe("parcial");
    expect(de("2026-09-28")).toBeUndefined();
    expect(jornadasDesdeFilas(filas, "consumo").every((j) => j.origenYSalida === undefined)).toBe(true);
  });

  it("conOrigenYSalida pega el de cada corrida y decide «sólo este día» con el día entero", () => {
    const base = (id: string, dia: string): CorridaDelDia =>
      ({ id, dia, lineNo: 1, paquetes: [] }) as unknown as CorridaDelDia;
    const datos = new Map(blas2709.map((c) => [c.id, c]));
    const cubs: CubicacionParaVincular[] = [{ id: "k", nombre: "k", m3: 13, pt: 5512, piezas: 221, corridas: ["c61", "c62"] }];
    const [n61, n62, otra] = conOrigenYSalida(
      [base("c61", "2026-09-27"), base("c62", "2026-09-27"), base("z", "2026-09-28")],
      datos,
      cubs,
    );
    expect(n61?.origenYSalida?.salida.estado).toBe("parcial");
    expect(n61?.origenYSalida?.cubicaciones[0]?.soloEsteDia).toBe(true);
    expect(n62?.origenYSalida?.origen).toBe("por_declarar");
    expect(otra?.origenYSalida).toBeUndefined();
  });
});
