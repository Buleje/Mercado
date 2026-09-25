/**
 * Cierre de período CTP (ADR-139) — helpers puros de fecha/bloqueo.
 * Lo que sostiene la inmutabilidad del acta: qué mes cubre un cierre y si una
 * fecha cae dentro de uno activo (no reabierto).
 */

import { describe, it, expect } from "vitest";
import {
  monthRange,
  monthKeyOf,
  isDateClosed,
  closedPeriodOf,
  type CtpCierrePeriodo,
} from "@/lib/forestal/ctp-cierre-types";

function cierreDe(year: number, month1: number, reabierto = false): CtpCierrePeriodo {
  const { from, to, periodKey, label } = monthRange(year, month1 - 1);
  return {
    periodKey, from: from.toISOString(), to: to.toISOString(), label,
    closedAt: "2026-06-01T00:00:00.000Z", closedBy: "qa",
    saldoCierre: { materiaPrima: [], productos: [] },
    totales: { ingresosCount: 0, volumenIngresado: 0, corridas: 0, despachos: 0, corridasCongeladas: 0, corridasSinCostear: 0, especiesEnNegativo: 0 },
    reabierto: reabierto ? { at: "2026-06-02T00:00:00.000Z", by: "owner", motivo: "corrección" } : null,
  };
}

describe("monthRange / monthKeyOf", () => {
  it("mayo 2026: rango + clave + label", () => {
    const { from, to, periodKey, label } = monthRange(2026, 4); // 4 = mayo (0-based)
    expect(periodKey).toBe("2026-05");
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(4);
    expect(to.getMonth()).toBe(4);
    expect(to.getDate()).toBe(31);
    expect(label.toLowerCase()).toContain("mayo");
  });
  it("monthKeyOf usa el mes local del instante", () => {
    expect(monthKeyOf(new Date(2026, 4, 15))).toBe("2026-05");
    expect(monthKeyOf(new Date(2026, 11, 1))).toBe("2026-12");
  });
});

describe("isDateClosed / closedPeriodOf", () => {
  const cierres = [cierreDe(2026, 5)]; // mayo cerrado

  it("una fecha DENTRO del mes cerrado está bloqueada", () => {
    expect(isDateClosed(cierres, new Date(2026, 4, 15))).toBe(true);
    expect(closedPeriodOf(cierres, new Date(2026, 4, 15))?.periodKey).toBe("2026-05");
  });
  it("una fecha de OTRO mes no está bloqueada", () => {
    expect(isDateClosed(cierres, new Date(2026, 5, 1))).toBe(false); // junio
    expect(isDateClosed(cierres, new Date(2026, 3, 30))).toBe(false); // abril
    expect(closedPeriodOf(cierres, new Date(2026, 5, 1))).toBeNull();
  });
  it("los bordes del mes (1° 00:00 y último 23:59) están incluidos", () => {
    expect(isDateClosed(cierres, new Date(2026, 4, 1, 0, 0, 0, 0))).toBe(true);
    expect(isDateClosed(cierres, new Date(2026, 4, 31, 23, 59, 59, 999))).toBe(true);
  });
  it("un período REABIERTO deja de bloquear", () => {
    const reab = [cierreDe(2026, 5, true)];
    expect(isDateClosed(reab, new Date(2026, 4, 15))).toBe(false);
    expect(closedPeriodOf(reab, new Date(2026, 4, 15))).toBeNull();
  });
  it("fecha inválida no bloquea (no rompe)", () => {
    expect(isDateClosed(cierres, new Date("no-es-fecha"))).toBe(false);
  });
});
