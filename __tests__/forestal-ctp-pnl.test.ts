/**
 * P&L del CTP (ADR-141) — decisión pura del margen. La regla de oro: sin venta o
 * sin costo ⇒ margen null, NUNCA 0.
 */

import { describe, it, expect } from "vitest";
import { agregarPnl, decidirMargen, type FilaPnl } from "@/lib/forestal/ctp-pnl";

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

  it("madera de servicio (ADR-437) gana sobre «sin venta»: el despacho de madera ajena no es un faltante", () => {
    const sinVenta = decidirMargen(null, null, "madera_de_servicio");
    expect(sinVenta.motivo).toBe("madera_de_servicio");
    expect(sinVenta.margen).toBeNull(); // nunca 0
    expect(decidirMargen(5000, null, "madera_de_servicio").motivo).toBe("madera_de_servicio");
  });

  it("mixto (madera propia + de servicio) es una venta NUESTRA: sin venta es «sin_venta», con venta es incompleto", () => {
    expect(decidirMargen(null, null, "mixto_servicio").motivo).toBe("sin_venta");
    const r = decidirMargen(9000, null, "mixto_servicio");
    expect(r.motivo).toBe("mixto_servicio");
    expect(r.margen).toBeNull(); // nunca 0
  });
});

describe("agregarPnl — el P&L del período", () => {
  const fila = (o: Partial<FilaPnl>): FilaPnl => ({
    id: "d1", lineNo: 1, producto: "Tabla · Tornillo", gtfSalida: null,
    valorVenta: null, cogs: null, margen: null, margenPct: null, moneda: "PEN", motivo: "ok",
    ...o,
  });

  it("repro revisión 26-09: el despacho mixto de S/ 9 000 cuenta como incompleto sin costo y su venta se dice", () => {
    const p = agregarPnl([
      fila({ id: "a", valorVenta: 1000, cogs: 600, margen: 400, margenPct: 40 }),
      fila({ id: "b", lineNo: 2, valorVenta: 9000, motivo: "mixto_servicio" }),
    ]);
    expect(p.completos).toBe(1);
    expect(p.sinCosto).toBe(1); // antes: 0 — no avisaba
    expect(p.mixtos).toBe(1);
    expect(p.deServicio).toBe(0); // antes: 1 — lo escondía como servicio
    expect(p.ventasSinMargen).toBe(9000); // la venta no se evapora
    // El margen sigue cubriendo SOLO lo completo: no se inventa.
    expect(p.ventasTotal).toBe(1000);
    expect(p.margenTotal).toBe(400);
    expect(p.margenPct).toBe(40);
  });

  it("el de pura madera de servicio no es incompleto ni suma venta sin margen", () => {
    const p = agregarPnl([fila({ motivo: "madera_de_servicio", valorVenta: 500 })]);
    expect(p.deServicio).toBe(1);
    expect(p.sinCosto).toBe(0);
    expect(p.ventasSinMargen).toBe(0);
  });

  it("sin venta cuenta aparte y no aporta venta sin margen", () => {
    const p = agregarPnl([fila({ motivo: "sin_venta" })]);
    expect(p.sinVenta).toBe(1);
    expect(p.ventasSinMargen).toBe(0);
  });

  it("por producto agrupa sólo lo completo, ordenado por margen", () => {
    const p = agregarPnl([
      fila({ id: "a", producto: "A", valorVenta: 100, cogs: 90, margen: 10, margenPct: 10 }),
      fila({ id: "b", producto: "B", valorVenta: 100, cogs: 50, margen: 50, margenPct: 50 }),
      fila({ id: "c", producto: "B", valorVenta: 200, motivo: "falta_costo" }),
    ]);
    expect(p.porProducto.map((x) => x.producto)).toEqual(["B", "A"]);
    expect(p.porProducto[0].ventas).toBe(100);
    expect(p.porDespacho).toHaveLength(3);
  });
});
