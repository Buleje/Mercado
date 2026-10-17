/**
 * Lote mixto (ADR-441) — lo PURO: correlativo, contrato, tarjetas, plan de
 * reparto y las reglas del cliente (LM1/LM4). Lo que escribe la base está en
 * `forestal-lote-mixto-db.test.ts`.
 *
 * Los permisos y especies imitan el patio de Blas medido el 26-09: Mashonaste
 * en DOS permisos (el caso que obliga a repartir por especie+permiso, no sólo
 * por especie).
 */
import { describe, expect, it } from "vitest";
import {
  accionLoteMixtoSchema,
  crearLoteMixtoSchema,
  gruposDelMixto,
  mensajeApartadasEnMixto,
  mixtoVivo,
  planDeReparto,
  resumenDelMixto,
  siguienteCodigoLoteMixto,
} from "@/lib/forestal/lote-mixto";
import { motivoFueraDeLaPila } from "@/lib/forestal/lote-por-escaneo";
import { trozasDelLote, disponiblePorEspecie } from "@/lib/forestal/lote-programacion";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const P1 = "19-SEC/REG-PLT-2021-017";
const P2 = "19-SEC/REG-PLT-2018-020";

let n = 0;
const troza = (over: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: `t${++n}`,
  woodEntryId: "w1",
  codificacion: `C-${n}`,
  especieComun: "Mashonaste",
  volumenM3: 1,
  permiso: P1,
  gtfNumber: "010-001-0000013",
  guiaRecepcionada: true,
  ...over,
});

describe("correlativo LM-AAAA-NNN", () => {
  it("sigue al mayor del año, comparando por número y no por texto", () => {
    expect(siguienteCodigoLoteMixto([], 2026)).toBe("LM-2026-001");
    expect(siguienteCodigoLoteMixto(["LM-2026-009", "LM-2026-010"], 2026)).toBe("LM-2026-011");
    /* Como cadena, «LM-2026-999» ordena DESPUÉS de «LM-2026-1000»: con un
       `orderBy code desc` el correlativo volvería a 1000 y chocaría. */
    expect(siguienteCodigoLoteMixto(["LM-2026-999", "LM-2026-1000"], 2026)).toBe("LM-2026-1001");
  });

  it("los de otro año y los que no son del correlativo no cuentan", () => {
    expect(siguienteCodigoLoteMixto(["LM-2025-040", "LM-2026-abc", "LA-2026-050"], 2026)).toBe("LM-2026-001");
  });
});

describe("mixtoVivo — el estado, no el id pelado", () => {
  it("sólo un mixto abierto y sin borrar aparta", () => {
    expect(mixtoVivo({ status: "abierto", deletedAt: null })).toBe(true);
    expect(mixtoVivo({ status: "repartido", deletedAt: null })).toBe(false);
    expect(mixtoVivo({ status: "anulado", deletedAt: null })).toBe(false);
    expect(mixtoVivo({ status: "abierto", deletedAt: new Date() })).toBe(false);
    expect(mixtoVivo(null)).toBe(false);
  });
});

describe("mensajeApartadasEnMixto — LM4 fuera de los lotes (consumo a mano, despacho, retrozado)", () => {
  it("una pieza: dónde está y los dos caminos", () => {
    expect(mensajeApartadasEnMixto([{ codigo: "1234", mixto: "LM-2026-001" }])).toBe(
      "La troza 1234 está en LM-2026-001: repártelo o sácala del mixto.",
    );
  });
  it("varias del mismo mixto, y de dos mixtos", () => {
    expect(
      mensajeApartadasEnMixto([
        { codigo: "A", mixto: "LM-2026-001" },
        { codigo: "B", mixto: "LM-2026-001" },
      ]),
    ).toBe("Las trozas A y B están en LM-2026-001: repártelo o sácalas del mixto.");
    expect(
      mensajeApartadasEnMixto([
        { codigo: "A", mixto: "LM-2026-001" },
        { codigo: "B", mixto: "LM-2026-002" },
        { codigo: "C", mixto: "LM-2026-001" },
      ]),
    ).toBe("Las trozas A y C están en LM-2026-001; B está en LM-2026-002: repártelos o sácalas de los mixtos.");
  });
  it("una pila grande nombra cinco y cuenta el resto", () => {
    const piezas = Array.from({ length: 8 }, (_, k) => ({ codigo: `T${k + 1}`, mixto: "LM-2026-003" }));
    expect(mensajeApartadasEnMixto(piezas)).toBe(
      "Las trozas T1, T2, T3, T4, T5 y 3 más están en LM-2026-003: repártelo o sácalas del mixto.",
    );
  });
});

describe("contrato HTTP (Zod)", () => {
  it("las cuatro acciones con su forma", () => {
    expect(accionLoteMixtoSchema.safeParse({ accion: "agregar", loteMixtoId: "m1", trozaIds: ["a"] }).success).toBe(true);
    expect(accionLoteMixtoSchema.safeParse({ accion: "quitar", loteMixtoId: "m1", trozaIds: ["a"] }).success).toBe(true);
    expect(
      accionLoteMixtoSchema.safeParse({ accion: "repartir", loteMixtoId: "m1", destinos: { "mashonaste|P": "l1" } }).success,
    ).toBe(true);
    expect(accionLoteMixtoSchema.safeParse({ accion: "repartir", loteMixtoId: "m1" }).success).toBe(true);
    expect(accionLoteMixtoSchema.safeParse({ accion: "anular", loteMixtoId: "m1", motivo: "error de escaneo" }).success).toBe(true);
  });

  it("rechaza lo que no se puede: sin trozas, más de 500, motivo corto, acción desconocida", () => {
    expect(accionLoteMixtoSchema.safeParse({ accion: "agregar", loteMixtoId: "m1", trozaIds: [] }).success).toBe(false);
    const muchas = Array.from({ length: 501 }, (_, i) => `t${i}`);
    expect(accionLoteMixtoSchema.safeParse({ accion: "agregar", loteMixtoId: "m1", trozaIds: muchas }).success).toBe(false);
    expect(accionLoteMixtoSchema.safeParse({ accion: "anular", loteMixtoId: "m1", motivo: "no" }).success).toBe(false);
    expect(accionLoteMixtoSchema.safeParse({ accion: "borrar", loteMixtoId: "m1" }).success).toBe(false);
    expect(accionLoteMixtoSchema.safeParse({ accion: "agregar", trozaIds: ["a"] }).success).toBe(false);
  });

  it("POST vacío es un pedido válido (abrir el mixto)", () => {
    expect(crearLoteMixtoSchema.safeParse({}).success).toBe(true);
    expect(crearLoteMixtoSchema.safeParse({ nuevo: true, notas: "pila del lunes" }).success).toBe(true);
  });
});

describe("tarjetas del mixto", () => {
  it("agrupa por especie+permiso en orden de escaneo, con pt Oxapampa o ≈ aserrable", () => {
    const pila = [
      troza({ especieComun: "Mashonaste", permiso: P1, volumenM3: 1 }),
      troza({ especieComun: "Tornillo", permiso: P1, volumenM3: 2, oxPt: 300 }),
      troza({ especieComun: "Mashonaste", permiso: P2, volumenM3: 1 }),
      troza({ especieComun: "mashonaste", permiso: P1, volumenM3: 0.5 }),
    ];
    const g = gruposDelMixto(pila);
    expect(g.map((x) => [x.especie, x.permiso, x.piezas])).toEqual([
      ["Mashonaste", P1, 2],
      ["Tornillo", P1, 1],
      ["Mashonaste", P2, 1],
    ]);
    // 1,5 m³ sin cubicar → ≈ 1,5 × 0,56 × 424 = 356 pt aserrables.
    expect(g[0]).toMatchObject({ m3: 1.5, pt: 356, ptOxapampa: 0, cubicadas: 0, sinCubicar: 2 });
    // Cubicada en Oxapampa: manda el pt medido.
    expect(g[1]).toMatchObject({ pt: 300, ptOxapampa: 300, cubicadas: 1, sinCubicar: 0 });
    const r = resumenDelMixto(pila, g);
    expect(r).toMatchObject({ piezas: 4, m3: 4.5, especies: 2, grupos: 3, cubicadas: 1, sinCubicar: 3 });
  });
});

describe("planDeReparto — la vista previa y el servidor deciden igual", () => {
  const pila = [
    troza({ especieComun: "Mashonaste", permiso: P1 }),
    troza({ especieComun: "Mashonaste", permiso: P2 }),
    troza({ especieComun: "Tornillo", permiso: P1 }),
  ];
  const clave = (especie: string, permiso: string) => `${especie.toLowerCase()}|${permiso}`;

  it("sin destinos: un lote nuevo por especie+permiso (Mashonaste de dos permisos → dos lotes)", () => {
    const plan = planDeReparto(pila, []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.pasos.map((p) => [p.grupo.especie, p.grupo.permiso, p.destino.tipo])).toEqual([
      ["Mashonaste", P1, "nuevo"],
      ["Mashonaste", P2, "nuevo"],
      ["Tornillo", P1, "nuevo"],
    ]);
  });

  it("con destino: suma a un lote abierto que lo acepta", () => {
    const plan = planDeReparto(pila, [{ id: "L7", code: "LA-2026-007", speciesCommon: "Tornillo", permiso: P1 }], {
      [clave("Tornillo", P1)]: "L7",
    });
    expect(plan.ok && plan.pasos[2].destino).toEqual({ tipo: "sumar", loteId: "L7", code: "LA-2026-007" });
  });

  it("un destino de otra especie, de otro permiso o ya cerrado invalida el reparto ENTERO", () => {
    const otraEspecie = planDeReparto(pila, [{ id: "L7", code: "LA-2026-007", speciesCommon: "Cedro", permiso: P1 }], {
      [clave("Tornillo", P1)]: "L7",
    });
    expect(otraEspecie).toMatchObject({ ok: false });
    const otroPermiso = planDeReparto(pila, [{ id: "L8", code: "LA-2026-008", speciesCommon: "Mashonaste", permiso: P2 }], {
      [clave("Mashonaste", P1)]: "L8",
    });
    expect(otroPermiso.ok).toBe(false);
    const cerrado = planDeReparto(
      pila,
      [{ id: "L9", code: "LA-2026-009", speciesCommon: "Tornillo", permiso: P1, status: "consumido" }],
      { [clave("Tornillo", P1)]: "L9" },
    );
    expect(cerrado.ok).toBe(false);
    expect(planDeReparto(pila, [], { [clave("Tornillo", P1)]: "no-existe" }).ok).toBe(false);
  });

  it("dos grupos al MISMO lote sin permiso no lo dejan con dos permisos (ADR-393)", () => {
    const sinPermiso = [{ id: "L5", code: "LA-2026-005", speciesCommon: "Mashonaste", permiso: null }];
    const plan = planDeReparto(pila, sinPermiso, { [clave("Mashonaste", P1)]: "L5", [clave("Mashonaste", P2)]: "L5" });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toContain("dos permisos");
    // Uno solo sí entra.
    expect(planDeReparto(pila, sinPermiso, { [clave("Mashonaste", P1)]: "L5" }).ok).toBe(true);
  });

  it("una clave que ya no es un grupo (otro equipo sacó sus trozas) se ignora", () => {
    const plan = planDeReparto(pila, [], { "cedro|X": "L1" });
    expect(plan.ok && plan.pasos.every((p) => p.destino.tipo === "nuevo")).toBe(true);
  });
});

describe("reglas del cliente (LM1 / LM4)", () => {
  it("armar un lote por escaneo: una troza en un mixto queda afuera con el camino (repártelo)", () => {
    const t = troza({ loteMixtoId: "m1", loteMixtoCode: "LM-2026-003" });
    expect(motivoFueraDeLaPila(t)).toBe("Está en el lote mixto LM-2026-003: repártelo primero");
  });

  it("escanear al MISMO mixto no es un error; a OTRO, sí (LM1)", () => {
    const t = troza({ loteMixtoId: "m1", loteMixtoCode: "LM-2026-003" });
    expect(motivoFueraDeLaPila(t, { loteMixtoId: "m1" })).toBeNull();
    expect(motivoFueraDeLaPila(t, { loteMixtoId: "m2" })).toBe("Ya está en el lote mixto LM-2026-003");
    expect(motivoFueraDeLaPila(troza(), { loteMixtoId: "m2" })).toBeNull();
  });

  it("los selectores de lote no ofrecen madera apartada en un mixto", () => {
    const libre = troza({ especieComun: "Tornillo" });
    const apartada = troza({ especieComun: "Tornillo", loteMixtoId: "m1" });
    const lote = { id: "L1", speciesCommon: "Tornillo", permiso: null };
    expect(trozasDelLote([libre, apartada], lote).map((t) => t.id)).toEqual([libre.id]);
    expect(disponiblePorEspecie([libre, apartada])[0]).toMatchObject({ piezas: 1 });
  });
});
