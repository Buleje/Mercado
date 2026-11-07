import { describe, it, expect } from "vitest";
import { desdeTotal, desdeBase, tasaDelProducto, etiquetaSinIgv, leerMonto, montoATexto } from "@/lib/precio-igv";

describe("precio con y sin IGV", () => {
  it("S/ 11,80 ↔ 10,00 + 1,80", () => {
    expect(desdeTotal(11.8)).toEqual({ base: 10, igv: 1.8, total: 11.8 });
    expect(desdeBase(10)).toEqual({ base: 10, igv: 1.8, total: 11.8 });
  });
  it("cero, negativos y basura dan 0", () => {
    expect(desdeTotal(0)).toEqual({ base: 0, igv: 0, total: 0 });
    expect(desdeBase(-3)).toEqual({ base: 0, igv: 0, total: 0 });
    expect(desdeBase(NaN).total).toBe(0);
  });
  it("monto con céntimos que no cierra: base + IGV suma el total exacto", () => {
    const d = desdeTotal(10);
    expect(d).toEqual({ base: 8.47, igv: 1.53, total: 10 });
    expect(r(d.base + d.igv)).toBe(10);
    // ida y vuelta desde la base redondeada: puede correr un céntimo, y se ve en el total
    expect(desdeBase(8.47).total).toBe(9.99);
  });
  it("ida y vuelta desde el total no se mueve en montos de góndola", () => {
    for (const t of [1, 2.5, 3.9, 5.5, 12.9, 99.9, 118, 1234.56]) {
      expect(desdeBase(desdeTotal(t).base).total).toBeGreaterThanOrEqual(r(t - 0.01));
      expect(desdeBase(desdeTotal(t).base).total).toBeLessThanOrEqual(r(t + 0.01));
    }
  });
  it("exonerado, inafecto o tienda sin IGV: base = total", () => {
    expect(tasaDelProducto("exonerado")).toBe(0);
    expect(tasaDelProducto("inafecto")).toBe(0);
    expect(tasaDelProducto("gravado", 0)).toBe(0);
    expect(tasaDelProducto("gravado", 0.18)).toBe(0.18);
    expect(tasaDelProducto(undefined)).toBe(0.18);
    expect(desdeTotal(11.8, 0)).toEqual({ base: 11.8, igv: 0, total: 11.8 });
    expect(etiquetaSinIgv("exonerado")).toBe("Exonerado de IGV");
    expect(etiquetaSinIgv("gravado")).toBeNull();
    expect(etiquetaSinIgv("gravado", 0)).toMatch(/Sin IGV/);
  });
  it("lee y escribe montos de un input", () => {
    expect(leerMonto("11,80")).toBe(11.8);
    expect(leerMonto("")).toBe(0);
    expect(leerMonto("abc")).toBe(0);
    expect(montoATexto(11.8)).toBe("11.8");
    expect(montoATexto(0)).toBe("");
  });
});
const r = (n: number) => Math.round(n * 100) / 100;
