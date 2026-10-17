/**
 * comprobante-del-gasto — el papel del gasto y su IGV (lo decide el servidor).
 * Sólo la factura lleva IGV que se descuenta; exonerada = 0, no vacío.
 */
import { describe, it, expect } from "vitest";
import { errorDeRuc, igvIncluido, normalizarNumero, revisarComprobante } from "@/lib/gastos/comprobante-del-gasto";

// RUC con dígito verificador correcto (módulo 11 de SUNAT).
const RUC_OK = "20100070970";

describe("comprobante del gasto", () => {
  it("IGV incluido en el total: 118 → 18", () => {
    expect(igvIncluido(118)).toBe(18);
    expect(igvIncluido(50)).toBe(7.63);
    expect(igvIncluido(0)).toBe(0);
  });

  it("RUC: sólo números, 11 dígitos y dígito verificador", () => {
    expect(errorDeRuc("")).toBeNull();
    expect(errorDeRuc(RUC_OK)).toBeNull();
    expect(errorDeRuc("2010007097")).toMatch(/11 dígitos/);
    expect(errorDeRuc("2010007097X")).toMatch(/sólo números/);
    expect(errorDeRuc("20100070971")).toMatch(/no existe/);
  });

  it("número: mayúsculas y guion sin espacios", () => {
    expect(normalizarNumero(" f001 - 123 ")).toBe("F001-123");
  });

  it("sin comprobante: nada de IGV ni número", () => {
    const r = revisarComprobante(100, { documentType: "sin_comprobante", documentNumber: "X", afectoIgv: true });
    expect(r).toEqual({ ok: true, datos: { documentType: "sin_comprobante", documentNumber: null, supplierRuc: null, afectoIgv: false, igvAmount: null } });
  });

  it("boleta: guarda número y RUC, pero su IGV no es crédito fiscal (null)", () => {
    const r = revisarComprobante(118, { documentType: "boleta", documentNumber: "b001-9", supplierRuc: RUC_OK, afectoIgv: true, igvAmount: 18 });
    expect(r).toEqual({ ok: true, datos: { documentType: "boleta", documentNumber: "B001-9", supplierRuc: RUC_OK, afectoIgv: false, igvAmount: null } });
  });

  it("ticket viejo se guarda como boleta", () => {
    const r = revisarComprobante(10, { documentType: "ticket" });
    expect(r.ok && r.datos.documentType).toBe("boleta");
  });

  it("factura con IGV: lo calcula del total si no viene", () => {
    const r = revisarComprobante(118, { documentType: "factura", documentNumber: "F001-1", supplierRuc: RUC_OK, afectoIgv: true });
    expect(r).toEqual({ ok: true, datos: { documentType: "factura", documentNumber: "F001-1", supplierRuc: RUC_OK, afectoIgv: true, igvAmount: 18 } });
  });

  it("factura exonerada (Ley 27037): IGV 0, no vacío", () => {
    const r = revisarComprobante(118, { documentType: "factura", documentNumber: "F001-1", supplierRuc: RUC_OK, afectoIgv: false });
    expect(r.ok && r.datos.igvAmount).toBe(0);
  });

  it("factura incompleta NO es error en el servidor (la completitud la pide el formulario)", () => {
    // Sin elegir IGV ni dar cifra: IGV desconocido (null), no 0.
    expect(revisarComprobante(118, { documentType: "factura" })).toEqual({
      ok: true, datos: { documentType: "factura", documentNumber: null, supplierRuc: null, afectoIgv: false, igvAmount: null },
    });
    // Una cifra de IGV sin la marca (Punto de compra, deshacer): se toma como afecta.
    const conCifra = revisarComprobante(118, { documentType: "factura", afectoIgv: false, igvAmount: 18 });
    expect(conCifra.ok && conCifra.datos).toMatchObject({ afectoIgv: true, igvAmount: 18 });
  });

  it("factura: el IGV no pasa del máximo ni es negativo; mixta con menos IGV vale", () => {
    expect(revisarComprobante(118, { documentType: "factura", afectoIgv: true, igvAmount: 30 })).toMatchObject({ ok: false, campo: "igvAmount" });
    expect(revisarComprobante(118, { documentType: "factura", afectoIgv: true, igvAmount: -1 })).toMatchObject({ ok: false, campo: "igvAmount" });
    const mixta = revisarComprobante(118, { documentType: "factura", documentNumber: "F1", supplierRuc: RUC_OK, afectoIgv: true, igvAmount: 9 });
    expect(mixta.ok && mixta.datos.igvAmount).toBe(9);
  });

  it("RUC inválido se rechaza aunque no haya comprobante", () => {
    expect(revisarComprobante(10, { supplierRuc: "123" })).toMatchObject({ ok: false, campo: "supplierRuc" });
  });
});
