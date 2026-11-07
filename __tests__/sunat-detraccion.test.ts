/**
 * __tests__/sunat-detraccion.test.ts
 *
 * Tests PUROS del cálculo del SPOT (detracción) al vender madera.
 * Cifras oficiales citadas en lib/sunat/detraccion.ts (NO cambiar sin fuente):
 * madera = bien 008, 4 %, umbral S/ 700 (aplica sólo por encima).
 */

import { describe, it, expect, vi } from "vitest";
import {
  calcularDetraccion,
  SPOT_MADERA,
  type EntradaDetraccion,
} from "@/lib/sunat/detraccion";

// lib/sunat.ts (armador UBL viejo) importa prisma al tope; no lo usa generateXML.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { generateXML, type SunatDocument } from "@/lib/sunat";

const round2 = (n: number): number => Math.round(n * 100) / 100;

const factura = (
  totalGravadoConIgv: number,
  bienSujeto: "008" | null = "008",
): EntradaDetraccion => ({
  tipoComprobante: "factura",
  totalGravadoConIgv,
  bienSujeto,
});

describe("SPOT_MADERA (cifras oficiales confirmadas en SUNAT 18-10-2026)", () => {
  it("bien 008, tasa 4 %, umbral S/ 700", () => {
    expect(SPOT_MADERA.codigoBien).toBe("008");
    expect(SPOT_MADERA.porcentaje).toBe(4);
    expect(SPOT_MADERA.umbralSoles).toBe(700);
    expect(SPOT_MADERA.nubefactTipo).toBe(8);
    expect(SPOT_MADERA.medioPago).toBe("001");
    expect(SPOT_MADERA.leyenda).toBe("2006");
  });
});

describe("calcularDetraccion", () => {
  it("aplica: factura de madera gravada > S/ 700 → 4 %", () => {
    const d = calcularDetraccion(factura(1180));
    expect(d.aplica).toBe(true);
    expect(d.motivo).toBe("aplica");
    expect(d.codigoBien).toBe("008");
    expect(d.porcentaje).toBe(4);
    expect(d.base).toBe(1180);
    expect(d.monto).toBe(47.2); // 1180 × 4 %
    expect(d.netoACobrar).toBe(1132.8);
  });

  it("aplica: justo por encima del umbral (700,01 → 28,00)", () => {
    const d = calcularDetraccion(factura(700.01));
    expect(d.aplica).toBe(true);
    expect(d.monto).toBe(28); // round2(28.0004)
  });

  it("importe_hasta_700: exactamente S/ 700,00 → no aplica", () => {
    const d = calcularDetraccion(factura(700));
    expect(d.aplica).toBe(false);
    expect(d.motivo).toBe("importe_hasta_700");
    expect(d.monto).toBe(0);
    expect(d.codigoBien).toBeNull();
    expect(d.porcentaje).toBe(0);
  });

  it("no_gravada: venta exonerada por la Amazonía (Ley 27037) → no aplica", () => {
    // Toda la venta exonerada ⇒ base gravada con IGV = 0.
    const d = calcularDetraccion(factura(0));
    expect(d.aplica).toBe(false);
    expect(d.motivo).toBe("no_gravada");
    expect(d.monto).toBe(0);
  });

  it("boleta_sin_credito_fiscal: una boleta nunca lleva detracción", () => {
    const d = calcularDetraccion({
      tipoComprobante: "boleta",
      totalGravadoConIgv: 5000,
      bienSujeto: "008",
    });
    expect(d.aplica).toBe(false);
    expect(d.motivo).toBe("boleta_sin_credito_fiscal");
    expect(d.monto).toBe(0);
  });

  it("bien_no_sujeto: la venta no es de madera (bien null) → no aplica", () => {
    const d = calcularDetraccion(factura(5000, null));
    expect(d.aplica).toBe(false);
    expect(d.motivo).toBe("bien_no_sujeto");
    expect(d.monto).toBe(0);
    expect(d.codigoBien).toBeNull();
  });

  it("netoACobrar usa el TOTAL del comprobante, no sólo la base gravada", () => {
    // Factura mixta: exonerada 200 + gravada 1000 (con IGV) = total 1200.
    // Detracción 4 % sobre la base gravada = 40 → neto 1160 (NO 960).
    const d = calcularDetraccion({
      tipoComprobante: "factura",
      totalGravadoConIgv: 1000,
      total: 1200,
      bienSujeto: "008",
    });
    expect(d.aplica).toBe(true);
    expect(d.base).toBe(1000);
    expect(d.monto).toBe(40);
    expect(d.netoACobrar).toBe(1160);
  });

  it("monto SIEMPRE = round2(base × 4 %) cuando aplica", () => {
    for (const total of [700.01, 701, 1180, 2345.67, 10000, 99999.99]) {
      const d = calcularDetraccion(factura(total));
      expect(d.aplica).toBe(true);
      expect(d.monto).toBe(round2(d.base * 0.04));
      expect(d.netoACobrar).toBe(round2(d.base - d.monto));
    }
  });

  it("base se recorta a 0 con montos negativos (defensivo)", () => {
    const d = calcularDetraccion(factura(-50));
    expect(d.base).toBe(0);
    expect(d.aplica).toBe(false);
    expect(d.motivo).toBe("no_gravada");
  });
});

describe("armador UBL viejo (lib/sunat.ts) rechaza ventas con detracción", () => {
  const docMadera: SunatDocument = {
    tipo: "factura",
    serie: "F001",
    numero: 1,
    fecha: "2026-10-18",
    cliente: { ruc: "20601234568", nombre: "MADERERA LIMA SRL" },
    items: [{ descripcion: "Madera aserrada", cantidad: 1, precioUnit: 1180, igv: 180 }],
    totalGravado: 1000,
    totalIgv: 180,
    totalVenta: 1180,
    moneda: "PEN",
    bienSujetoDetraccion: "008",
  };

  it("generateXML lanza si la venta está sujeta a detracción", () => {
    expect(() => generateXML(docMadera)).toThrow(/detracci/i);
  });

  it("generateXML sigue funcionando para una venta normal (sin detracción)", () => {
    const xml = generateXML({ ...docMadera, bienSujetoDetraccion: null });
    expect(xml).toContain("<Invoice");
    expect(xml).toContain("F001-00000001");
  });
});
