/**
 * Agenda (ADR-501 §3) — recurrencia pura: qué días toca cada frecuencia.
 * Fechas «YYYY-MM-DD» sin hora: el 2026-10-19 es lunes.
 */
import { describe, expect, it } from "vitest";
import {
  diaSemanaDe,
  fechasEnRango,
  proximaOcurrencia,
  sumarDias,
  tocaEn,
  ultimoDiaDelMes,
} from "@/lib/agenda/recurrencia";
import type { Recurrencia } from "@/lib/agenda/tipos";

const rec = (r: Partial<Recurrencia> & Pick<Recurrencia, "frecuencia">): Recurrencia => ({
  desde: "2026-10-01",
  hasta: null,
  diasSemana: [],
  diaMes: null,
  cadaN: null,
  ...r,
});

describe("calendario básico", () => {
  it("sumarDias cruza meses y años sin zona horaria", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("diaSemanaDe: 0 = domingo", () => {
    expect(diaSemanaDe("2026-10-18")).toBe(0);
    expect(diaSemanaDe("2026-10-19")).toBe(1);
  });

  it("ultimoDiaDelMes con bisiesto", () => {
    expect(ultimoDiaDelMes("2026-02-10")).toBe(28);
    expect(ultimoDiaDelMes("2028-02-10")).toBe(29);
    expect(ultimoDiaDelMes("2026-04-30")).toBe(30);
  });
});

describe("tocaEn por frecuencia", () => {
  it("una_vez: sólo el día de inicio", () => {
    const r = rec({ frecuencia: "una_vez", desde: "2026-10-20" });
    expect(fechasEnRango(r, "2026-10-01", "2026-10-31")).toEqual(["2026-10-20"]);
  });

  it("semanal lunes a sábado: el domingo no toca", () => {
    const r = rec({ frecuencia: "semanal", diasSemana: [1, 2, 3, 4, 5, 6] });
    expect(tocaEn(r, "2026-10-18")).toBe(false);
    expect(fechasEnRango(r, "2026-10-18", "2026-10-24")).toHaveLength(6);
  });

  it("quincenal: semanas alternas contadas desde el lunes de `desde`", () => {
    const r = rec({ frecuencia: "quincenal", desde: "2026-10-21", diasSemana: [1] });
    // El lunes de la semana de inicio (10-19) es anterior a `desde`: no toca.
    expect(fechasEnRango(r, "2026-10-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-16", "2026-11-30"]);
  });

  it("mensual día 31: cae en el último día de los meses cortos", () => {
    const r = rec({ frecuencia: "mensual", desde: "2026-01-01", diaMes: 31 });
    expect(fechasEnRango(r, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("cada_n_dias: cuenta desde `desde`", () => {
    const r = rec({ frecuencia: "cada_n_dias", desde: "2026-10-01", cadaN: 3 });
    expect(fechasEnRango(r, "2026-10-01", "2026-10-10")).toEqual(["2026-10-01", "2026-10-04", "2026-10-07", "2026-10-10"]);
  });

  it("nunca fuera de [desde, hasta]", () => {
    const r = rec({ frecuencia: "diaria", desde: "2026-10-05", hasta: "2026-10-07", diasSemana: [0, 1, 2, 3, 4, 5, 6] });
    expect(tocaEn(r, "2026-10-04")).toBe(false);
    expect(tocaEn(r, "2026-10-08")).toBe(false);
    expect(fechasEnRango(r, "2026-10-01", "2026-10-31")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });
});

describe("proximaOcurrencia", () => {
  it("el siguiente día que toca, incluido el de hoy", () => {
    const r = rec({ frecuencia: "semanal", diasSemana: [1] });
    expect(proximaOcurrencia(r, "2026-10-18")).toBe("2026-10-19");
    expect(proximaOcurrencia(r, "2026-10-19")).toBe("2026-10-19");
  });

  it("null después de `hasta`", () => {
    const r = rec({ frecuencia: "semanal", diasSemana: [1], hasta: "2026-10-18" });
    expect(proximaOcurrencia(r, "2026-10-18")).toBeNull();
  });
});
