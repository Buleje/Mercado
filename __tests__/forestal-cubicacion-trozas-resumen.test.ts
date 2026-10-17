/**
 * Agrupado del patio de trozas (rolliza) por especie, tipo (diámetro) y
 * largo — el mismo lote leído de tres formas para la pestaña Resúmenes.
 */
import { describe, expect, it } from "vitest";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { cubicarTroza, type TrozaCubicada } from "@/lib/forestal/cubicacion-trozas";
import { agruparTrozasPor, resumenTrozasACsv, resumenTrozasPorEspecie } from "@/lib/forestal/cubicacion-trozas-resumen";

const troza = (over: Partial<TrozaCubicada>): TrozaCubicada => ({
  id: over.id ?? `t-${Math.random()}`,
  d1: 40, d2: 40, largo: 3, m3: cubicarTroza(40, 3),
  ...over,
});

const rows: TrozaCubicada[] = [
  troza({ id: "a", especie: "Cedro", d1: 20, d2: 22, largo: 3, m3: cubicarTroza(20, 3, 22) }), // Delgada
  troza({ id: "b", especie: "Cedro", d1: 30, d2: 32, largo: 4, m3: cubicarTroza(30, 4, 32) }), // Media
  troza({ id: "c", especie: "Tornillo", d1: 50, d2: 55, largo: 3, m3: cubicarTroza(50, 3, 55) }), // Gruesa
  troza({ id: "d", d1: 20, d2: 20, largo: 3, m3: cubicarTroza(20, 3) }), // sin especie, Delgada
];

describe("agruparTrozasPor", () => {
  it("por especie: junta las del mismo nombre y deja las sin especie aparte", () => {
    const r = agruparTrozasPor(rows, "especie");
    const cedro = r.grupos.find((g) => g.label === "Cedro");
    expect(cedro?.trozas).toBe(2);
    expect(cedro?.m3).toBeCloseTo(rows[0].m3 + rows[1].m3, 4);
    expect(r.grupos.find((g) => g.label === "Sin especie")?.trozas).toBe(1);
    expect(r.total.trozas).toBe(4);
  });

  it("por tipo: ordena Delgada · Media · Gruesa", () => {
    const r = agruparTrozasPor(rows, "tipo");
    expect(r.grupos.map((g) => g.label)).toEqual(["Delgada", "Media", "Gruesa"]);
    expect(r.grupos[0].trozas).toBe(2); // las dos de d1=20
  });

  it("por largo: agrupa por el valor exacto y ordena ascendente", () => {
    const r = agruparTrozasPor(rows, "largo");
    expect(r.grupos.map((g) => g.label)).toEqual(["3.0 m", "4.0 m"]);
    expect(r.grupos[0].trozas).toBe(3);
  });

  it("% del m³ suma 100 sobre el total del lote", () => {
    const r = agruparTrozasPor(rows, "especie");
    const suma = r.grupos.reduce((a, g) => a + g.pctM3, 0);
    expect(suma).toBeCloseTo(100, 0);
  });

  it("lote vacío: sin grupos, sin dividir por cero", () => {
    const r = agruparTrozasPor([], "tipo");
    expect(r.grupos).toEqual([]);
    expect(r.total).toEqual({ trozas: 0, m3: 0, pt: 0 });
  });

  it("PT es el equivalente en pie tablar del m³ (referencia, no dato propio)", () => {
    const r = agruparTrozasPor(rows, "especie");
    const cedro = r.grupos.find((g) => g.label === "Cedro")!;
    expect(cedro.pt).toBeCloseTo(cedro.m3 * PT_POR_M3, 1);
    expect(r.total.pt).toBeCloseTo(r.total.m3 * PT_POR_M3, 1);
  });
});

describe("resumenTrozasPorEspecie (cruce especie × tipo)", () => {
  it("una entrada por especie, con su desglose por categoría de diámetro", () => {
    const bloques = resumenTrozasPorEspecie(rows);
    const cedro = bloques.find((b) => b.especie === "Cedro")!;
    expect(cedro.total.trozas).toBe(2);
    expect(cedro.tipos.map((t) => t.label)).toEqual(["Delgada", "Media"]);
    expect(bloques.find((b) => b.especie === "Sin especie")?.total.trozas).toBe(1);
    expect(bloques.find((b) => b.especie === "Tornillo")?.tipos.map((t) => t.label)).toEqual(["Gruesa"]);
  });

  it("lote vacío: sin bloques", () => {
    expect(resumenTrozasPorEspecie([])).toEqual([]);
  });
});

describe("resumenTrozasACsv", () => {
  it("incluye BOM, cabecera con PT y fila TOTAL", () => {
    const csv = resumenTrozasACsv(agruparTrozasPor(rows, "especie"), "especie");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Trozas,m3,PT,%m3");
    expect(csv).toContain("TOTAL,4,");
  });
});
