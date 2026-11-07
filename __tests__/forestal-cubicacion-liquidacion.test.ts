/**
 * Liquidación del lote por especie: comprobante para el comprador.
 */
import { describe, expect, it } from "vitest";
import { construirLiquidacion, liquidacionAWhatsApp, liquidacionAHtml, fechaLarga } from "@/lib/forestal/cubicacion-liquidacion";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";

function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie?: string): PiezaCubicada {
  const base = { cantidad, espesor, ancho, largo, uEspesor: "pulg" as const, uAncho: "pulg" as const, uLargo: "pies" as const };
  const { pieTablar, m3 } = cubicarPieza(base);
  return { id: `${espesor}-${ancho}-${largo}-${especie}`, ...base, especie, pieTablar, m3 };
}

const lote = [
  pieza(2, 2, 8, 10, "Tornillo"), // 26.67 PT
  pieza(1, 2, 8, 8, "Tornillo"),  // 10.67 PT → Tornillo 37.34
  pieza(3, 2, 6, 10, "Cedro"),    // 30.00 PT
  pieza(1, 1, 4, 12, "Cedro"),    // 4.00 PT → Cedro 34
];

describe("construirLiquidacion", () => {
  it("una línea por especie con su precio derivado y subtotal", () => {
    const precioDe = (p: PiezaCubicada) => (p.especie === "Cedro" ? 10 : 3);
    const liq = construirLiquidacion(lote, precioDe);
    const cedro = liq.lineas.find((l) => l.especie === "Cedro")!;
    const tornillo = liq.lineas.find((l) => l.especie === "Tornillo")!;
    expect(cedro.precioPt).toBeCloseTo(10, 2);
    expect(cedro.subtotal).toBeCloseTo(34 * 10, 0);
    expect(tornillo.precioPt).toBeCloseTo(3, 2);
    expect(liq.total).toBeCloseTo(34 * 10 + 37.34 * 3, 0);
    expect(liq.totalPiezas).toBe(7);
  });

  it("precio global uniforme", () => {
    const liq = construirLiquidacion(lote, 4);
    expect(liq.total).toBeCloseTo(liq.totalPt * 4, 0);
    for (const l of liq.lineas) expect(l.precioPt).toBeCloseTo(4, 2);
  });

  it("sin precio, total 0 y precioPt 0 (no NaN)", () => {
    const liq = construirLiquidacion(lote, 0);
    expect(liq.total).toBe(0);
    for (const l of liq.lineas) expect(l.precioPt).toBe(0);
  });
});

describe("salidas", () => {
  it("WhatsApp incluye cliente, líneas y total", () => {
    const liq = construirLiquidacion(lote, 4);
    const txt = liquidacionAWhatsApp({ cliente: "Maderera López", fecha: "2026-07-23" }, liq);
    expect(txt).toContain("LIQUIDACIÓN");
    expect(txt).toContain("Maderera López");
    expect(txt).toContain("23/07/2026");
    expect(txt).toContain("Total");
  });

  it("HTML imprimible escapa el nombre del cliente", () => {
    const liq = construirLiquidacion(lote, 4);
    const html = liquidacionAHtml({ cliente: "A & <b>B</b>", fecha: "2026-07-23" }, liq);
    expect(html).toContain("A &amp; &lt;b&gt;B&lt;/b&gt;");
    expect(html).toContain("<table>");
  });

  it("fechaLarga pasa ISO a dd/mm/aaaa", () => {
    expect(fechaLarga("2026-07-23")).toBe("23/07/2026");
  });
});
