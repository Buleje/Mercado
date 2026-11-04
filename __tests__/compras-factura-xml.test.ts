/**
 * Factura electrónica del proveedor (XML UBL 2.1) → vista previa de compra.
 * XML inventados (RUC 20123456789, nada real).
 */
import { describe, expect, it } from "vitest";
import { leerFacturaXml, TOPE_BYTES_XML } from "@/lib/compras/factura-xml";
import { indexarCatalogo, palabrasDe, sugerirProducto, type ProductoParaCruce } from "@/lib/compras/factura-xml-cruce";

const NS = `xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`;

function linea(n: number, cant: string, unidad: string, desc: string, precio: string, valor: string, igv: string, extra = ""): string {
  return `<cac:InvoiceLine><cbc:ID>${n}</cbc:ID><cbc:InvoicedQuantity unitCode="${unidad}">${cant}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="PEN">${valor}</cbc:LineExtensionAmount>
    <cac:PricingReference><cac:AlternativeConditionPrice><cbc:PriceAmount currencyID="PEN">${(Number(precio) * 1.18).toFixed(2)}</cbc:PriceAmount><cbc:PriceTypeCode>01</cbc:PriceTypeCode></cac:AlternativeConditionPrice></cac:PricingReference>
    <cac:TaxTotal><cbc:TaxAmount currencyID="PEN">${igv}</cbc:TaxAmount></cac:TaxTotal>
    <cac:Item><cbc:Description>${desc}</cbc:Description>${extra}</cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="PEN">${precio}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
}

const FACTURA = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice ${NS}>
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><ds:Signature Id="SIGN"><ds:SignedInfo><ds:Reference URI=""><ds:DigestValue>abc=</ds:DigestValue></ds:Reference></ds:SignedInfo></ds:Signature></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>F001-00000123</cbc:ID>
  <cbc:IssueDate>2026-10-28</cbc:IssueDate>
  <cbc:DueDate>2026-11-27</cbc:DueDate>
  <cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  <cac:Signature><cbc:ID>IDSignKG</cbc:ID></cac:Signature>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="6">20123456789</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>DISTRIBUIDORA EJEMPLO</cbc:Name></cac:PartyName>
    <cac:PartyLegalEntity><cbc:RegistrationName>DISTRIBUIDORA EJEMPLO S.A.C.</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="6">20601234567</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>BODEGA DE PRUEBA E.I.R.L.</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="PEN">88.69</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="PEN">492.70</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">88.69</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="PEN">492.70</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="PEN">581.39</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="PEN">581.39</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${linea(1, "10", "NIU", "GALLETAS SODA 6 X 34 GR", "8.47", "84.70", "15.25", "<cac:SellersItemIdentification><cbc:ID>GAL-034</cbc:ID></cac:SellersItemIdentification>")}
  ${linea(2, "5", "BX", "ACEITE VEGETAL 1 L CAJA X 12 &amp; REGALO", "80.00", "400.00", "72.00", "<cac:SellersItemIdentification><cbc:ID>ACE-001</cbc:ID></cac:SellersItemIdentification><cac:StandardItemIdentification><cbc:ID>7750000000017</cbc:ID></cac:StandardItemIdentification>")}
  ${linea(3, "2.5", "KGM", "AZÚCAR RUBIA", "3.20", "8.00", "1.44")}
</Invoice>`;

/** Mismo papel con prefijos raros (a:, b:, sin prefijo), comentario, CDATA y una bonificación. */
const PREFIJOS_RAROS = `<?xml version="1.0" encoding="UTF-8"?>
<!-- generado por un facturador cualquiera -->
<ns0:Invoice xmlns:ns0="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:a="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:b="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <b:ID>B002-45</b:ID><b:IssueDate>2026-10-30</b:IssueDate>
  <b:InvoiceTypeCode>03</b:InvoiceTypeCode>
  <a:AccountingSupplierParty><a:Party><a:PartyIdentification><ID xmlns="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" schemeID='6'>20123456789</ID></a:PartyIdentification>
    <a:PartyLegalEntity><b:RegistrationName><![CDATA[COMERCIAL EJEMPLO & HIJOS S.R.L.]]></b:RegistrationName></a:PartyLegalEntity></a:Party></a:AccountingSupplierParty>
  <a:AccountingCustomerParty><a:Party><a:PartyIdentification><b:ID schemeID="1">45678912</b:ID></a:PartyIdentification></a:Party></a:AccountingCustomerParty>
  <a:TaxTotal><b:TaxAmount currencyID="PEN">1.80</b:TaxAmount></a:TaxTotal>
  <a:LegalMonetaryTotal><b:PayableAmount currencyID="PEN">11.80</b:PayableAmount></a:LegalMonetaryTotal>
  <a:InvoiceLine><b:InvoicedQuantity unitCode="NIU">2</b:InvoicedQuantity><b:LineExtensionAmount>10.00</b:LineExtensionAmount>
    <a:TaxTotal><b:TaxAmount>1.80</b:TaxAmount></a:TaxTotal>
    <a:Item><b:Description>Gaseosa cola 500ml</b:Description></a:Item><a:Price><b:PriceAmount>5.00</b:PriceAmount></a:Price></a:InvoiceLine>
  <a:InvoiceLine><b:InvoicedQuantity unitCode="NIU">1</b:InvoicedQuantity><b:LineExtensionAmount>5.00</b:LineExtensionAmount>
    <a:PricingReference><a:AlternativeConditionPrice><b:PriceAmount>5.90</b:PriceAmount><b:PriceTypeCode>02</b:PriceTypeCode></a:AlternativeConditionPrice></a:PricingReference>
    <a:TaxTotal><b:TaxAmount>0.00</b:TaxAmount></a:TaxTotal>
    <a:Item><b:Description>Gaseosa cola 500ml (bonificación)</b:Description></a:Item><a:Price><b:PriceAmount>0.00</b:PriceAmount></a:Price></a:InvoiceLine>
</ns0:Invoice>`;

function leerOk(xml: string) {
  const r = leerFacturaXml(xml);
  if (!r.ok) throw new Error(`esperaba ok, vino: ${r.error}`);
  return r.factura;
}

describe("leerFacturaXml", () => {
  it("factura con 3 líneas que cuadra", () => {
    const f = leerOk(FACTURA);
    expect(f).toMatchObject({
      tipo: "factura", codigoTipo: "01", serie: "F001", numero: "00000123", serieNumero: "F001-00000123",
      fecha: "2026-10-28", fechaVencimiento: "2026-11-27", moneda: "PEN",
      emisor: { ruc: "20123456789", razonSocial: "DISTRIBUIDORA EJEMPLO S.A.C.", nombreComercial: "DISTRIBUIDORA EJEMPLO" },
      cliente: { tipoDocumento: "RUC", documento: "20601234567", nombre: "BODEGA DE PRUEBA E.I.R.L." },
    });
    expect(f.lineas).toHaveLength(3);
    expect(f.lineas[1]).toMatchObject({
      numero: 2, descripcion: "ACEITE VEGETAL 1 L CAJA X 12 & REGALO", codigoVendedor: "ACE-001", codigoBarras: "7750000000017",
      cantidad: 5, unidadSunat: "BX", unidad: "caja", precioUnitario: 80, precioUnitarioConIgv: 94.4, valorVenta: 400, igv: 72, gratuita: false, total: 472,
    });
    expect(f.lineas[2]).toMatchObject({ cantidad: 2.5, unidad: "kg", descripcion: "AZÚCAR RUBIA", codigoVendedor: null });
    expect(f.totales).toMatchObject({ valorVenta: 492.7, valorVentaDeclarado: 492.7, igv: 88.69, otrosImpuestos: 0, total: 581.39 });
    expect(f.cuadre).toEqual({ cuadra: true, calculado: 581.39, declarado: 581.39, diferencia: 0 });
    // El RUC inventado no pasa el dígito verificador: avisa, no frena.
    expect(f.avisos).toEqual([expect.stringContaining("dígito verificador")]);
  });

  it("prefijos raros, sin prefijo, CDATA y bonificación: lee igual y la bonificación no suma", () => {
    const f = leerOk(PREFIJOS_RAROS);
    expect(f).toMatchObject({
      tipo: "boleta", serieNumero: "B002-45", moneda: "PEN",
      emisor: { ruc: "20123456789", razonSocial: "COMERCIAL EJEMPLO & HIJOS S.R.L." },
      cliente: { tipoDocumento: "DNI", documento: "45678912", nombre: null },
    });
    expect(f.lineas.map((l) => [l.gratuita, l.total])).toEqual([[false, 11.8], [true, 0]]);
    expect(f.totales.valorVenta).toBe(10);
    expect(f.cuadre.cuadra).toBe(true);
    expect(f.avisos.some((a) => a.includes("bonificación"))).toBe(true);
  });

  it("no cuadra por más de S/ 0.05 → aviso, no error; 3 céntimos sí cuadran", () => {
    const mal = leerOk(FACTURA.replace(/581\.39<\/cbc:PayableAmount>/, "582.39</cbc:PayableAmount>"));
    expect(mal.cuadre).toMatchObject({ cuadra: false, diferencia: 1 });
    expect(mal.avisos.some((a) => a.startsWith("No cuadra"))).toBe(true);
    const casi = leerOk(FACTURA.replace(/581\.39<\/cbc:PayableAmount>/, "581.42</cbc:PayableAmount>"));
    expect(casi.cuadre.cuadra).toBe(true);
  });

  it("nota de crédito → rechazo claro", () => {
    const nc = FACTURA.replace("<Invoice ", "<CreditNote ").replace("</Invoice>", "</CreditNote>");
    expect(leerFacturaXml(nc)).toEqual({ ok: false, error: expect.stringContaining("solo se leen facturas y boletas") });
  });

  it("DOCTYPE / entidad externa (XXE) → rechazado sin leer", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><Invoice><cbc:ID>&xxe;</cbc:ID></Invoice>`;
    expect(leerFacturaXml(xxe)).toEqual({ ok: false, error: expect.stringContaining("DOCTYPE") });
  });

  it("vacío, roto, demasiado grande o la constancia de SUNAT → error en español", () => {
    expect(leerFacturaXml("  ")).toEqual({ ok: false, error: "El archivo está vacío." });
    expect(leerFacturaXml(FACTURA.slice(0, 2000)).ok).toBe(false);
    expect(leerFacturaXml(`<a>${"x".repeat(TOPE_BYTES_XML)}</a>`)).toEqual({ ok: false, error: expect.stringContaining("2 MB") });
    expect(leerFacturaXml(`<ar:ApplicationResponse xmlns:ar="x"></ar:ApplicationResponse>`)).toEqual({ ok: false, error: expect.stringContaining("CDR") });
    expect(leerFacturaXml(FACTURA.replace("<cbc:Name>DISTRIBUIDORA", "<cbc:Nombre>DISTRIBUIDORA")).ok).toBe(false);
  });
});

describe("sugerirProducto", () => {
  const catalogo: ProductoParaCruce[] = [
    { id: 1, name: "Aceite vegetal 1L", sku: null, barcode: "7750000000017", unit: "unidad" },
    { id: 2, name: "Galleta soda 6x34gr", sku: "GAL-034", barcode: null, unit: "paquete" },
    { id: 3, name: "Galletas de soda", sku: null, barcode: null, unit: "paquete" },
    { id: 4, name: "Arroz extra", sku: null, barcode: null, unit: "kg" },
  ];
  const indice = indexarCatalogo(catalogo);

  it("código de barras o código del proveedor exacto → alta", () => {
    const f = leerOk(FACTURA);
    const [l1, l2, l3] = f.lineas;
    if (!l1 || !l2 || !l3) throw new Error("faltan líneas");
    expect(sugerirProducto(l2, catalogo, indice)).toMatchObject({ numero: 2, confianza: "alta", motivo: "codigo-barras", producto: { id: 1 } });
    expect(sugerirProducto(l1, catalogo, indice)).toMatchObject({ confianza: "alta", motivo: "codigo-vendedor", producto: { id: 2 } });
    expect(sugerirProducto(l3, [], indice)).toMatchObject({ confianza: "ninguna", producto: null });
  });

  it("por nombre parecido → media, con alternativas", () => {
    const s = sugerirProducto({ numero: 1, descripcion: "GALLETA SODA PAQUETE", codigoVendedor: null, codigoBarras: null }, [], indice);
    expect(s.confianza).toBe("media");
    expect(s.producto?.id).toBe(3);
    expect(s.alternativas.map((a) => a.id)).toContain(2);
    expect(palabrasDe("Gaseosa 1,5 L")).toEqual(["gaseosa", "1p5l"]);
  });
});
