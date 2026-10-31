/**
 * `analizarAprovechamiento`: la banda de la cabecera del plan. Tramos que no se
 * pisan, exceso en palabras (total y por especie), especies por saldo y ritmo
 * en días contra la vigencia.
 */

import { describe, expect, it } from "vitest";
import { analizarAprovechamiento, diaCorto, tonoAprovechamiento } from "@/lib/forestal/loth-aprovechamiento";
import { cascadaDelPlan, type FilaBalanceCascada } from "@/lib/forestal/loth-saldo-cascada";

const fila = (species: string, autorizado: number, talado: number, trozado: number, movilizado: number, consumido = 0): FilaBalanceCascada => ({
  species, cites: false, autorizado, talado, trozado, movilizado, consumido,
});
const HOY = new Date("2026-10-07T12:00:00Z");
const base = { vigenciaDesde: null, vigenciaHasta: null, hoy: HOY };

describe("analizarAprovechamiento · plantación", () => {
  const cascada = cascadaDelPlan([
    fila("Bolaina", 120, 30, 25, 10),
    fila("Capirona", 80, 20, 20, 0),
    fila("Marupa", 50, 0, 0, 0),
  ]);
  const a = analizarAprovechamiento({ modo: "plantacion", cascada, ...base });

  it("mide lo talado sobre lo registrado", () => {
    expect(a.base).toBe(250);
    expect(a.avance).toBe(50);
    expect(a.pct).toBe(20);
    expect(a.saldo).toBe(200);
    expect(a.nombreBase).toBe("registrado");
  });

  it("los tramos no se pisan y suman la base", () => {
    const t = Object.fromEntries(a.tramos.map((x) => [x.id, x.m3]));
    // despachado 10 · patio (25−10)+(20−0)=35 · resto talado 50−10−35=5 · en pie 200
    expect(t).toEqual({ despachado: 10, patio: 35, talado: 5, enPie: 200 });
    expect(a.tramos.reduce((s, x) => s + x.m3, 0)).toBe(250);
    expect(a.marca100).toBe(100);
    expect(a.ptEnPie).toBeGreaterThan(0);
  });

  it("especies ordenadas por saldo (en pie), con su %", () => {
    expect(a.especies.map((e) => e.especie)).toEqual(["Bolaina", "Capirona", "Marupa"]);
    expect(a.especies[0]).toMatchObject({ saldo: 90, pct: 25, excesoM3: 0 });
    expect(a.especiesExcedidas).toEqual([]);
    expect(a.excesos).toEqual([]);
    expect(tonoAprovechamiento(a)).toBeUndefined();
  });
});

describe("exceso", () => {
  it("talado sobre lo registrado: frase, especie pasada y la marca del 100 % se corre", () => {
    const cascada = cascadaDelPlan([fila("Bolaina", 100, 90, 90, 0), fila("Capirona", 20, 40, 40, 0)]);
    const a = analizarAprovechamiento({ modo: "plantacion", cascada, ...base });
    expect(a.excesos).toEqual(["Se taló 10.000 m³ más de lo registrado"]);
    expect(a.especiesExcedidas.map((e) => [e.especie, e.excesoM3])).toEqual([["Capirona", 20]]);
    expect(a.marca100).toBeCloseTo((120 / 130) * 100, 0);
    expect(tonoAprovechamiento(a)).toBe("danger");
  });

  it("una especie pasada aunque el total no se pase sigue en rojo", () => {
    const cascada = cascadaDelPlan([fila("Bolaina", 100, 10, 10, 0), fila("Capirona", 20, 25, 25, 0)]);
    const a = analizarAprovechamiento({ modo: "plantacion", cascada, ...base });
    expect(a.excesos).toEqual([]);
    expect(a.especiesExcedidas[0]).toMatchObject({ especie: "Capirona", excesoM3: 5 });
    expect(tonoAprovechamiento(a)).toBe("danger");
  });

  it("bosque: movilizado sobre lo autorizado", () => {
    const cascada = cascadaDelPlan([fila("Shihuahuaco", 100, 110, 110, 105)]);
    const a = analizarAprovechamiento({ modo: "bosque", cascada, ...base });
    expect(a.pct).toBe(105);
    expect(a.excesos).toContain("Se movilizó 5.000 m³ más de lo autorizado");
    expect(a.excesos).toContain("Se taló 10.000 m³ más de lo autorizado");
    expect(a.ptEnPie).toBeNull();
  });

  it("la tolerancia es de 0,01 m³, no el epsilon del float", () => {
    const cascada = cascadaDelPlan([fila("Bolaina", 100, 100.005, 100, 0)]);
    const a = analizarAprovechamiento({ modo: "plantacion", cascada, ...base });
    expect(a.excesos).toEqual([]);
    expect(a.especiesExcedidas).toEqual([]);
  });
});

describe("sin datos", () => {
  it("cascada vacía: sin % y sin datos", () => {
    const a = analizarAprovechamiento({ modo: "plantacion", cascada: cascadaDelPlan([]), ...base });
    expect(a.sinDatos).toBe(true);
    expect(a.pct).toBeNull();
    expect(a.ritmo).toBeNull();
    expect(a.especies).toEqual([]);
  });

  it("bosque usa la base publicada (Σ autorizado) aunque el balance no haya llegado", () => {
    const a = analizarAprovechamiento({ modo: "bosque", cascada: cascadaDelPlan([]), baseM3: 300, ...base });
    expect(a.base).toBe(300);
    expect(a.pct).toBe(0);
    expect(a.sinDatos).toBe(false);
    expect(a.tramos.find((t) => t.id === "enPie")?.m3).toBe(300);
  });

  it("especie sin base (fuera del registro) no tiene %", () => {
    const cascada = cascadaDelPlan([fila("Cedro", 0, 4, 4, 0)]);
    const a = analizarAprovechamiento({ modo: "plantacion", cascada, ...base });
    expect(a.especies[0].pct).toBeNull();
    expect(a.especies[0].excesoM3).toBe(4);
  });
});

describe("ritmo contra la vigencia", () => {
  const cascada = cascadaDelPlan([fila("Bolaina", 100, 30, 30, 0)]);
  const vig = { vigenciaDesde: "2026-01-01", vigenciaHasta: "2026-12-31" };

  it("atrasado: dice cuántos días", () => {
    // 279 de 364 días (76,6 %) con 30 % talado → −46,6 puntos ≈ −170 días
    const a = analizarAprovechamiento({ modo: "plantacion", cascada, ...vig, hoy: HOY });
    expect(a.ritmo?.estado).toBe("atrasado");
    expect(a.ritmo?.diasDesfase).toBeLessThan(-150);
    expect(a.ritmo?.titular).toMatch(/^Vas \d+ días atrasado$/);
    expect(a.ritmo?.detalle).toContain("% talado con");
  });

  it("adelantado", () => {
    const a = analizarAprovechamiento({ modo: "plantacion", cascada, ...vig, hoy: new Date("2026-02-01T00:00:00Z") });
    expect(a.ritmo?.estado).toBe("adelantado");
    expect(a.ritmo?.titular).toMatch(/adelantado$/);
    expect(a.ritmo?.diasDesfase).toBeGreaterThan(0);
  });

  it("no iniciada: la fecha de arranque", () => {
    const a = analizarAprovechamiento({ modo: "plantacion", cascada, vigenciaDesde: "2026-12-10", vigenciaHasta: "2027-12-10", hoy: HOY });
    expect(a.ritmo?.titular).toBe("La vigencia arranca el jueves 10/12");
    expect(a.ritmo?.diasDesfase).toBeNull();
  });

  it("vencida con saldo", () => {
    const a = analizarAprovechamiento({ modo: "bosque", cascada, vigenciaDesde: "2025-01-01", vigenciaHasta: "2025-12-31", hoy: HOY });
    expect(a.ritmo?.estado).toBe("vencida");
    expect(a.ritmo?.titular).toContain("sin aprovechar");
  });

  it("sin vigencia: sin ritmo", () => {
    expect(analizarAprovechamiento({ modo: "plantacion", cascada, ...base }).ritmo).toBeNull();
  });
});

it("diaCorto: «jueves 10/09» en UTC", () => {
  expect(diaCorto("2026-09-10")).toBe("jueves 10/09");
});
