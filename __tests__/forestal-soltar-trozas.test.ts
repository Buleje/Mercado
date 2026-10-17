/**
 * «Soltar trozas de una corrida» (ADR-447 §6) — las cuentas puras que comparten
 * la vista previa y el servidor. Los números son los de la N° 61 de Blas
 * (Cachimbo, 27/09): 12 trozas, 28,947 m³, 13,254 m³ producidos, 45,79 %.
 */
import { describe, expect, it } from "vitest";
import {
  destinoDelLote,
  fraseDeSoltar,
  piezasQueTomaLaTanda,
  queDestraba,
  soltarTrozasSchema,
  sugerenciaQueCabe,
  vistaPreviaDeSoltar,
  type ConsumoDeLaCorrida,
  type LoteDeLaPieza,
  type PiezaDeLaCorrida,
} from "@/lib/forestal/soltar-trozas";
import { letrasDelMotivo, limpiarMotivo, motivoLegible, motivoOpcionalSchema, motivoSchema } from "@/lib/forestal/motivo";
import type { PropuestaDeTandaOrigen } from "@/lib/forestal/origen-en-tanda";
import type { DiagnosticoSinOrigen } from "@/lib/forestal/vincular-trozas";

const CORRIDA = "c61";
const LOTE: LoteDeLaPieza = { id: "la11", code: "LA-2026-011", status: "consumido", deEstaCorrida: true, borrado: false };

/* [código, m³, guía] — las 12 de la N° 61. */
const FILAS: [string, number, string][] = [
  ["115-A", 2.808, "g5"],
  ["115-B", 2.153, "g5"],
  ["115-C", 1.956, "g5"],
  ["226-B", 1.44, "g5"],
  ["233-A", 3.453, "g5"],
  ["233-B", 2.394, "g6"],
  ["233-C", 1.917, "g6"],
  ["226-A", 2.149, "g8"],
  ["157A", 4.469, "g9"],
  ["157B", 2.8, "g9"],
  ["232A", 2.14, "g9"],
  ["232B", 1.268, "g9"],
];
const PIEZAS: PiezaDeLaCorrida[] = FILAS.map(([codigo, m3, g]) => ({
  id: codigo,
  woodEntryId: g,
  gtfNumber: `010-001-000000${g.slice(1)}`,
  codigo,
  especie: "Cachimbo",
  m3,
  fechaConsumo: "2026-09-27",
  lote: LOTE,
}));
const CONSUMOS: ConsumoDeLaCorrida[] = [
  { woodEntryId: "g5", gtfNumber: "010-001-0000005", m3: 11.81 },
  { woodEntryId: "g9", gtfNumber: "010-001-0000009", m3: 10.677 },
  { woodEntryId: "g6", gtfNumber: "010-001-0000006", m3: 4.311 },
  { woodEntryId: "g8", gtfNumber: "010-001-0000008", m3: 2.149 },
];
const N61 = { producido: 13.254, unit: "m3", volumenEntradaM3: 28.947 };

describe("vistaPreviaDeSoltar — la N° 61", () => {
  it("soltar 5 trozas: baja la madera, se recalcula lo que rinde y avisa el 56 %", () => {
    const sueltas = ["157A", "115-A", "115-C", "232B", "226-B"]; // 4,469 + 2,808 + 1,956 + 1,268 + 1,44 = 11,941
    const v = vistaPreviaDeSoltar(N61, PIEZAS, CONSUMOS, sueltas);
    expect(v.antes).toEqual({ piezas: 12, m3: 28.947, rendimientoPct: 45.79 });
    expect(v.sueltas).toEqual({ piezas: 5, m3: 11.941 });
    expect(v.despues.piezas).toBe(7);
    expect(v.despues.m3).toBe(17.006);
    expect(v.despues.rendimientoPct).toBe(77.94);
    expect(v.sobreElTope).toBe(true);
    expect(v.imposible).toBe(false);
    expect(v.quedaSinOrigen).toBe(false);
    /* Por guía se RESTA: g5 pierde 2,808 + 1,956 + 1,44; g9, 4,469 + 1,268. */
    const g = new Map(v.porGuia.map((x) => [x.woodEntryId, x]));
    expect(g.get("g5")).toMatchObject({ antes: 11.81, despues: 5.606 });
    expect(g.get("g9")).toMatchObject({ antes: 10.677, despues: 4.94 });
    expect(g.get("g6")).toMatchObject({ antes: 4.311, despues: 4.311 });
    expect(v.consumosNuevos.reduce((a, c) => a + c.volumeM3, 0)).toBeCloseTo(17.006, 4);
    /* El lote sigue siendo de la N° 61 (casillero 10): las 5 salen sueltas. */
    expect(v.lotes).toEqual([{ loteId: "la11", code: "LA-2026-011", destino: "suelta", piezas: 5, quedan: 7 }]);
  });

  it("una guía que se queda sin m³ sale de la atribución", () => {
    const v = vistaPreviaDeSoltar(N61, PIEZAS, CONSUMOS, ["226-A"]);
    expect(v.porGuia.find((x) => x.woodEntryId === "g8")).toMatchObject({ antes: 2.149, despues: 0 });
    expect(v.consumosNuevos.some((c) => c.woodEntryId === "g8")).toBe(false);
  });

  it("dejar menos madera que lo producido es imposible (10 litros de tolerancia)", () => {
    const todasMenosDos = PIEZAS.filter((p) => !["157A", "233-A"].includes(p.id)).map((p) => p.id); // quedan 7,922
    const v = vistaPreviaDeSoltar(N61, PIEZAS, CONSUMOS, todasMenosDos);
    expect(v.despues.m3).toBe(7.922);
    expect(v.imposible).toBe(true);
    expect(v.sobreElTope).toBe(false);
  });

  it("soltarlas todas deja la corrida sin origen y el lote se reabre", () => {
    const v = vistaPreviaDeSoltar(N61, PIEZAS, CONSUMOS, PIEZAS.map((p) => p.id));
    expect(v.quedaSinOrigen).toBe(true);
    expect(v.despues).toEqual({ piezas: 0, m3: null, rendimientoPct: null });
    expect(v.consumosNuevos).toEqual([]);
    expect(v.imposible).toBe(false);
    expect(v.lotes[0]).toMatchObject({ destino: "reabrir", piezas: 12, quedan: 0 });
  });

  it("sin origen, ninguna guía conserva m³ aunque le quede un resto bajo la tolerancia (revisión 28-09)", () => {
    const P: PiezaDeLaCorrida[] = [
      { ...PIEZAS[0]!, id: "a", woodEntryId: "G1", m3: 1, lote: null },
      { ...PIEZAS[0]!, id: "b", woodEntryId: "G1", m3: 1, lote: null },
      { ...PIEZAS[0]!, id: "c", woodEntryId: "G2", m3: 1, lote: null },
    ];
    const v = vistaPreviaDeSoltar(
      { producido: 1, unit: "m3", volumenEntradaM3: 3.005 },
      P,
      [
        { woodEntryId: "G1", gtfNumber: "G1", m3: 2.005 },
        { woodEntryId: "G2", gtfNumber: "G2", m3: 1 },
      ],
      ["a", "b", "c"],
    );
    expect(v.quedaSinOrigen).toBe(true);
    expect(v.consumosNuevos).toEqual([]);
    expect(v.porGuia.every((g) => g.despues === 0)).toBe(true);
  });

  it("una corrida abierta (sin producción) no tiene rendimiento ni imposible", () => {
    const v = vistaPreviaDeSoltar({ producido: null, unit: null, volumenEntradaM3: 28.947 }, PIEZAS, CONSUMOS, ["157A"]);
    expect(v.despues.rendimientoPct).toBeNull();
    expect(v.imposible).toBe(false);
    expect(v.sobreElTope).toBe(false);
  });

  it("una atribución puesta a mano que no cabe se rechaza", () => {
    const aMano: ConsumoDeLaCorrida[] = [...CONSUMOS, { woodEntryId: "gx", gtfNumber: "X", m3: 5 }];
    const v = vistaPreviaDeSoltar(N61, PIEZAS, aMano, ["157A", "115-A", "115-C"]);
    expect(v.sobreAtribuido).toBe(true);
  });

  it("sin volumen escrito, la materia prima son sus piezas", () => {
    const v = vistaPreviaDeSoltar({ ...N61, volumenEntradaM3: null }, PIEZAS, CONSUMOS, []);
    expect(v.antes.m3).toBe(28.947);
  });

  it("un id que no es de la corrida no cuenta", () => {
    const v = vistaPreviaDeSoltar(N61, PIEZAS, CONSUMOS, ["otra"]);
    expect(v.sueltas.piezas).toBe(0);
    expect(v.despues.m3).toBe(28.947);
  });
});

describe("destinoDelLote", () => {
  it("abierto las conserva; consumido por ésta sin piezas suyas se reabre; si no, salen sueltas", () => {
    expect(destinoDelLote({ ...LOTE, status: "abierto" }, 0)).toBe("queda");
    expect(destinoDelLote(LOTE, 0)).toBe("reabrir");
    expect(destinoDelLote(LOTE, 3)).toBe("suelta");
    expect(destinoDelLote({ ...LOTE, deEstaCorrida: false }, 0)).toBe("suelta");
    expect(destinoDelLote({ ...LOTE, status: "cerrado" }, 0)).toBe("suelta");
    expect(destinoDelLote({ ...LOTE, borrado: true, status: "abierto" }, 0)).toBe("suelta");
  });
});

describe("soltarTrozasSchema", () => {
  const ok = { accion: "soltar", corridaId: "c61", trozaIds: ["a", "b"], motivo: "no entraron el 27/09" };
  it("pide motivo, al menos una troza y sin repetidas", () => {
    expect(soltarTrozasSchema.safeParse(ok).success).toBe(true);
    expect(soltarTrozasSchema.safeParse({ ...ok, motivo: "no" }).success).toBe(false);
    expect(soltarTrozasSchema.safeParse({ ...ok, trozaIds: [] }).success).toBe(false);
    expect(soltarTrozasSchema.safeParse({ ...ok, trozaIds: ["a", "a"] }).success).toBe(false);
    expect(soltarTrozasSchema.safeParse({ ...ok, accion: "vincular" }).success).toBe(false);
  });

  it("un motivo de espacios invisibles o sin letras no pasa; el que pasa se guarda limpio (seguridad 28-09)", () => {
    expect(soltarTrozasSchema.safeParse({ ...ok, motivo: "​​​​​​" }).success).toBe(false);
    expect(soltarTrozasSchema.safeParse({ ...ok, motivo: "﻿12345⁠" }).success).toBe(false);
    const r = soltarTrozasSchema.safeParse({ ...ok, motivo: "​no entraron‍ " });
    expect(r.success && r.data.motivo).toBe("no entraron");
  });
});

describe("motivo.ts — la regla única de los motivos del módulo", () => {
  it("quita los invisibles, recorta y pide tres letras", () => {
    expect(limpiarMotivo("​ hola ﻿")).toBe("hola");
    expect(letrasDelMotivo("12/09 ñu")).toBe(2);
    expect(motivoLegible("año")).toBe(true);
    expect(motivoLegible("​‌‍")).toBe(false);
    expect(motivoLegible("123")).toBe(false);
    expect(motivoSchema({ max: 10 }).safeParse("abcdefghijk").success).toBe(false);
    expect(motivoSchema({ mensaje: "Pon el motivo" }).safeParse("..").error?.issues[0]?.message).toBe("Pon el motivo");
    const opcional = motivoOpcionalSchema(300);
    expect(opcional.safeParse(undefined).success).toBe(true);
    expect(opcional.safeParse("​").data).toBe("");
  });
});

describe("queDestraba y la sugerencia", () => {
  const corrida = (id: string, lineNo: number, fecha: string, motivo: string, tomadora?: string) => ({
    corridaId: id,
    lineNo,
    fecha,
    especie: "Cachimbo",
    permiso: null,
    m3Producido: 1,
    motivo,
    detalle: `detalle ${lineNo}`,
    propuesta: [],
    m3Propuesto: 0,
    arreglo: tomadora
      ? { tipo: "soltar_corrida", corridas: [{ corridaId: tomadora, lineNo: 61, fecha: "2026-09-27", m3Producido: 13.254, abierta: false, trozas: 12, m3: 28.947, sumadasPct: 50 }] }
      : { tipo: "ninguno" },
  });
  const diag = (cs: ReturnType<typeof corrida>[]) => ({ corridas: cs, porMotivo: {}, total: cs.length }) as unknown as DiagnosticoSinOrigen;
  const tanda = (listas: number, vinculables: number, grupos: PropuestaDeTandaOrigen["grupos"] = []) =>
    ({ grupos, listas, vinculables, m3Producido: 0, m3Trozas: 0, pedido: [] }) as PropuestaDeTandaOrigen;

  it("nombra las que pasan a listas y las que esperaban y siguen trabadas", () => {
    const antes = diag([corrida("a", 32, "2026-09-07", "tomada_por_otra_corrida", CORRIDA), corrida("b", 48, "2026-09-10", "tomada_por_otra_corrida", CORRIDA)]);
    const despues = diag([corrida("a", 32, "2026-09-07", "lista"), corrida("b", 48, "2026-09-10", "llegada_posterior")]);
    const r = queDestraba(CORRIDA, { diag: antes, tanda: tanda(0, 0) }, { diag: despues, tanda: tanda(1, 1) });
    expect(r.nuevas.map((c) => c.lineNo)).toEqual([32]);
    expect(r.siguen).toEqual([expect.objectContaining({ lineNo: 48, detalle: "detalle 48" })]);
    expect([r.listasAntes, r.listasDespues, r.enTandaAntes, r.enTandaDespues]).toEqual([0, 1, 0, 1]);
  });

  it("con la llegada corregida: nombra las que entrarían (sin la corrida que suelta); si no suma, null", () => {
    const antes = diag([corrida("a", 32, "2026-09-07", "tomada_por_otra_corrida", CORRIDA)]);
    const despues = diag([corrida("a", 32, "2026-09-07", "llegada_posterior")]);
    const grupos = [
      {
        corridas: [
          { corridaId: "a", lineNo: 32, fecha: "2026-09-07", especie: "Cachimbo", m3Producido: 2.197, trozas: [] },
          { corridaId: CORRIDA, lineNo: 61, fecha: "2026-09-27", especie: "Cachimbo", m3Producido: 13.254, trozas: [] },
        ],
      },
    ] as unknown as PropuestaDeTandaOrigen["grupos"];
    const r = queDestraba(CORRIDA, { diag: antes, tanda: tanda(0, 0) }, { diag: despues, tanda: tanda(0, 0) }, { guias: ["010-001-0000005"], tanda: tanda(2, 2, grupos) });
    expect(r.nuevas).toEqual([]);
    expect(r.conLlegada).toEqual({ guias: ["010-001-0000005"], enTanda: [expect.objectContaining({ corridaId: "a", lineNo: 32 })] });
    const igual = queDestraba(CORRIDA, { diag: antes, tanda: tanda(0, 0) }, { diag: despues, tanda: tanda(1, 1) }, { guias: ["x"], tanda: tanda(1, 1) });
    expect(igual.conLlegada).toBeNull();
  });

  it("la sugerencia son las piezas de la corrida que la tanda le da a OTRAS", () => {
    const grupos = [
      {
        clave: "k",
        especie: "Cachimbo",
        permiso: null,
        corridas: [
          { corridaId: "a", trozas: [{ trozaId: "157A" }, { trozaId: "suelta-del-patio" }] },
          { corridaId: CORRIDA, trozas: [{ trozaId: "115-B" }] },
        ],
        fuera: [],
        m3Producido: 0,
        m3Trozas: 0,
      },
    ] as unknown as PropuestaDeTandaOrigen["grupos"];
    expect(piezasQueTomaLaTanda(tanda(2, 2, grupos), CORRIDA, new Set(PIEZAS.map((p) => p.id)))).toEqual([{ corridaId: "a", trozaIds: ["157A"] }]);
  });

  it("la sugerencia que cabe salta la corrida que dejaría a la N° 61 sin madera para lo producido", () => {
    /* Tres corridas que esperan, en orden: la 2ª pide tanto que la N° 61 no llegaría a 13,254. */
    const pide = [
      { corridaId: "a", trozaIds: ["157A", "115-A"] }, // 7,277 → quedan 21,67
      { corridaId: "b", trozaIds: ["233-A", "233-B", "157B"] }, // 8,647 → quedarían 13,023: no alcanza
      { corridaId: "c", trozaIds: ["232B"] }, // 1,268 → quedan 20,402
    ];
    expect(sugerenciaQueCabe(N61, PIEZAS, CONSUMOS, pide)).toEqual(["157A", "115-A", "232B"]);
    /* Nunca la deja sin origen, aunque «todas» sea válido para la escritura. */
    expect(sugerenciaQueCabe({ ...N61, producido: 0 }, PIEZAS, CONSUMOS, [{ corridaId: "a", trozaIds: PIEZAS.map((p) => p.id) }])).toEqual([]);
  });
});

describe("fraseDeSoltar", () => {
  it("dice qué volvió y cómo quedó, en su unidad", () => {
    const base = { ok: true as const, corridaId: "c", lineNo: 61, piezas: 5, m3: 11.941, lotes: [], consumos: [], antes: { piezas: 12, m3: 28.947, rendimientoPct: 45.79 } };
    /* El separador lo pone `lib/format` (y el ICU de node puede dar punto): se afirma la cifra, no el separador. */
    expect(fraseDeSoltar({ ...base, despues: { piezas: 7, m3: 17.006, rendimientoPct: 77.94 }, sobreElTope: true, quedaSinOrigen: false })).toMatch(
      /^La N\.º 61 devolvió 5 trozas al patio \(11[.,]941 m³\)\. Ahora rinde 77[.,]9 %, más que el 56 % de la plaza\.$/,
    );
    expect(fraseDeSoltar({ ...base, piezas: 1, despues: { piezas: 0, m3: null, rendimientoPct: null }, sobreElTope: false, quedaSinOrigen: true })).toMatch(
      /^La N\.º 61 devolvió 1 troza al patio \(11[.,]941 m³\)\. La corrida quedó sin origen, con lo producido intacto\.$/,
    );
  });
});
