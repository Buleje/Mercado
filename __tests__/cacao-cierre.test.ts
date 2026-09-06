/**
 * Cierre de campaña del cacao (ADR-303) — helpers puros de bloqueo por fecha.
 * Espeja los del cierre forestal: qué mes cubre un cierre y si una fecha cae en
 * uno activo (no reabierto).
 */

import { describe, it, expect } from "vitest";
import { monthRange, isDateClosed, closedPeriodOf, type CacaoCierrePeriodo } from "@/lib/cacao/cacao-cierre-types";

function cierreDe(year: number, month1: number, reabierto = false): CacaoCierrePeriodo {
  const { from, to, periodKey, label } = monthRange(year, month1 - 1);
  return {
    periodKey, from: from.toISOString(), to: to.toISOString(), label,
    closedAt: "2026-07-01T00:00:00.000Z", closedBy: "qa",
    snapshot: { stockKg: 0, acopioKg: 0, ventasKg: 0, mermasKg: 0, pagadoProductores: 0, cobradoVentas: 0, porGrado: [] },
    totales: { lotes: 0, acopioKg: 0, ventas: 0, ventasKg: 0, montoVentasPen: 0, mermasKg: 0 },
    reabierto: reabierto ? { at: "2026-07-02T00:00:00.000Z", by: "owner", motivo: "corrección" } : null,
  };
}

describe("monthRange", () => {
  it("junio 2026: rango + clave + label", () => {
    const { from, to, periodKey, label } = monthRange(2026, 5); // 5 = junio (0-based)
    expect(periodKey).toBe("2026-06");
    expect(from.getMonth()).toBe(5);
    expect(to.getMonth()).toBe(5);
    expect(to.getDate()).toBe(30);
    expect(label.toLowerCase()).toContain("junio");
  });
});

describe("isDateClosed / closedPeriodOf", () => {
  const cierres = [cierreDe(2026, 6)]; // junio cerrado
  it("fecha dentro del mes cerrado está bloqueada", () => {
    expect(isDateClosed(cierres, new Date(2026, 5, 15))).toBe(true);
    expect(closedPeriodOf(cierres, new Date(2026, 5, 15))?.periodKey).toBe("2026-06");
  });
  it("fecha de otro mes no está bloqueada", () => {
    expect(isDateClosed(cierres, new Date(2026, 6, 1))).toBe(false);
    expect(isDateClosed(cierres, new Date(2026, 4, 30))).toBe(false);
  });
  it("bordes del mes incluidos", () => {
    expect(isDateClosed(cierres, new Date(2026, 5, 1, 0, 0, 0, 0))).toBe(true);
    expect(isDateClosed(cierres, new Date(2026, 5, 30, 23, 59, 59, 999))).toBe(true);
  });
  it("período reabierto deja de bloquear", () => {
    expect(isDateClosed([cierreDe(2026, 6, true)], new Date(2026, 5, 15))).toBe(false);
  });
  it("fecha inválida no bloquea", () => {
    expect(isDateClosed(cierres, new Date("no-es-fecha"))).toBe(false);
  });
});
