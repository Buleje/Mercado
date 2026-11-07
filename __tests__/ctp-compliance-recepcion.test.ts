/**
 * __tests__/ctp-compliance-recepcion.test.ts
 *
 * El indicador del libro premiaba el gesto equivocado: la categoría que más
 * pesa contaba los ingresos «sin validar», y validar es un botón que despacha
 * 21 de una vez desde el escritorio. Medido el 2026-09-15 en el tenant real:
 * eso subía el score de 70 a 95 mientras las 21 guías seguían sin recepcionar
 * y sus 153 trozas (181 m³) fuera del alcance del cubicador.
 *
 * Ahora cuenta las guías sin recepcionar —mirar la pila— y el desglose dice qué
 * hacer, no sólo qué está mal.
 */
import { describe, expect, it } from "vitest";

import {
  ctpComplianceBreakdown,
  ctpComplianceScore,
  ctpComplianceSinMovimiento,
  ctpDeduccionCasosTexto,
  type CtpComplianceCounts,
} from "@/lib/forestal/ctp-compliance";

const SIN_ALERTAS: CtpComplianceCounts = {
  fueraPlazo: 0,
  pendientes: 0,
  citesCount: 0,
  especiesEnNegativo: 0,
  stockNegativo: 0,
  despachosSinTraza: 0,
};

/** Lo que el tenant real tenía el 2026-09-15: 21 sin recepcionar y Tornillo en negativo. */
const BLAS_HOY: CtpComplianceCounts = { ...SIN_ALERTAS, pendientes: 21, especiesEnNegativo: 1 };

describe("el puntaje del libro", () => {
  it("reproduce el 70 del tenant real: 100 − 25 (recepción) − 5 (especie negativa)", () => {
    expect(ctpComplianceScore(BLAS_HOY)).toBe(70);
  });

  it("cerrar la recepción es lo que lo sube: 21 → 0 devuelve los 25 puntos", () => {
    expect(ctpComplianceScore({ ...BLAS_HOY, pendientes: 0 })).toBe(95);
  });

  it("la categoría se llama por lo que hay que hacer, no por el trámite", () => {
    const fila = ctpComplianceBreakdown(BLAS_HOY).find((d) => d.key === "pendientes");
    expect(fila?.label).toBe("Guías sin recepcionar");
    expect(fila?.label).not.toContain("validar");
  });

  it("cada categoría que resta dice QUÉ hacer para recuperar los puntos", () => {
    for (const d of ctpComplianceBreakdown(BLAS_HOY).filter((x) => x.puntos > 0)) {
      expect(d.accion.length).toBeGreaterThan(20);
    }
    const recepcion = ctpComplianceBreakdown(BLAS_HOY).find((d) => d.key === "pendientes");
    expect(recepcion?.accion).toContain("recepción");
  });

  it("sin alertas da 100 y nada trae acción pendiente", () => {
    expect(ctpComplianceScore(SIN_ALERTAS)).toBe(100);
    expect(ctpComplianceBreakdown(SIN_ALERTAS).every((d) => d.puntos === 0)).toBe(true);
  });

  it("sin los totales del período sigue el cálculo de antes: 5 por caso, tope 25", () => {
    expect(ctpComplianceScore({ ...SIN_ALERTAS, pendientes: 5 })).toBe(75);
    expect(ctpComplianceScore({ ...SIN_ALERTAS, pendientes: 50 })).toBe(75);
  });
});

/** ADR-532: los casos restan en proporción a su base y un libro vacío no saca 100. */
describe("puntaje proporcional y sin movimiento (ADR-532)", () => {
  const CON_100_INGRESOS: CtpComplianceCounts = { ...SIN_ALERTAS, bases: { ingresos: 100, despachos: 40, producciones: 12 } };

  it("con base, 5 y 50 casos ya no restan igual (era la deuda del tope fijo)", () => {
    expect(ctpComplianceScore({ ...CON_100_INGRESOS, pendientes: 5 })).toBe(95); // 1,25 → piso 5
    expect(ctpComplianceScore({ ...CON_100_INGRESOS, pendientes: 50 })).toBe(87); // 12,5 → 13
    expect(ctpComplianceScore({ ...CON_100_INGRESOS, pendientes: 100 })).toBe(75); // todos → 25
  });

  it("recepcionar 16 de 21 ahora sí sube el puntaje (antes no se movía)", () => {
    const blas = { ...SIN_ALERTAS, bases: { ingresos: 21, despachos: 3, producciones: 2 } };
    expect(ctpComplianceScore({ ...blas, pendientes: 21 })).toBe(75);
    expect(ctpComplianceScore({ ...blas, pendientes: 5 })).toBe(94); // 25 × 5/21 = 5,95 → 6
  });

  it("un caso siempre se ve: el piso es 5 aunque la base sea enorme", () => {
    const fila = ctpComplianceBreakdown({ ...SIN_ALERTAS, fueraPlazo: 1, bases: { ingresos: 10_000 } }).find(
      (d) => d.key === "fueraPlazo",
    );
    expect(fila?.puntos).toBe(5);
  });

  it("despachos sin trazabilidad se miden contra los despachos, no contra los ingresos", () => {
    const d = ctpComplianceBreakdown({ ...CON_100_INGRESOS, despachosSinTraza: 20 }).find((x) => x.key === "despachosSinTraza");
    expect(d?.base).toBe(40);
    expect(d?.puntos).toBe(13); // 25 × 20/40 = 12,5 → 13
    expect(ctpDeduccionCasosTexto(d!)).toBe("20 de 40 despachos");
  });

  it("especies y productos en negativo siguen a 5 por caso con tope 25 (no tienen base)", () => {
    const filas = ctpComplianceBreakdown({ ...CON_100_INGRESOS, especiesEnNegativo: 2, stockNegativo: 9 });
    expect(filas.find((d) => d.key === "especiesEnNegativo")).toMatchObject({ base: null, puntos: 10, topeAlcanzado: false });
    expect(filas.find((d) => d.key === "stockNegativo")).toMatchObject({ base: null, puntos: 25, topeAlcanzado: true });
    expect(ctpDeduccionCasosTexto(filas.find((d) => d.key === "stockNegativo")!)).toBe("9+ casos");
  });

  it("con base, llegar a 25 no es «tope»: son todos los casos", () => {
    const fila = ctpComplianceBreakdown({ ...CON_100_INGRESOS, pendientes: 100 }).find((d) => d.key === "pendientes");
    expect(fila).toMatchObject({ puntos: 25, topeAlcanzado: false });
    expect(ctpDeduccionCasosTexto(fila!)).toBe("100 de 100 ingresos");
  });

  it("el score es 100 menos la suma del desglose, también con bases (una sola fórmula)", () => {
    const c = { ...CON_100_INGRESOS, fueraPlazo: 7, pendientes: 33, especiesEnNegativo: 1, stockNegativo: 2, despachosSinTraza: 3 };
    const suma = ctpComplianceBreakdown(c).reduce((t, d) => t + d.puntos, 0);
    expect(ctpComplianceScore(c)).toBe(100 - suma);
  });

  it("0 ingresos, 0 despachos y 0 producción = sin movimiento: null, no 100", () => {
    const vacio = { ...SIN_ALERTAS, bases: { ingresos: 0, despachos: 0, producciones: 0 } };
    expect(ctpComplianceSinMovimiento(vacio)).toBe(true);
    expect(ctpComplianceScore(vacio)).toBeNull();
  });

  it("sin movimiento pero con una especie que arrastra saldo negativo: sí se califica", () => {
    const c = { ...SIN_ALERTAS, especiesEnNegativo: 1, bases: { ingresos: 0, despachos: 0, producciones: 0 } };
    expect(ctpComplianceSinMovimiento(c)).toBe(false);
    expect(ctpComplianceScore(c)).toBe(95);
  });

  it("si falta un total no se afirma «sin movimiento» ni se inventa la base", () => {
    const sinProduccion = { ...SIN_ALERTAS, pendientes: 5, bases: { ingresos: undefined, despachos: 0, producciones: undefined } };
    expect(ctpComplianceSinMovimiento(sinProduccion)).toBe(false);
    expect(ctpComplianceScore(sinProduccion)).toBe(75); // 5 por caso, como antes
    expect(ctpComplianceScore({ ...SIN_ALERTAS, bases: { ingresos: 0, despachos: 0 } })).toBe(100);
  });

  it("CITES sigue sin restar con la fórmula nueva", () => {
    expect(ctpComplianceScore({ ...CON_100_INGRESOS, citesCount: 100, citesSinPermiso: 3 })).toBe(100);
  });
});
