import { describe, it, expect } from "vitest";
import {
  leerComprobante, leerCdr, revisarComprobante, rucValido, tipoDeRuc, esArchivoSunat,
} from "@/lib/documents/sunat-comprobante";

/** Factura electrónica mínima, con la estructura UBL que emite SUNAT. */
function facturaXml(over: Partial<{ ruc: string; rucCliente: string; serie: string; gravado: string; igv: string; total: string }> = {}) {
  const { ruc = "20601030013", rucCliente = "20605145648", serie = "F001", gravado = "1000.00", igv = "180.00", total = "1180.00" } = over;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>${serie}-00000123</cbc:ID>
  <cbc:IssueDate>2026-07-15</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID>${ruc}</cbc:ID></cac:PartyIdentification>
      <cac:PartyLegalEntity><cbc:RegistrationName>BODEGA SAN MARTIN SAC</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID>${rucCliente}</cbc:ID></cac:PartyIdentification>
      <cac:PartyLegalEntity><cbc:RegistrationName>CLIENTE SAC</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="PEN">${igv}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">${gravado}</cbc:LineExtensionAmount>
    <cbc:PayableAmount currencyID="PEN">${total}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
}

describe("RUC", () => {
  it("acepta RUCs reales (dígito verificador correcto)", () => {
    expect(rucValido("20601030013")).toBe(true);
    expect(rucValido("20605145648")).toBe(true);
  });

  it("rechaza un RUC con un dígito cambiado", () => {
    expect(rucValido("20601030014")).toBe(false);
  });

  it("rechaza lo que no tiene 11 dígitos", () => {
    expect(rucValido("2060103001")).toBe(false);
    expect(rucValido("abcdefghijk")).toBe(false);
    expect(rucValido(null)).toBe(false);
  });

  it("distingue persona de empresa", () => {
    expect(tipoDeRuc("10123456789")).toBe("persona natural");
    expect(tipoDeRuc("20123456789")).toBe("empresa");
  });
});

describe("leer el comprobante", () => {
  it("saca los datos de una factura", () => {
    const c = leerComprobante(facturaXml())!;
    expect(c.tipo).toBe("01");
    expect(c.tipoNombre).toBe("Factura");
    expect(c.serie).toBe("F001");
    expect(c.correlativo).toBe("00000123");
    expect(c.rucEmisor).toBe("20601030013");
    expect(c.nombreEmisor).toBe("BODEGA SAN MARTIN SAC");
    expect(c.docReceptor).toBe("20605145648");
    expect(c.total).toBe(1180);
    expect(c.igv).toBe(180);
    expect(c.moneda).toBe("PEN");
  });

  it("reconoce una nota de crédito por el tipo de documento", () => {
    const xml = facturaXml().replace("<Invoice", "<CreditNote").replace("</Invoice>", "</CreditNote>")
      .replace("<cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>", "");
    const c = leerComprobante(xml)!;
    expect(c.tipo).toBe("07");
    expect(c.tipoNombre).toBe("Nota de crédito");
  });

  it("devuelve null si el XML no es un comprobante", () => {
    expect(leerComprobante("<html><body>hola</body></html>")).toBeNull();
  });
});

describe("revisar el comprobante", () => {
  it("no encuentra nada que corregir en una factura correcta", () => {
    const h = revisarComprobante(leerComprobante(facturaXml())!);
    expect(h).toHaveLength(1);
    expect(h[0].severidad).toBe("ok");
  });

  it("marca el RUC del emisor mal tipeado", () => {
    const h = revisarComprobante(leerComprobante(facturaXml({ ruc: "20601030014" }))!);
    expect(h.some((x) => x.severidad === "error" && /RUC del emisor/.test(x.mensaje))).toBe(true);
  });

  it("marca cuando los importes no cierran", () => {
    const h = revisarComprobante(leerComprobante(facturaXml({ total: "1500.00" }))!);
    expect(h.some((x) => x.severidad === "error" && /no cierran/.test(x.mensaje))).toBe(true);
  });

  it("avisa si el IGV no es el 18%", () => {
    // gravado 1000 + IGV 100 = 1100: cierra, pero la tasa es 10%.
    const h = revisarComprobante(leerComprobante(facturaXml({ igv: "100.00", total: "1100.00" }))!);
    expect(h.some((x) => x.severidad === "aviso" && /18%/.test(x.mensaje))).toBe(true);
  });

  it("avisa si la serie de una factura no empieza con F", () => {
    const h = revisarComprobante(leerComprobante(facturaXml({ serie: "B001" }))!);
    expect(h.some((x) => /serie/.test(x.mensaje))).toBe(true);
  });

  it("exige RUC de cliente en una factura", () => {
    const xml = facturaXml().replace(/<cac:AccountingCustomerParty>[\s\S]*?<\/cac:AccountingCustomerParty>/, "");
    const h = revisarComprobante(leerComprobante(xml)!);
    expect(h.some((x) => x.severidad === "error" && /cliente/.test(x.mensaje))).toBe(true);
  });
});

describe("CDR", () => {
  const cdr = (codigo: string, desc: string) => `<?xml version="1.0"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>20601030013-01-F001-00000123</cbc:ID>
  <cac:DocumentResponse><cac:Response>
    <cbc:ResponseCode>${codigo}</cbc:ResponseCode>
    <cbc:Description>${desc}</cbc:Description>
  </cac:Response></cac:DocumentResponse>
</ApplicationResponse>`;

  it("entiende un CDR aceptado", () => {
    const r = leerCdr(cdr("0", "La Factura numero F001-00000123, ha sido aceptada"))!;
    expect(r.codigo).toBe(0);
    expect(r.aceptado).toBe(true);
    expect(r.rechazado).toBe(false);
    expect(r.descripcion).toContain("aceptada");
  });

  it("entiende un CDR rechazado", () => {
    const r = leerCdr(cdr("2335", "El documento afectado no existe"))!;
    expect(r.rechazado).toBe(true);
    expect(r.aceptado).toBe(false);
  });

  it("entiende un CDR aceptado con observaciones", () => {
    const r = leerCdr(cdr("4000", "El comprobante presenta observaciones"))!;
    expect(r.observado).toBe(true);
    expect(r.rechazado).toBe(false);
  });

  it("devuelve null si no es un CDR", () => {
    expect(leerCdr(facturaXml())).toBeNull();
  });
});

describe("detección del archivo", () => {
  it("reconoce los XML y los ZIP de CDR", () => {
    expect(esArchivoSunat("F001-123.xml")).toBe(true);
    expect(esArchivoSunat("R-20601030013-01-F001-123.zip")).toBe(true);
    expect(esArchivoSunat("contrato.pdf")).toBe(false);
  });
});
