/**
 * P&L del CTP (ADR-141) — decisión pura del margen. La regla de oro: sin venta o
 * sin costo ⇒ margen null, NUNCA 0.
 */

import { describe, it, expect } from "vitest";
import { decidirMargen } from "@/lib/forestal/ctp-pnl";

describe("decidirMargen", () => {
  it("sin venta → sin_venta, margen null", () => {
    const r = decidirMargen(null, 100, "ok");
    expect(r.margen).toBeNull();
    expect(r.margenPct).toBeNull();
    expect(r.motivo).toBe("sin_venta");
  });

  it("venta pero costo null → propaga el motivo del COGS (nunca 0)", () => {
    const r = decidirMargen(5000, null, "falta_costo");
    expect(r.margen).toBeNull();
    expect(r.motivo).toBe("falta_costo");
  });

  it("venta con costo null y COGS ok → sin_costo", () => {
    expect(decidirMargen(5000, null, "ok").motivo).toBe("sin_costo");
  });

  it("venta + costo → margen = venta − costo y % correcto", () => {
    const r = decidirMargen(1000, 600, "ok");
    expect(r.margen).toBe(400);
    expect(r.margenPct).toBe(40);
    expect(r.motivo).toBe("ok");
  });

  it("pérdida: costo > venta → margen negativo", () => {
    const r = decidirMargen(100, 150, "ok");
    expect(r.margen).toBe(-50);
    expect(r.margenPct).toBe(-50);
  });

  it("venta 0 → margenPct null (no divide por cero)", () => {
    const r = decidirMargen(0, 0, "ok");
    expect(r.margen).toBe(0);
    expect(r.margenPct).toBeNull();
  });
});
