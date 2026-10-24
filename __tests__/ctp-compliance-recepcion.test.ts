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

  it("el tope por categoría sigue en 25: 5 casos y 50 restan igual (deuda conocida)", () => {
    expect(ctpComplianceScore({ ...SIN_ALERTAS, pendientes: 5 })).toBe(75);
    expect(ctpComplianceScore({ ...SIN_ALERTAS, pendientes: 50 })).toBe(75);
  });
});
