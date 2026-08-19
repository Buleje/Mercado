import { describe, it, expect } from "vitest";
import { armarJornadas } from "@/lib/forestal/consumo-en-jornadas";
import type { BloqueDistribuido } from "@/lib/forestal/cubicacion-reparto";

/**
 * Repartir el turno en jornadas (ADR-373) — la regla que no se negocia es que
 * una troza entra a UNA sola corrida: consumirla dos veces sería declarar dos
 * veces la misma madera (invariante T1).
 */

const grupo = (clave: string, piezas: number, m3: number) => ({
  clave,
  label: clave,
  m3,
  pieTablar: m3 * 424,
  piezas,
  medidas: [{ clave: `${clave}-m`, medida: "2×8×10", espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", m3, pieTablar: m3 * 424, piezas }],
});

const bloque = (id: string, rolliza: number, usado: number, piezas = 10): BloqueDistribuido => ({
  bloque: { id, etiqueta: id.toUpperCase(), especie: "Tornillo", m3: rolliza, origen: "trozas", aprovechablePct: 56, dias: 1 },
  aprovechablePct: 56,
  capacidadM3: rolliza * 0.56,
  usadoM3: usado,
  libreM3: Math.max(0, rolliza * 0.56 - usado),
  asignado: usado > 0 ? [grupo("tabla", piezas, usado)] : [],
  dias: 1,
  porDia: [],
  costoRolliza: null,
  costoPorM3Aserrada: null,
});

describe("armarJornadas", () => {
  it("con un solo día deja todo en una corrida", () => {
    const r = armarJornadas([bloque("t1", 2, 1), bloque("t2", 2, 1)], { dias: 1, fechaInicio: "2026-08-10" });
    expect(r.jornadas).toHaveLength(1);
    expect(r.jornadas[0]!.trozaIds).toEqual(["t1", "t2"]);
    expect(r.jornadas[0]!.m3).toBe(2);
    expect(r.aviso).toBeNull();
  });

  it("cada troza cae en UNA sola jornada", () => {
    const r = armarJornadas(
      [bloque("t1", 3, 1.5), bloque("t2", 3, 1.5), bloque("t3", 3, 1.5), bloque("t4", 3, 1.5)],
      { dias: 2, fechaInicio: "2026-08-10" },
    );
    const todas = r.jornadas.flatMap((j) => j.trozaIds);
    expect(todas).toHaveLength(4);
    expect(new Set(todas).size).toBe(4); // ninguna repetida
  });

  it("conserva el total de piezas y de m³", () => {
    const bloques = [bloque("t1", 4, 2, 20), bloque("t2", 2, 1, 10), bloque("t3", 6, 3, 30)];
    const r = armarJornadas(bloques, { dias: 3, fechaInicio: "2026-08-10" });
    expect(r.jornadas.reduce((a, j) => a + j.m3, 0)).toBeCloseTo(6, 4);
    expect(r.jornadas.reduce((a, j) => a + j.piezas, 0)).toBe(60);
    expect(r.jornadas.reduce((a, j) => a + j.rollizaM3, 0)).toBeCloseTo(12, 4);
  });

  it("reparte parejo: la más grande va al día más liviano", () => {
    const r = armarJornadas([bloque("grande", 10, 5), bloque("chica", 2, 1), bloque("media", 6, 3)], {
      dias: 2,
      fechaInicio: "2026-08-10",
    });
    const cargas = r.jornadas.map((j) => j.m3).sort((a, b) => b - a);
    /* 5 | 3+1: la diferencia es 1, no 5 (que sería meter las tres juntas). */
    expect(cargas[0]! - cargas[1]!).toBeLessThanOrEqual(1);
  });

  it("las fechas son días corridos desde la de inicio", () => {
    const r = armarJornadas([bloque("t1", 2, 1), bloque("t2", 2, 1), bloque("t3", 2, 1)], {
      dias: 3,
      fechaInicio: "2026-08-30",
    });
    expect(r.jornadas.map((j) => j.fecha)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01"]);
  });

  it("con menos trozas que días devuelve menos jornadas y lo dice", () => {
    const r = armarJornadas([bloque("t1", 2, 1), bloque("t2", 2, 1)], { dias: 5, fechaInicio: "2026-08-10" });
    expect(r.jornadas).toHaveLength(2);
    expect(r.aviso).toContain("no se parte");
  });

  it("ignora las trozas que no ampararon nada", () => {
    const r = armarJornadas([bloque("t1", 2, 1), bloque("vacia", 2, 0)], { dias: 2, fechaInicio: "2026-08-10" });
    expect(r.jornadas.flatMap((j) => j.trozaIds)).toEqual(["t1"]);
  });

  it("sin producción amparada no arma jornadas y lo explica", () => {
    const r = armarJornadas([bloque("vacia", 2, 0)], { dias: 2, fechaInicio: "2026-08-10" });
    expect(r.jornadas).toHaveLength(0);
    expect(r.aviso).toContain("no hay nada que registrar");
  });

  it("junta los grupos de varias trozas de la misma jornada sin duplicar la clave", () => {
    const r = armarJornadas([bloque("t1", 2, 1, 10), bloque("t2", 2, 1, 10)], { dias: 1, fechaInicio: "2026-08-10" });
    expect(r.jornadas[0]!.grupos).toHaveLength(1);
    expect(r.jornadas[0]!.grupos[0]!.piezas).toBe(20);
    expect(r.jornadas[0]!.grupos[0]!.medidas).toHaveLength(1);
    expect(r.jornadas[0]!.grupos[0]!.medidas[0]!.piezas).toBe(20);
  });
});
