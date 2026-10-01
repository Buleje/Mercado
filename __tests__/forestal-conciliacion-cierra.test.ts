/**
 * La conciliación tiene que CERRAR: apertura + ingreso − consumido − salió sin
 * aserrar = final. Es la tabla que un fiscalizador suma con la calculadora.
 *
 * Dos bugs que la rompían, los dos verificados leyendo `conciliacionPeriodo`:
 *
 * 1. **`despachadoDirectoM3` no se restaba.** `saldos()` lo descuenta desde
 *    ADR-363 —madera vendida en rollo, que dejó el patio sin pasar por la
 *    sierra—, la conciliación no. Con despacho directo, la existencia final del
 *    rollforward declaraba madera que ya se fue en un camión, y no coincidía
 *    con el KPI de la misma pantalla.
 * 2. **Normalizaba la especie con su propio `trim().toLowerCase()`.** La
 *    apertura puede venir de un snapshot de cierre de hace meses y el
 *    movimiento de la tabla de hoy: «Ishpíngo» heredado e «Ishpingo» del mes
 *    caían en dos filas, una con apertura y sin consumo y otra al revés,
 *    inventando una existencia negativa. Es el bug que `speciesKey` ya
 *    documenta en el mismo archivo; acá había una tercera normalización.
 *
 * El test fija la ARITMÉTICA y la CLAVE, que es lo puro de todo esto; la query
 * es de Prisma y no se testea acá.
 */
import { describe, expect, it } from "vitest";

import { claveEspecie } from "@/lib/forestal/loth-constants";

/** La fórmula del rollforward, tal cual la calcula `conciliacionPeriodo`. */
const finalDe = (x: { apertura: number; ingreso: number; consumido: number; despachadoDirecto: number }) =>
  Number((x.apertura + x.ingreso - x.consumido - x.despachadoDirecto).toFixed(4));

describe("la fórmula del rollforward", () => {
  it("resta lo que salió sin aserrar, igual que el saldo", () => {
    const fila = { apertura: 100, ingreso: 20, consumido: 30, despachadoDirecto: 15 };
    expect(finalDe(fila)).toBe(75);
    // Sin restarlo daban 90: 15 m³ de madera que ya no está en la planta.
    expect(fila.apertura + fila.ingreso - fila.consumido).toBe(90);
  });

  it("sin despacho directo el resultado no cambia — no rompe lo que ya andaba", () => {
    expect(finalDe({ apertura: 0, ingreso: 32.933, consumido: 114.74, despachadoDirecto: 0 })).toBe(-81.807);
  });

  it("el final cuadra con apertura + saldo del período", () => {
    const apertura = 152.922;
    const saldoDelPeriodo = 32.933 - 114.74 - 0; // lo que devuelve saldos()
    expect(finalDe({ apertura, ingreso: 32.933, consumido: 114.74, despachadoDirecto: 0 })).toBeCloseTo(
      apertura + saldoDelPeriodo,
      4,
    );
  });
});

describe("la clave de especie es la compartida, no una tercera", () => {
  it("tilde, mayúscula y espacio de más caen en el mismo balde", () => {
    expect(claveEspecie("Ishpíngo")).toBe(claveEspecie("ISHPINGO"));
    expect(claveEspecie("  Tornillo  ")).toBe(claveEspecie("tornillo"));
    expect(claveEspecie("Tornillo  blanco")).toBe(claveEspecie("tornillo blanco"));
  });

  it("un `trim().toLowerCase()` NO alcanza — es el bug que había", () => {
    const ingenuo = (s: string) => s.trim().toLowerCase();
    expect(ingenuo("Ishpíngo")).not.toBe(ingenuo("Ishpingo"));
    expect(claveEspecie("Ishpíngo")).toBe(claveEspecie("Ishpingo"));
  });

  it("el científico entre paréntesis no parte la especie", () => {
    expect(claveEspecie("TORNILLO (Cedrelinga cateniformis)")).toBe(claveEspecie("TORNILLO"));
  });
});
