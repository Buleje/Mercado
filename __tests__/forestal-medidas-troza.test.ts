/**
 * Medir una troza en el patio (Brandon 2026-09-26): qué se guarda y qué no.
 *
 * - Oxapampa es dato comercial: se guarda aunque el mes esté cerrado y el pt lo
 *   calcula el servidor (nunca viene del cliente).
 * - D1/D2 en cm son del libro: sólo sobre vacío (SERFOR no se pisa) y con el
 *   período abierto.
 * - Y el conteo del patio: el acta separa faltantes / sobrantes / sorpresas y
 *   sus totales se recalculan, no se le creen al equipo.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_TROZAS_POR_MEDICION,
  medidasTrozasSchema,
  planearMedida,
  type EstadoTrozaParaMedir,
} from "@/lib/forestal/medidas-troza";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { aTrozaDelConteo, anotarDesconocido, anotarTroza, nuevoConteo, reemplazarFoto } from "@/lib/forestal/conteo-patio";
import { actaParaGuardar, guardarConteoSchema } from "@/lib/forestal/conteo-patio-guardado";

const estado = (p: Partial<EstadoTrozaParaMedir> = {}): EstadoTrozaParaMedir => ({
  id: "t1",
  oxD1Pulg: null,
  oxD2Pulg: null,
  oxLargoPies: null,
  d1Cm: null,
  d2Cm: null,
  noRecepcionada: false,
  guiaViva: true,
  periodoCerrado: null,
  ...p,
});

describe("medidasTrozasSchema", () => {
  it("acepta el pedido del contrato y rechaza ceros, negativos y dedos que se fueron", () => {
    expect(medidasTrozasSchema.safeParse({ trozas: [{ id: "a", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 }] }).success).toBe(true);
    expect(medidasTrozasSchema.safeParse({ trozas: [{ id: "a", oxD1Pulg: 0 }] }).success).toBe(false);
    expect(medidasTrozasSchema.safeParse({ trozas: [{ id: "a", oxLargoPies: -1 }] }).success).toBe(false);
    expect(medidasTrozasSchema.safeParse({ trozas: [{ id: "a", oxD1Pulg: 1800 }] }).success).toBe(false);
    expect(medidasTrozasSchema.safeParse({ trozas: [{ id: "a", d1Cm: 7300 }] }).success).toBe(false);
    expect(medidasTrozasSchema.safeParse({ trozas: [] }).success).toBe(false);
    const muchas = Array.from({ length: MAX_TROZAS_POR_MEDICION + 1 }, (_, i) => ({ id: `t${i}`, oxLargoPies: 10 }));
    expect(medidasTrozasSchema.safeParse({ trozas: muchas }).success).toBe(false);
  });

  it("`null` en Oxapampa pasa (borra la medida); un pt mandado por el cliente se descarta", () => {
    const r = medidasTrozasSchema.safeParse({ trozas: [{ id: "a", oxD1Pulg: null, oxPt: 99999 }] });
    expect(r.success).toBe(true);
    expect(r.success && "oxPt" in r.data.trozas[0]).toBe(false);
  });
});

describe("planearMedida · Oxapampa", () => {
  it("calcula el pt en el servidor con las medidas redondeadas a 2 decimales", () => {
    const p = planearMedida({ id: "t1", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 }, estado());
    expect(p.ox).toEqual({ d1: 18, d2: 22, largo: 12, pt: 195.92 });
    expect(p.rechazos).toEqual([]);
  });

  it("mezcla con lo ya medido: mandar sólo el largo completa la cubicación", () => {
    const p = planearMedida({ id: "t1", oxLargoPies: 12 }, estado({ oxD1Pulg: 18, oxD2Pulg: 22 }));
    expect(p.ox).toEqual({ d1: 18, d2: 22, largo: 12, pt: 195.92 });
  });

  it("sin largo guarda las puntas y deja el pt vacío (null, nunca 0)", () => {
    const p = planearMedida({ id: "t1", oxD1Pulg: 18, oxD2Pulg: 22 }, estado());
    expect(p.ox).toEqual({ d1: 18, d2: 22, largo: null, pt: null });
  });

  it("NO lo frena el mes cerrado: es dato comercial, no del libro", () => {
    const p = planearMedida({ id: "t1", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 }, estado({ periodoCerrado: "Agosto 2026" }));
    expect(p.ox?.pt).toBe(195.92);
    expect(p.rechazos).toEqual([]);
  });

  it("`null` borra esa medida y recalcula", () => {
    const p = planearMedida({ id: "t1", oxLargoPies: null }, estado({ oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12 }));
    expect(p.ox).toEqual({ d1: 18, d2: 22, largo: null, pt: null });
  });
});

describe("planearMedida · D1/D2 en cm (del libro)", () => {
  it("se escriben sobre vacío", () => {
    const p = planearMedida({ id: "t1", d1Cm: 60, d2Cm: 55.5 }, estado());
    expect(p.cm).toEqual({ d1: 60, d2: 55.5 });
    expect(p.ox).toBeNull();
    expect(p.rechazos).toEqual([]);
  });

  it("NUNCA pisan el dato de SERFOR: distinto = rechazo con el valor que ya tiene", () => {
    const p = planearMedida({ id: "t1", d1Cm: 37, d2Cm: 58 }, estado({ d1Cm: 73, d2Cm: 58 }));
    expect(p.cm).toBeNull();
    expect(p.rechazos).toEqual(["D1 ya tiene 73 cm cargado: no se pisa."]);
  });

  it("con el período cerrado se rechazan (y la Oxapampa del mismo pedido sí pasa)", () => {
    const p = planearMedida(
      { id: "t1", d1Cm: 60, d2Cm: 55, oxD1Pulg: 24, oxD2Pulg: 22, oxLargoPies: 10 },
      estado({ periodoCerrado: "Agosto 2026" }),
    );
    expect(p.cm).toBeNull();
    expect(p.ox?.pt).toBeGreaterThan(0);
    expect(p.rechazos).toHaveLength(2);
    expect(p.rechazos[0]).toContain("Agosto 2026");
  });
});

describe("planearMedida · piezas que no se miden", () => {
  it("id ajeno, guía anulada o troza que no llegó: nada se escribe", () => {
    const medida = { id: "t1", oxD1Pulg: 18, oxD2Pulg: 22, oxLargoPies: 12, d1Cm: 60 };
    for (const t of [undefined, estado({ guiaViva: false }), estado({ noRecepcionada: true })]) {
      const p = planearMedida(medida, t);
      expect(p.ox).toBeNull();
      expect(p.cm).toBeNull();
      expect(p.rechazos).toHaveLength(1);
    }
  });

  it("un pedido sin medidas se rechaza en vez de sellar «medido» sin nada", () => {
    expect(planearMedida({ id: "t1" }, estado()).rechazos).toEqual(["No trae ninguna medida."]);
  });
});

// ── Acta del conteo del patio ───────────────────────────────────────────────

const T0 = "2026-09-26T15:00:00.000Z";
const pieza = (p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible => ({
  woodEntryId: "we-1",
  codificacion: p.id,
  especieComun: "Tornillo",
  volumenM3: 1.5,
  gtfNumber: "G-1",
  ...p,
});

describe("actaParaGuardar", () => {
  const PATIO = [
    pieza({ id: "a", codigoPlanta: "101" }),
    pieza({ id: "b", codigoPlanta: "102" }),
    pieza({ id: "c", codigoPlanta: "103", volumenM3: 2 }),
    pieza({ id: "consumida", codigoPlanta: "104", consumidaEnId: "corrida-1" }),
  ].map(aTrozaDelConteo);

  it("recalcula los totales y separa faltantes / sobrantes / sorpresas", () => {
    let c = nuevoConteo({ fecha: "2026-09-26", quien: "QA", trozas: PATIO, ahora: T0 });
    c = anotarTroza(c, PATIO[0], T0);
    c = anotarTroza(c, PATIO[3], T0); // la consumida: el libro dice que no está
    c = anotarDesconocido(c, "ZZ-999", T0);
    const acta = actaParaGuardar({ ...c, terminadoEn: T0 });
    expect(acta.esperadas).toBe(3);
    expect(acta.contadas).toBe(1);
    expect(acta.m3Esperado).toBe(5);
    expect(acta.m3Contado).toBe(1.5);
    expect(acta.faltantes.map((f) => f.codigo)).toEqual(["102", "103"]);
    expect(acta.sobrantes).toEqual([
      expect.objectContaining({ trozaId: "consumida", codigo: "104", motivo: "ya_consumida" }),
    ]);
    expect(acta.sorpresas).toEqual([{ codigo: "ZZ-999", en: T0 }]);
  });

  it("una pieza que salió del patio mientras se contaba queda como sobrante «fuera»", () => {
    let c = nuevoConteo({ fecha: "2026-09-26", quien: "QA", trozas: PATIO, ahora: T0 });
    c = anotarTroza(c, PATIO[1], T0);
    c = reemplazarFoto(c, PATIO.filter((t) => t.id !== "b"), T0);
    const acta = actaParaGuardar(c);
    expect(acta.sobrantes).toEqual([expect.objectContaining({ trozaId: "b", motivo: "fuera" })]);
  });

  it("el esquema del POST acepta el conteo tal como el equipo lo guarda, y rechaza uno roto", () => {
    const c = anotarTroza(nuevoConteo({ fecha: "2026-09-26", quien: "QA", trozas: PATIO, ahora: T0 }), PATIO[0], T0);
    // Ida y vuelta por JSON, como viaja desde localStorage.
    const tal = JSON.parse(JSON.stringify(c));
    expect(guardarConteoSchema.safeParse({ conteo: tal }).success).toBe(true);
    expect(guardarConteoSchema.safeParse({ conteo: { ...tal, v: 2 } }).success).toBe(false);
    expect(guardarConteoSchema.safeParse({ conteo: { ...tal, fecha: "26/09/2026" } }).success).toBe(false);
    expect(
      guardarConteoSchema.safeParse({ conteo: { ...tal, trozas: [{ ...tal.trozas[0], motivo: "robada" }] } }).success,
    ).toBe(false);
  });
});
