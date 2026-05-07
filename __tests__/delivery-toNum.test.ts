/**
 * T1 — delivery-toNum.test.ts
 *
 * Tests para helper `toNum()` defensivo replicado desde
 * components/admin/unified/DeliveryPartnersModule.tsx (linea 73-80).
 *
 * La función NO está exportada del módulo React, así que replicamos la lógica
 * pura aquí — patrón "pure-function replica" aprobado en el brief.
 */

import { describe, it, expect } from "vitest";

// ── Réplica exacta de la función ──────────────────────────────────────────────
function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("toNum — delivery helper defensivo", () => {
  it('convierte string "12.50" a number 12.5', () => {
    expect(toNum("12.50")).toBe(12.5);
  });

  it("convierte null a 0", () => {
    expect(toNum(null)).toBe(0);
  });

  it("convierte undefined a 0", () => {
    expect(toNum(undefined)).toBe(0);
  });

  it('convierte string no-numérico "abc" a 0', () => {
    expect(toNum("abc")).toBe(0);
  });

  it("retorna 0 cuando el input es 0", () => {
    expect(toNum(0)).toBe(0);
  });

  it("convierte NaN a 0 (typeof NaN === 'number' pero !isFinite)", () => {
    expect(toNum(NaN)).toBe(0);
  });

  it('convierte string "19.99" a 19.99', () => {
    expect(toNum("19.99")).toBe(19.99);
  });
});
