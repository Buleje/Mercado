/**
 * __tests__/lib/monthly-range.test.ts
 *
 * Bloquea el riesgo de exactitud del endpoint /api/finanzas/monthly-summary:
 * el bucketing por rango UTC DEBE seleccionar exactamente el mismo mes que el
 * bucketing del cliente (createdAt.slice(0,7)). Si esto falla, los números del
 * chart de Finanzas no coincidirían tras mover la agregación al server.
 */
import { describe, it, expect } from "vitest";
import { utcMonthRange } from "@/lib/finance/monthly-range";

describe("utcMonthRange", () => {
  const ref = new Date("2026-06-15T12:00:00Z");

  it("monthKey == start.slice(0,7) y un timestamp de mitad de mes cae dentro", () => {
    for (let i = 0; i < 6; i++) {
      const { monthKey, start, end } = utcMonthRange(ref, i);
      expect(start.toISOString().slice(0, 7)).toBe(monthKey);
      const mid = new Date(`${monthKey}-15T10:00:00.000Z`);
      expect(mid.toISOString().slice(0, 7)).toBe(monthKey);
      expect(mid >= start && mid < end).toBe(true);
    }
  });

  it("los bordes UTC seleccionan el MISMO mes que createdAt.slice(0,7)", () => {
    const { monthKey, start, end } = utcMonthRange(ref, 0);
    expect(monthKey).toBe("2026-06");
    const within = [
      new Date("2026-06-01T00:00:00.000Z"),
      new Date("2026-06-30T23:59:59.999Z"),
    ];
    const outside = [
      new Date("2026-05-31T23:59:59.999Z"),
      new Date("2026-07-01T00:00:00.000Z"),
    ];
    for (const d of within) {
      expect(d >= start && d < end).toBe(true);
      expect(d.toISOString().slice(0, 7)).toBe(monthKey);
    }
    for (const d of outside) {
      expect(d >= start && d < end).toBe(false);
      expect(d.toISOString().slice(0, 7)).not.toBe(monthKey);
    }
  });

  it("retrocede cruzando el año correctamente", () => {
    const ref2 = new Date("2026-01-15T00:00:00Z");
    expect(utcMonthRange(ref2, 1).monthKey).toBe("2025-12");
    expect(utcMonthRange(ref2, 2).monthKey).toBe("2025-11");
    expect(utcMonthRange(ref2, 13).monthKey).toBe("2024-12");
  });
});
