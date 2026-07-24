/**
 * Resúmenes del lote cubicado: la misma madera leída por especie, por largo,
 * por sección — para liquidar de la forma que pida cada cliente.
 */
import { describe, expect, it } from "vitest";
import { agruparPor, resumenACsv } from "@/lib/forestal/cubicacion-resumen";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";

function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie?: string): PiezaCubicada {
  const base = { cantidad, espesor, ancho, largo, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
  const { pieTablar, m3 } = cubicarPieza(base);
  return { id: `${espesor}-${ancho}-${largo}-${especie}`, ...base, especie, pieTablar, m3 };
}

const lote = [
  pieza(2, 2, 8, 10, "Tornillo"),  // 26.67 PT
  pieza(1, 2, 8, 8, "Tornillo"),   // 10.67 PT
  pieza(3, 2, 6, 10, "Cedro"),     // 30.00 PT
  pieza(1, 1, 4, 12, "Cedro"),     // 4.00 PT
];

describe("agruparPor", () => {
  it("por especie suma cada especie", () => {
    const r = agruparPor(lote, "especie");
    expect(r.grupos.map((g) => g.label)).toEqual(["Tornillo", "Cedro"]); // Tornillo pesa 37.34, Cedro 34
    const cedro = r.grupos.find((g) => g.label === "Cedro")!;
    expect(cedro.cantidad).toBe(4);
    expect(cedro.pieTablar).toBeCloseTo(34, 1);
  });

  it("por largo agrupa las medidas del mismo largo", () => {
    const r = agruparPor(lote, "largo");
    const l10 = r.grupos.find((g) => g.label === "10 pies")!;
    expect(l10.cantidad).toBe(5); // 2 tornillo + 3 cedro
    expect(l10.pieTablar).toBeCloseTo(56.67, 1);
  });

  it("por sección junta espesor×ancho sin importar el largo ni la especie", () => {
    const r = agruparPor(lote, "seccion");
    const s28 = r.grupos.find((g) => g.label === '2×8"')!;
    expect(s28.cantidad).toBe(3); // los dos tornillos 2×8
    expect(s28.pieTablar).toBeCloseTo(37.33, 1);
  });

  it("por tipo agrupa comercial vs paquetería según la medida", () => {
    const mix = [
      pieza(1, 2, 8, 10, "Tornillo"), // comercial
      pieza(1, 2, 8, 4, "Cedro"),     // paq. corta (largo < 6)
      pieza(1, 1, 4, 12, "Cedro"),    // paq. larga (sección menor)
    ];
    const r = agruparPor(mix, "tipo");
    const labels = r.grupos.map((g) => g.label).sort();
    expect(labels).toContain("Comercial");
    expect(labels).toContain("Paquetería corta");
    expect(labels).toContain("Paquetería larga");
  });

  it("por medida distingue especie (dos 2×8 de especies distintas no se juntan)", () => {
    const mixto = [pieza(1, 2, 8, 10, "Tornillo"), pieza(1, 2, 8, 10, "Cedro")];
    const r = agruparPor(mixto, "medida");
    expect(r.grupos).toHaveLength(2);
  });

  it("los porcentajes suman 100 (± redondeo)", () => {
    const r = agruparPor(lote, "especie");
    const suma = r.grupos.reduce((a, g) => a + g.pctPt, 0);
    expect(suma).toBeGreaterThan(99);
    expect(suma).toBeLessThan(101);
  });

  it("ordena por pie tablar descendente", () => {
    const r = agruparPor(lote, "especie");
    expect(r.grupos[0].pieTablar).toBeGreaterThanOrEqual(r.grupos[1].pieTablar);
  });

  it("calcula el valor con el precio por PT", () => {
    const r = agruparPor(lote, "especie", 4);
    const cedro = r.grupos.find((g) => g.label === "Cedro")!;
    expect(cedro.valor).toBeCloseTo(34 * 4, 0);
    expect(r.total.valor).toBeCloseTo(r.total.pieTablar * 4, 0);
  });

  it("acepta un resolver de precio por especie (Tornillo ≠ Cedro)", () => {
    const precioDe = (p: PiezaCubicada) => (p.especie === "Cedro" ? 10 : 3);
    const r = agruparPor(lote, "especie", precioDe);
    const cedro = r.grupos.find((g) => g.label === "Cedro")!;
    const tornillo = r.grupos.find((g) => g.label === "Tornillo")!;
    expect(cedro.valor).toBeCloseTo(34 * 10, 0);
    expect(tornillo.valor).toBeCloseTo(37.34 * 3, 0);
    expect(r.total.valor).toBeCloseTo(34 * 10 + 37.34 * 3, 0);
  });

  it("con resolver, un grupo que mezcla especies suma cada pieza a su precio", () => {
    // Por largo, el grupo '10 pies' junta Tornillo (26.67 PT) y Cedro (30 PT)
    const precioDe = (p: PiezaCubicada) => (p.especie === "Cedro" ? 10 : 3);
    const r = agruparPor(lote, "largo", precioDe);
    const l10 = r.grupos.find((g) => g.label === "10 pies")!;
    expect(l10.valor).toBeCloseTo(26.67 * 3 + 30 * 10, 0);
  });

  it("piezas sin especie caen en 'Sin especie'", () => {
    const r = agruparPor([pieza(1, 2, 8, 10)], "especie");
    expect(r.grupos[0].label).toBe("Sin especie");
  });

  it("lote vacío da totales en cero, no NaN", () => {
    const r = agruparPor([], "especie");
    expect(r.grupos).toEqual([]);
    expect(r.total.pieTablar).toBe(0);
  });

  it("respeta unidades distintas en la etiqueta", () => {
    const cm = { id: "x", cantidad: 1, espesor: 5, ancho: 20, largo: 3, uEspesor: "cm" as const, uAncho: "cm" as const, uLargo: "m" as const, pieTablar: 10, m3: 0.003 };
    expect(agruparPor([cm], "largo").grupos[0].label).toBe("3 m");
    expect(agruparPor([cm], "seccion").grupos[0].label).toBe("5×20 cm");
  });
});

describe("resumenACsv", () => {
  it("arma el csv con cabecera, filas y total", () => {
    const csv = resumenACsv(agruparPor(lote, "especie", 4), "especie", true);
    const lineas = csv.replace(/^﻿/, "").split("\n");
    expect(lineas[0]).toBe("especie,Piezas,PieTablar,m3,%,ValorS/");
    expect(lineas.at(-1)).toContain("TOTAL");
    expect(lineas.at(-1)).toContain("100.0");
  });

  it("sin precio no incluye la columna de valor", () => {
    const csv = resumenACsv(agruparPor(lote, "largo"), "largo", false);
    expect(csv).not.toContain("ValorS/");
  });
});
