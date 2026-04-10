/**
 * Eval: UBL 2.1 XML structure validation.
 * Uses the real generateXML from lib/sunat.ts.
 * Business rule: XML must follow UBL 2.1 schema with required elements.
 */
import { describe, it, expect } from "vitest";
import { generateXML, type SunatDocument } from "@/lib/sunat";

const sampleBoleta: SunatDocument = {
  tipo: "boleta",
  serie: "B001",
  numero: 1,
  fecha: "2026-04-09",
  cliente: { dni: "70123456", nombre: "Juan Perez" },
  items: [
    { descripcion: "Arroz 5kg", cantidad: 2, precioUnit: 22.50, igv: 6.86 },
    { descripcion: "Aceite 1L", cantidad: 1, precioUnit: 11.90, igv: 1.82 },
  ],
  totalGravado: 48.22,
  totalIgv: 8.68,
  totalVenta: 56.9,
  moneda: "PEN",
};

describe("SUNAT > UBL 2.1 XML Structure", () => {
  const xml = generateXML(sampleBoleta);

  it("should contain XML declaration", () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it("should contain UBL 2.1 namespace", () => {
    expect(xml).toContain("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2");
  });

  it("should contain UBLVersionID 2.1", () => {
    expect(xml).toContain("<cbc:UBLVersionID>2.1</cbc:UBLVersionID>");
  });

  it("should contain document ID with serie-correlativo format", () => {
    expect(xml).toContain("<cbc:ID>B001-00000001</cbc:ID>");
  });

  it("should contain issue date", () => {
    expect(xml).toContain("<cbc:IssueDate>2026-04-09</cbc:IssueDate>");
  });

  it("should contain InvoiceTypeCode 03 for boleta", () => {
    expect(xml).toContain("03</cbc:InvoiceTypeCode>");
  });

  it("should contain customer document number", () => {
    expect(xml).toContain("70123456");
  });

  it("should contain InvoiceLine elements for each item", () => {
    expect(xml).toContain("Arroz 5kg");
    expect(xml).toContain("Aceite 1L");
  });

  it("should contain currency code PEN", () => {
    expect(xml).toContain('currencyID="PEN"');
  });

  it("should contain IGV tax scheme", () => {
    expect(xml).toContain("<cbc:Name>IGV</cbc:Name>");
    expect(xml).toContain("<cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>");
  });
});
