/**
 * «Vincular con el lote mixto» (ADR-441, paso 7): la propuesta por corrida.
 *
 * Lo que se prueba es la decisión 1 del dueño —toda la madera libre de la
 * especie va a la corrida, repartida por lote— y lo que la frena: la corrida
 * sin trozas de su especie, T3 (la troza que llegó después), el producido que
 * pasa lo que entró, I2 por guía, y el tope del 56 % que avisa sin bloquear.
 * El modo «justo 56 %» reusa la tanda de siempre.
 */

import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  MAX_PARTES_POR_CORRIDA,
  planDelMixto,
  problemaDePartes,
  vincularCorridaSchema,
  type CorridaDelMixto,
  type LoteDelMixto,
} from "@/lib/forestal/vincular-desde-mixto";

const troza = (o: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: "t",
  woodEntryId: "w1",
  codificacion: null,
  codigoPlanta: "100",
  especieComun: "Mashonaste",
  volumenM3: 1,
  gtfNumber: "001-0000500",
  fechaRecepcion: "2026-09-20",
  guiaRecepcionada: true,
  consumidaEnId: null,
  ...o,
});

const corrida = (o: Partial<CorridaDelMixto> = {}): CorridaDelMixto => ({
  id: "c1",
  lineNo: 40,
  especie: "Mashonaste",
  volumenM3: 0.9,
  fecha: "2026-09-25",
  ...o,
});

/* La Mashonaste del mixto vino de DOS permisos: dos lotes hijos (ADR-441). */
const loteA = (trozas: TrozaConsumible[] = [
  troza({ id: "m1", codigoPlanta: "101", volumenM3: 1.2 }),
  troza({ id: "m2", codigoPlanta: "102", volumenM3: 0.8 }),
]): LoteDelMixto => ({ id: "LA", code: "LA-2026-010", especie: "Mashonaste", permiso: "CON-P1", trozas });
const loteB = (trozas: TrozaConsumible[] = [
  troza({ id: "m3", codigoPlanta: "103", volumenM3: 1.0, woodEntryId: "w2", gtfNumber: "001-0000501" }),
]): LoteDelMixto => ({ id: "LB", code: "LA-2026-011", especie: "Mashonaste", permiso: "CON-P2", trozas });
const loteTornillo: LoteDelMixto = {
  id: "LT",
  code: "LA-2026-012",
  especie: "Tornillo",
  permiso: "CON-P1",
  trozas: [troza({ id: "t1", codigoPlanta: "201", especieComun: "Tornillo", volumenM3: 2 })],
};

describe("planDelMixto — decisión 1: toda la madera de la especie", () => {
  it("una especie en dos permisos = una corrida con DOS partes y todas sus trozas", () => {
    const p = planDelMixto({ corridas: [corrida()], lotes: [loteA(), loteB(), loteTornillo] });
    const c = p.propuestas[0]!;
    expect(c.puedeVincular).toBe(true);
    expect(c.frena).toBeNull();
    expect(c.partes.map((x) => [x.code, x.permiso, x.piezas, x.volumenM3])).toEqual([
      ["LA-2026-010", "CON-P1", 2, 2],
      ["LA-2026-011", "CON-P2", 1, 1],
    ]);
    expect(c.piezas).toBe(3);
    expect(c.trozaM3).toBe(3);
    /* 0,9 / 3,0 = 30 %: el rendimiento real, sin maquillar. */
    expect(c.rendimientoPct).toBe(30);
    expect(c.sobreElTope).toBe(false);
    expect(c.pedido).toEqual({
      corridaId: "c1",
      partes: [
        { loteId: "LA", trozaIds: ["m1", "m2"] },
        { loteId: "LB", trozaIds: ["m3"] },
      ],
    });
    /* El pedido es exactamente lo que la ruta acepta. */
    expect(vincularCorridaSchema.safeParse(c.pedido).success).toBe(true);
    expect(p.vinculables).toBe(1);
  });

  it("la madera de una especie sin corrida del día queda como saldo y se dice", () => {
    const p = planDelMixto({ corridas: [corrida()], lotes: [loteA(), loteB(), loteTornillo] });
    expect(p.especiesSinCorrida).toEqual([{ especie: "Tornillo", piezas: 1, volumenM3: 2 }]);
    expect(p.saldo.map((s) => [s.code, s.trozaIds])).toEqual([["LA-2026-012", ["t1"]]]);
  });

  it("destildar una troza la saca de la corrida y la deja como saldo en SU lote", () => {
    const p = planDelMixto({ corridas: [corrida()], lotes: [loteA(), loteB()] }, { excluidas: ["m3"] });
    const c = p.propuestas[0]!;
    expect(c.partes.map((x) => x.code)).toEqual(["LA-2026-010"]);
    expect(c.trozaM3).toBe(2);
    expect(c.rendimientoPct).toBe(45);
    expect(p.saldo).toEqual([
      expect.objectContaining({ loteId: "LB", code: "LA-2026-011", trozaIds: ["m3"], piezas: 1, volumenM3: 1 }),
    ]);
  });

  it("la especie se compara sin tildes ni mayúsculas (claveEspecie)", () => {
    const p = planDelMixto({ corridas: [corrida({ especie: "MASHONASTE " })], lotes: [loteA(), loteB()] });
    expect(p.propuestas[0]!.piezas).toBe(3);
  });
});

describe("planDelMixto — lo que frena", () => {
  it("corrida sin trozas de su especie: no se ofrece y dice por qué", () => {
    const p = planDelMixto({ corridas: [corrida({ id: "ced", especie: "Cedro" })], lotes: [loteA(), loteB()] });
    const c = p.propuestas[0]!;
    expect(c.frena).toBe("sin-trozas");
    expect(c.puedeVincular).toBe(false);
    expect(c.pedido).toBeNull();
    expect(c.mensaje).toMatch(/No hay trozas de Cedro/);
    /* Y la Mashonaste, que nadie reclamó, queda a la vista. */
    expect(p.especiesSinCorrida.map((e) => e.especie)).toEqual(["Mashonaste"]);
  });

  it("T3: la troza que llegó DESPUÉS de la corrida no se le propone", () => {
    const tarde = loteB([troza({ id: "m3", codigoPlanta: "103", volumenM3: 1, fechaRecepcion: "2026-09-26" })]);
    const p = planDelMixto({ corridas: [corrida()], lotes: [loteA(), tarde] });
    const c = p.propuestas[0]!;
    expect(c.partes.flatMap((x) => x.trozaIds)).toEqual(["m1", "m2"]);
    expect(c.hallazgos.some((h) => h.regla === "fecha")).toBe(false);
    expect(p.saldo.flatMap((s) => s.trozaIds)).toEqual(["m3"]);
  });

  it("T3: si TODA la madera de la especie llegó después, frena por fecha", () => {
    const tardes = loteA([
      troza({ id: "m1", volumenM3: 1.2, fechaRecepcion: "2026-09-27" }),
      troza({ id: "m2", volumenM3: 0.8, fechaRecepcion: "2026-09-28" }),
    ]);
    const c = planDelMixto({ corridas: [corrida()], lotes: [tardes] }).propuestas[0]!;
    expect(c.frena).toBe("fecha");
    expect(c.mensaje).toMatch(/después del 2026-09-25/);
    expect(c.pedido).toBeNull();
  });

  it("sobre el 56 %: avisa, guarda el número real y se firma igual", () => {
    const c = planDelMixto({ corridas: [corrida({ volumenM3: 2 })], lotes: [loteA(), loteB()] }).propuestas[0]!;
    expect(c.rendimientoPct).toBe(66.67);
    expect(c.sobreElTope).toBe(true);
    expect(c.puedeVincular).toBe(true);
    expect(c.hallazgos).toContainEqual(expect.objectContaining({ regla: "volumen", severidad: "aviso" }));
  });

  it("producido > trozas: error de volumen y sin pedido", () => {
    const c = planDelMixto({ corridas: [corrida({ volumenM3: 3.5 })], lotes: [loteA(), loteB()] }).propuestas[0]!;
    expect(c.frena).toBe("regla");
    expect(c.puedeVincular).toBe(false);
    expect(c.mensaje).toMatch(/nunca sale más madera de la que entró/);
    expect(c.pedido).toBeNull();
  });

  it("I2 por guía: si lo propuesto pasa lo que la guía declara, se frena ANTES del 422", () => {
    const deUnaGuia = loteA([
      troza({ id: "m1", volumenM3: 1.2, guiaVolumenM3: 1.5, guiaConsumidoM3: 0 }),
      troza({ id: "m2", volumenM3: 0.8, guiaVolumenM3: 1.5, guiaConsumidoM3: 0 }),
    ]);
    const c = planDelMixto({ corridas: [corrida()], lotes: [deUnaGuia] }).propuestas[0]!;
    expect(c.frena).toBe("regla");
    expect(c.mensaje).toMatch(/001-0000500.*no cuadra consigo misma/);
  });

  it("corrida que ya tiene materia prima, sin especie o sin m³: se aparta con su motivo", () => {
    const p = planDelMixto({
      corridas: [
        corrida({ id: "origen", tieneMateriaPrima: true }),
        corrida({ id: "sinesp", especie: null }),
        corrida({ id: "sinvol", volumenM3: null }),
      ],
      lotes: [loteA()],
    });
    expect(p.propuestas.map((x) => [x.corrida.id, x.frena])).toEqual([
      ["origen", "ya-tiene-origen"],
      ["sinesp", "sin-especie"],
      ["sinvol", "sin-volumen"],
    ]);
    expect(p.propuestas.every((x) => x.pedido == null)).toBe(true);
    /* Nadie la reclamó: la madera sigue entera en el lote. */
    expect(p.saldo.flatMap((s) => s.trozaIds)).toEqual(["m1", "m2"]);
  });

  it("más de seis lotes en una corrida: error, la ruta no lo aceptaría", () => {
    const lotes = Array.from({ length: MAX_PARTES_POR_CORRIDA + 1 }, (_, k) => ({
      id: `L${k}`,
      code: `LA-2026-0${k + 20}`,
      especie: "Mashonaste",
      permiso: `P${k}`,
      trozas: [troza({ id: `x${k}`, codigoPlanta: String(300 + k), volumenM3: 0.5 })],
    }));
    const c = planDelMixto({ corridas: [corrida()], lotes }).propuestas[0]!;
    expect(c.partes).toHaveLength(7);
    expect(c.frena).toBe("regla");
    expect(c.mensaje).toMatch(/admite 6/);
  });
});

describe("planDelMixto — trozas que no van", () => {
  it("despachada, sin recibir y de otra especie se dicen; la ya consumida es historia", () => {
    const lote = loteA([
      troza({ id: "ok", volumenM3: 1.2 }),
      troza({ id: "desp", codigoPlanta: "105", despachadaEnId: "D1" }),
      troza({ id: "norec", codigoPlanta: "106", guiaRecepcionada: false }),
      troza({ id: "otra", codigoPlanta: "107", especieComun: "Tornillo" }),
      troza({ id: "usada", codigoPlanta: "108", consumidaEnId: "C9" }),
    ]);
    const p = planDelMixto({ corridas: [corrida()], lotes: [lote] });
    expect(p.propuestas[0]!.partes.flatMap((x) => x.trozaIds)).toEqual(["ok"]);
    expect(p.noVan.map((n) => [n.id, n.motivo])).toEqual([
      ["desp", "Ya salió despachada sin aserrar"],
      ["norec", "su guía todavía no se recibió en el patio"],
      ["otra", "es Tornillo y el lote LA-2026-010 es de Mashonaste"],
    ]);
  });

  it("un lote que ya no está abierto no aporta madera", () => {
    const cerrado = { ...loteB(), status: "cerrado" };
    const p = planDelMixto({ corridas: [corrida()], lotes: [loteA(), cerrado] });
    expect(p.propuestas[0]!.partes.map((x) => x.loteId)).toEqual(["LA"]);
    expect(p.noVan).toEqual([expect.objectContaining({ id: "m3", motivo: "el lote LA-2026-011 está cerrado" })]);
  });
});

describe("planDelMixto — dos corridas de la misma especie", () => {
  const cinco = loteA([
    troza({ id: "a", codigoPlanta: "101", volumenM3: 1.2 }),
    troza({ id: "b", codigoPlanta: "102", volumenM3: 0.8 }),
    troza({ id: "c", codigoPlanta: "103", volumenM3: 1.0 }),
    troza({ id: "d", codigoPlanta: "104", volumenM3: 1.0 }),
    troza({ id: "e", codigoPlanta: "105", volumenM3: 1.0 }),
  ]);
  const dos = [
    corrida({ id: "lun", lineNo: 41, fecha: "2026-09-24", volumenM3: 0.6 }),
    corrida({ id: "mar", lineNo: 42, fecha: "2026-09-25", volumenM3: 1.2 }),
  ];

  it("modo todo: reparte TODA la madera, cada troza a una sola corrida, y cada una cubre lo que produjo", () => {
    const p = planDelMixto({ corridas: dos, lotes: [cinco] });
    const ids = p.propuestas.flatMap((x) => x.partes.flatMap((y) => y.trozaIds));
    expect([...ids].sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(new Set(ids).size).toBe(5);
    expect(p.saldo).toEqual([]);
    for (const x of p.propuestas) {
      expect(x.puedeVincular).toBe(true);
      expect(x.trozaM3).toBeGreaterThanOrEqual(x.corrida.volumenM3!);
    }
    expect(p.propuestas.reduce((a, x) => a + x.trozaM3, 0)).toBeCloseTo(5, 4);
  });

  it("modo todo respeta T3: la troza del martes no va a la corrida del lunes", () => {
    const conMartes = loteA([
      troza({ id: "a", codigoPlanta: "101", volumenM3: 1.2 }),
      troza({ id: "b", codigoPlanta: "102", volumenM3: 1.5 }),
      troza({ id: "z", codigoPlanta: "199", volumenM3: 2.0, fechaRecepcion: "2026-09-25" }),
    ]);
    const p = planDelMixto({ corridas: dos, lotes: [conMartes] });
    const lunes = p.propuestas.find((x) => x.corrida.id === "lun")!;
    const martes = p.propuestas.find((x) => x.corrida.id === "mar")!;
    expect(lunes.partes.flatMap((x) => x.trozaIds)).not.toContain("z");
    expect(martes.partes.flatMap((x) => x.trozaIds)).toContain("z");
  });

  it("modo justo 56 %: sólo lo que hace falta, el resto queda de saldo", () => {
    const p = planDelMixto({ corridas: [corrida()], lotes: [loteA(), loteB()] }, { modo: "justo56" });
    const c = p.propuestas[0]!;
    /* 0,9 m³ → cubre con 101 (1,2) y completa hasta 0,9/0,56 = 1,607 con 102. */
    expect(c.partes.flatMap((x) => x.trozaIds)).toEqual(["m1", "m2"]);
    expect(c.trozaM3).toBe(2);
    expect(c.rendimientoPct).toBe(45);
    expect(p.modo).toBe("justo56");
    expect(p.saldo.flatMap((s) => s.trozaIds)).toEqual(["m3"]);
  });
});

describe("problemaDePartes — el pedido antes de la base", () => {
  it("acepta un pedido bien armado", () => {
    expect(problemaDePartes([{ loteId: "A", trozaIds: ["1", "2"] }, { loteId: "B", trozaIds: ["3"] }])).toBeNull();
  });
  it("rechaza vacío, más de seis, lote repetido, troza repetida y lote sin trozas", () => {
    expect(problemaDePartes([])).toMatch(/al menos un lote/);
    expect(problemaDePartes(Array.from({ length: 7 }, (_, k) => ({ loteId: `L${k}`, trozaIds: [`t${k}`] })))).toMatch(
      /hasta 6 lotes/,
    );
    expect(problemaDePartes([{ loteId: "A", trozaIds: ["1"] }, { loteId: "A", trozaIds: ["2"] }])).toMatch(
      /mismo lote aparece dos veces/,
    );
    expect(problemaDePartes([{ loteId: "A", trozaIds: ["1"] }, { loteId: "B", trozaIds: ["1"] }])).toMatch(
      /misma troza aparece dos veces/,
    );
    expect(problemaDePartes([{ loteId: "A", trozaIds: [] }])).toMatch(/lote sin trozas/);
  });
  it("el esquema de la ruta pone los mismos topes", () => {
    expect(vincularCorridaSchema.safeParse({ corridaId: "c", partes: [] }).success).toBe(false);
    expect(
      vincularCorridaSchema.safeParse({ corridaId: "c", partes: [{ loteId: "A", trozaIds: ["1"] }], fecha: "26/09/2026" })
        .success,
    ).toBe(false);
  });
  it("la fecha tiene que ser un día que existe, no sólo la forma AAAA-MM-DD", () => {
    const conFecha = (fecha: string) =>
      vincularCorridaSchema.safeParse({ corridaId: "c", partes: [{ loteId: "A", trozaIds: ["1"] }], fecha });
    /* La forma pasaba el regex viejo; `new Date("2026-13-45T12:00:00.000Z")` es Invalid Date. */
    for (const mala of ["2026-13-45", "2026-02-30", "2026-02-29", "2026-00-10", "2026-04-31"]) {
      const r = conFecha(mala);
      expect(r.success, mala).toBe(false);
      expect(r.error?.issues[0]?.message).toMatch(/fecha real/);
    }
    expect(conFecha("2024-02-29").success).toBe(true); // bisiesto
    const ok = conFecha(" 2026-09-26 ");
    expect(ok.success).toBe(true);
    expect(ok.data?.fecha).toBe("2026-09-26"); // el trim corre antes del formato
    /* Sin fecha sigue valiendo: el día de la corrida. */
    expect(vincularCorridaSchema.safeParse({ corridaId: "c", partes: [{ loteId: "A", trozaIds: ["1"] }] }).success).toBe(true);
  });
});

describe("planDelMixto — el permiso de la corrida (ADR-447)", () => {
  it("corrida con permiso P1 y lotes P1 + P2: sólo se ofrece la parte de P1 (el servidor rechaza la otra)", () => {
    const c = planDelMixto({ corridas: [corrida({ permiso: "CON-P1" })], lotes: [loteA(), loteB()] }).propuestas[0]!;
    expect(c.partes.map((x) => x.permiso)).toEqual(["CON-P1"]);
    expect(c.pedido?.partes).toEqual([{ loteId: "LA", trozaIds: ["m1", "m2"] }]);
    expect(c.trozaM3).toBe(2);
  });

  it("corrida con permiso P1 y sólo madera de P2: no sale `puedeVincular` y dice que es de otro permiso", () => {
    const c = planDelMixto({ corridas: [corrida({ permiso: "CON-P1" })], lotes: [loteB()] }).propuestas[0]!;
    expect(c.puedeVincular).toBe(false);
    expect(c.pedido).toBeNull();
    expect(c.mensaje).toMatch(/son de otro permiso \(CON-P2\) y la corrida es del CON-P1/);
  });

  it("la GUÍA de la troza también cuenta: en un lote «de todos», la troza de P2 no va a una corrida P1", () => {
    const deTodos: LoteDelMixto = {
      id: "LX",
      code: "LA-2026-013",
      especie: "Mashonaste",
      permiso: null,
      trozas: [troza({ id: "x1", permiso: "CON-P1", volumenM3: 1 }), troza({ id: "x2", permiso: "CON-P2", volumenM3: 1 })],
    };
    const c = planDelMixto({ corridas: [corrida({ permiso: "CON-P1" })], lotes: [deTodos] }).propuestas[0]!;
    expect(c.pedido?.partes).toEqual([{ loteId: "LX", trozaIds: ["x1"] }]);
  });

  it("corrida SIN permiso: sigue tomando los dos permisos, como decidió Brandon para el mixto (ADR-441)", () => {
    const c = planDelMixto({ corridas: [corrida({ permiso: null })], lotes: [loteA(), loteB()] }).propuestas[0]!;
    expect(c.puedeVincular).toBe(true);
    expect(c.partes.map((x) => x.permiso)).toEqual(["CON-P1", "CON-P2"]);
  });

  it("una con permiso y otra sin él, de la misma especie: la de permiso toma el suyo primero y ninguna troza va a dos", () => {
    const p = planDelMixto({
      corridas: [corrida({ id: "sin", fecha: "2026-09-24", permiso: null }), corrida({ id: "p2", fecha: "2026-09-25", permiso: "CON-P2" })],
      lotes: [loteA(), loteB()],
    });
    const [sin, p2] = [p.propuestas.find((x) => x.corrida.id === "sin")!, p.propuestas.find((x) => x.corrida.id === "p2")!];
    expect(p2.pedido?.partes).toEqual([{ loteId: "LB", trozaIds: ["m3"] }]);
    expect(sin.pedido?.partes).toEqual([{ loteId: "LA", trozaIds: ["m1", "m2"] }]);
  });
});
