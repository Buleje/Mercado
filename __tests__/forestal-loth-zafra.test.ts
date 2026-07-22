/**
 * loth-zafra — el saldo del POA NO se acumula: lo que no se moviliza antes de que
 * venza la vigencia se pierde. Este cálculo es el que avisa a tiempo.
 */
import { describe, expect, it } from "vitest";
import { analizarZafra } from "@/lib/forestal/loth-zafra";

const base = {
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: "2026-12-31",
  autorizadoM3: 365,
};

describe("estado de la zafra", () => {
  it("sin vigencia cargada no inventa nada", () => {
    const r = analizarZafra({ ...base, vigenciaDesde: null, vigenciaHasta: null, movilizadoM3: 10, hoy: new Date("2026-06-01") });
    expect(r.estado).toBe("sin_vigencia");
    expect(r.diasTotales).toBe(0);
    expect(r.mensaje).toContain("Cargá la vigencia");
  });

  it("antes del inicio: cuenta los días y el ritmo que va a hacer falta", () => {
    const r = analizarZafra({ ...base, movilizadoM3: 0, hoy: new Date("2025-12-01") });
    expect(r.estado).toBe("no_iniciada");
    expect(r.diasRestantes).toBe(r.diasTotales);
    expect(r.ritmoRequeridoM3Dia).toBeCloseTo(1, 2); // 365 m³ / 365 días
  });

  it("en ritmo cuando el volumen acompaña al tiempo", () => {
    // Mitad del año, mitad del volumen.
    const r = analizarZafra({ ...base, movilizadoM3: 182, hoy: new Date("2026-07-02") });
    expect(r.estado).toBe("en_ritmo");
    expect(Math.abs(r.desfasePct)).toBeLessThan(10);
  });

  it("atrasado: dice cuánto por día hace falta para no perder saldo", () => {
    const r = analizarZafra({ ...base, movilizadoM3: 50, hoy: new Date("2026-07-02") });
    expect(r.estado).toBe("atrasado");
    expect(r.saldoM3).toBe(315);
    expect(r.ritmoRequeridoM3Dia).toBeGreaterThan(r.ritmoActualM3Dia);
    expect(r.mensaje).toContain("m³/día");
  });

  it("adelantado cuando el volumen le saca ventaja al tiempo", () => {
    const r = analizarZafra({ ...base, movilizadoM3: 300, hoy: new Date("2026-07-02") });
    expect(r.estado).toBe("adelantado");
    expect(r.desfasePct).toBeGreaterThan(10);
  });

  it("vencida con saldo: avisa que la autorización NO se acumula", () => {
    const r = analizarZafra({ ...base, movilizadoM3: 200, hoy: new Date("2027-02-01") });
    expect(r.estado).toBe("vencida");
    expect(r.saldoM3).toBe(165);
    expect(r.mensaje).toContain("no se acumula");
    expect(r.diasRestantes).toBe(0);
  });

  it("vencida sin saldo: cerró bien", () => {
    const r = analizarZafra({ ...base, movilizadoM3: 365, hoy: new Date("2027-02-01") });
    expect(r.estado).toBe("vencida");
    expect(r.saldoM3).toBe(0);
    expect(r.mensaje).toContain("todo lo autorizado");
  });
});

describe("proyección al cierre", () => {
  it("extrapola el ritmo actual y calcula lo que quedaría sin movilizar", () => {
    // Medio año, 100 de 365 m³ → ritmo ~0,55 m³/día → proyección ~200 m³.
    const r = analizarZafra({ ...base, movilizadoM3: 100, hoy: new Date("2026-07-02") });
    expect(r.proyeccionCierreM3).toBeGreaterThan(190);
    expect(r.proyeccionCierreM3).toBeLessThan(210);
    expect(r.riesgoNoMovilizadoM3).toBeGreaterThan(150);
  });

  it("la proyección nunca supera lo autorizado", () => {
    const r = analizarZafra({ ...base, movilizadoM3: 350, hoy: new Date("2026-02-01") });
    expect(r.proyeccionCierreM3).toBeLessThanOrEqual(365);
    expect(r.riesgoNoMovilizadoM3).toBe(0);
  });

  it("sin volumen autorizado no divide por cero", () => {
    const r = analizarZafra({ ...base, autorizadoM3: 0, movilizadoM3: 0, hoy: new Date("2026-07-02") });
    expect(r.avanceVolumenPct).toBe(0);
    expect(Number.isFinite(r.ritmoRequeridoM3Dia)).toBe(true);
  });
});

describe("cronograma mensual", () => {
  it("reparte la meta mes a mes y cierra en el volumen autorizado", () => {
    const r = analizarZafra({ ...base, movilizadoM3: 100, hoy: new Date("2026-07-02") });
    expect(r.meses).toHaveLength(12);
    expect(r.meses[0].label).toBe("ene 2026");
    expect(r.meses[11].metaAcumuladaM3).toBeCloseTo(365, 0);
    // La meta acumulada nunca baja.
    for (let i = 1; i < r.meses.length; i++) {
      expect(r.meses[i].metaAcumuladaM3).toBeGreaterThanOrEqual(r.meses[i - 1].metaAcumuladaM3);
    }
  });

  it("marca el mes en curso y los ya transcurridos", () => {
    const r = analizarZafra({ ...base, movilizadoM3: 100, hoy: new Date("2026-07-02") });
    const actual = r.meses.find((m) => m.actual);
    expect(actual?.periodo).toBe("2026-07");
    expect(r.meses.filter((m) => m.transcurrido)).toHaveLength(6); // ene…jun
  });

  it("una zafra corta (2 meses) no rompe el reparto", () => {
    const r = analizarZafra({
      vigenciaDesde: "2026-03-15",
      vigenciaHasta: "2026-04-30",
      autorizadoM3: 100,
      movilizadoM3: 20,
      hoy: new Date("2026-04-01"),
    });
    expect(r.meses).toHaveLength(2);
    expect(r.meses[1].metaAcumuladaM3).toBeCloseTo(100, 0);
  });
});
