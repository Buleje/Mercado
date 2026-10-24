/**
 * La serie del cumplimiento (ADR-384).
 *
 * Lo que se prueba acá no es que el gráfico se dibuje: es que NO afirme lo que
 * nadie midió. Seis mediciones en diez días tienen que ocupar diez casilleros
 * de calendario, no seis equidistantes.
 */
import { describe, expect, it } from "vitest";
import {
  densificarPorDia,
  diasEntre,
  queCambio,
  tramosSinMedir,
} from "@/lib/forestal/compliance-historia";

const p = (fecha: string, score: number) => ({ fecha, score });

describe("densificarPorDia", () => {
  it("pone un casillero por día de calendario, con null donde no se midió", () => {
    const r = densificarPorDia([p("2026-08-26", 48), p("2026-08-30", 55)]);
    expect(r).toEqual([
      { fecha: "2026-08-26", score: 48 },
      { fecha: "2026-08-27", score: null },
      { fecha: "2026-08-28", score: null },
      { fecha: "2026-08-29", score: null },
      { fecha: "2026-08-30", score: 55 },
    ]);
  });

  it("días consecutivos no generan ningún hueco", () => {
    const r = densificarPorDia([p("2026-09-01", 70), p("2026-09-02", 72)]);
    expect(r.map((x) => x.score)).toEqual([70, 72]);
  });

  it("cruza el fin de mes y el cambio de año sin saltarse un día", () => {
    expect(densificarPorDia([p("2026-08-30", 1), p("2026-09-02", 2)])).toHaveLength(4);
    expect(densificarPorDia([p("2026-12-30", 1), p("2027-01-02", 2)]).map((x) => x.fecha)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("un solo punto es un solo casillero; ninguno, ninguno", () => {
    expect(densificarPorDia([p("2026-09-03", 91)])).toEqual([{ fecha: "2026-09-03", score: 91 }]);
    expect(densificarPorDia([])).toEqual([]);
  });

  it("un score de 0 se conserva — es una medición, no un hueco", () => {
    const r = densificarPorDia([p("2026-09-01", 0), p("2026-09-03", 40)]);
    expect(r[0].score).toBe(0);
    expect(r[1].score).toBeNull();
  });

  it("densifica sólo entre el primero y el último, no la ventana entera", () => {
    // 90 días de ventana, 3 días de datos ⇒ 3 casilleros, no 90.
    expect(densificarPorDia([p("2026-09-01", 1), p("2026-09-03", 2)])).toHaveLength(3);
  });
});

describe("tramosSinMedir", () => {
  it("cuenta los saltos de más de un día", () => {
    expect(tramosSinMedir([p("2026-08-26", 1), p("2026-08-27", 2), p("2026-08-30", 3)])).toBe(1);
    expect(tramosSinMedir([p("2026-08-26", 1), p("2026-08-30", 2), p("2026-09-05", 3)])).toBe(2);
  });

  it("sin saltos, cero", () => {
    expect(tramosSinMedir([p("2026-09-01", 1), p("2026-09-02", 2), p("2026-09-03", 3)])).toBe(0);
    expect(tramosSinMedir([p("2026-09-01", 1)])).toBe(0);
    expect(tramosSinMedir([])).toBe(0);
  });
});

describe("diasEntre", () => {
  it("cuenta días de calendario, no de husos", () => {
    expect(diasEntre("2026-09-01", "2026-09-03")).toBe(2);
    expect(diasEntre("2026-02-28", "2026-03-01")).toBe(1); // 2026 no es bisiesto
    expect(diasEntre("2024-02-28", "2024-03-01")).toBe(2); // 2024 sí
  });
});

describe("queCambio", () => {
  const CATS = [
    { key: "fueraPlazo", label: "fuera de plazo" },
    { key: "pendientes", label: "pendientes de validar" },
    { key: "stockNegativo", label: "stock negativo" },
  ] as const;

  it("nombra lo que se movió, de mayor a menor", () => {
    const r = queCambio(
      [
        { fecha: "2026-09-01", fueraPlazo: 2, pendientes: 8, stockNegativo: 0 },
        { fecha: "2026-09-02", fueraPlazo: 3, pendientes: 2, stockNegativo: 0 },
      ],
      CATS,
    );
    expect(r).toEqual([
      { label: "pendientes de validar", delta: -6 },
      { label: "fuera de plazo", delta: 1 },
    ]);
  });

  it("lo que no se movió no se menciona: una lista de ceros es ruido", () => {
    const r = queCambio(
      [
        { fecha: "2026-09-01", fueraPlazo: 1, pendientes: 1, stockNegativo: 1 },
        { fecha: "2026-09-02", fueraPlazo: 1, pendientes: 1, stockNegativo: 1 },
      ],
      CATS,
    );
    expect(r).toEqual([]);
  });

  it("con una sola medición no hay contra qué comparar", () => {
    expect(queCambio([{ fecha: "2026-09-01", fueraPlazo: 4, pendientes: 0, stockNegativo: 0 }], CATS)).toEqual([]);
    expect(queCambio([], CATS)).toEqual([]);
  });

  it("compara contra la ANTERIOR, no contra la primera", () => {
    const r = queCambio(
      [
        { fecha: "2026-09-01", fueraPlazo: 10, pendientes: 0, stockNegativo: 0 },
        { fecha: "2026-09-02", fueraPlazo: 2, pendientes: 0, stockNegativo: 0 },
        { fecha: "2026-09-03", fueraPlazo: 3, pendientes: 0, stockNegativo: 0 },
      ],
      CATS,
    );
    expect(r).toEqual([{ label: "fuera de plazo", delta: 1 }]);
  });
});
