import { describe, it, expect } from "vitest";
import {
  computeObligacionesMensuales,
  rentaPagoACuentaRate,
  ventanaVencimientoReferencial,
  UIT,
} from "@/lib/tax/obligaciones-peru";

describe("computeObligacionesMensuales — IGV", () => {
  it("IGV a pagar = débito ventas − crédito compras", () => {
    const r = computeObligacionesMensuales({ regimen: "rmt", ventasBase: 10000, comprasBase: 4000 });
    expect(r.igvVentas).toBe(1800);
    expect(r.igvCompras).toBe(720);
    expect(r.obligaciones.find(o => o.key === "igv")!.monto).toBe(1080);
  });

  it("si las compras superan a las ventas, el IGV a pagar es 0 (crédito a favor)", () => {
    const r = computeObligacionesMensuales({ regimen: "rer", ventasBase: 1000, comprasBase: 5000 });
    expect(r.obligaciones.find(o => o.key === "igv")!.monto).toBe(0);
  });
});

describe("rentaPagoACuentaRate por régimen", () => {
  it("RER = 1.5%", () => {
    expect(rentaPagoACuentaRate("rer", 10000)).toBe(0.015);
  });
  it("RMT = 1% hasta 300 UIT, 1.5% por encima", () => {
    expect(rentaPagoACuentaRate("rmt", 300 * UIT)).toBe(0.01);
    expect(rentaPagoACuentaRate("rmt", 300 * UIT + 1)).toBe(0.015);
  });
  it("NRUS no usa porcentaje", () => {
    expect(rentaPagoACuentaRate("nrus", 10000)).toBe(0);
  });
});

describe("computeObligacionesMensuales — Renta", () => {
  it("RMT bajo 300 UIT → 1% de ventas, no estimado", () => {
    const r = computeObligacionesMensuales({ regimen: "rmt", ventasBase: 20000, comprasBase: 0 });
    const renta = r.obligaciones.find(o => o.key === "renta")!;
    expect(renta.monto).toBe(200);
    expect(renta.estimado).toBe(false);
  });
  it("General → 1.5% pero marcado como estimado (coeficiente real exige ejercicio anterior)", () => {
    const r = computeObligacionesMensuales({ regimen: "general", ventasBase: 20000, comprasBase: 0 });
    const renta = r.obligaciones.find(o => o.key === "renta")!;
    expect(renta.monto).toBe(300);
    expect(renta.estimado).toBe(true);
  });
  it("NRUS → obligación de cuota fija (monto 0, requiere categoría)", () => {
    const r = computeObligacionesMensuales({ regimen: "nrus", ventasBase: 5000, comprasBase: 0 });
    expect(r.obligaciones.some(o => o.key === "nrus")).toBe(true);
    expect(r.obligaciones.some(o => o.key === "renta")).toBe(false);
  });
});

describe("ventanaVencimientoReferencial", () => {
  it("extrae el último dígito del RUC", () => {
    expect(ventanaVencimientoReferencial("20512345678")!.ultimoDigito).toBe(8);
  });
  it("devuelve null sin RUC", () => {
    expect(ventanaVencimientoReferencial("")).toBeNull();
  });
});
