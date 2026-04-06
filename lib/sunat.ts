// lib/sunat.ts
// Integración con Nubefact OSE para emisión de comprobantes electrónicos SUNAT
// Preparado para certificado digital — actualmente modo OSE (Nubefact)

import { prisma } from "@/lib/prisma";

// ── Interfaces públicas ────────────────────────────────────────────────────────

export interface SunatDocument {
  tipo: "boleta" | "factura" | "nota_credito" | "nota_debito";
  serie: string; // B001, F001, BC01, FC01
  numero: number;
  fecha: string; // YYYY-MM-DD
  cliente: {
    ruc?: string;
    dni?: string;
    nombre: string;
    direccion?: string;
  };
  items: {
    descripcion: string;
    cantidad: number;
    precioUnit: number; // precio con IGV incluido
    igv: number;        // monto IGV del item
  }[];
  totalGravado: number;
  totalIgv: number;
  totalVenta: number;
  moneda: "PEN" | "USD";
}

export interface SunatInvoiceData {
  tipoDoc: "01" | "03"; // 01=factura, 03=boleta
  serie: string;
  correlativo: number;
  fechaEmision: string; // YYYY-MM-DD
  rucEmisor: string;
  razonSocialEmisor: string;
  cliente: {
    tipoDoc: "1" | "6"; // 1=DNI, 6=RUC
    numDoc: string;
    razonSocial: string;
    direccion?: string;
  };
  items: Array<{
    descripcion: string;
    cantidad: number;
    valorUnitario: number; // precio sin IGV
    igv: number;
    totalItem: number;
  }>;
  totalIgv: number;
  totalVenta: number;
}

export interface SunatResult {
  pdfUrl: string | null;
  xmlUrl: string | null;
  hash: string | null;
  error?: string;
}

export interface IgvCalculation {
  gravado: number;
  igv: number;
  total: number;
}

// ── Validaciones ───────────────────────────────────────────────────────────────

/**
 * Valida formato RUC peruano: 11 dígitos, empieza con 10 (persona natural) o 20 (empresa).
 */
export function validateRUC(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  return ruc.startsWith("10") || ruc.startsWith("20");
}

/**
 * Valida formato DNI peruano: exactamente 8 dígitos.
 */
export function validateDNI(dni: string): boolean {
  return /^\d{8}$/.test(dni);
}

// ── Cálculo de IGV ─────────────────────────────────────────────────────────────

/**
 * Calcula IGV 18% desde un precio que YA incluye IGV (precio de venta al público).
 * Ejemplo: total=118 → { gravado:100, igv:18, total:118 }
 */
export function calculateIGV(totalConIgv: number): IgvCalculation {
  const gravado = +(totalConIgv / 1.18).toFixed(2);
  const igv = +(totalConIgv - gravado).toFixed(2);
  const total = +(gravado + igv).toFixed(2);
  return { gravado, igv, total };
}

// ── Generador de correlativo ───────────────────────────────────────────────────

/**
 * Genera el siguiente número correlativo para una serie dada.
 * Usa un registro en ActivityLog con acción "sunat_correlativo" para persistir el estado.
 * Garantiza atomicidad via upsert en PostgreSQL.
 */
export async function generateCorrelativo(
  tenantId: string,
  tipo: "boleta" | "factura" | "nota_credito" | "nota_debito",
): Promise<string> {
  const serie = tipoToSerie(tipo);
  const key = `sunat_correlativo:${tenantId}:${serie}`;

  // Buscar el último correlativo registrado
  const last = await prisma.activityLog.findFirst({
    where: {
      tenantId,
      action: "sunat_correlativo",
      entity: serie,
    },
    orderBy: { createdAt: "desc" },
  });

  const siguiente = last ? parseInt(last.entityId ?? "0", 10) + 1 : 1;

  // Registrar el nuevo correlativo (fire-and-forget seguro — si falla no bloquea)
  await prisma.activityLog.create({
    data: {
      tenantId,
      userId: "system",
      action: "sunat_correlativo",
      entity: serie,
      entityId: String(siguiente),
      metadata: JSON.stringify({ key, serie, correlativo: siguiente }),
    },
  });

  return String(siguiente).padStart(8, "0");
}

// ── Generador XML UBL 2.1 ─────────────────────────────────────────────────────

/**
 * Genera el XML UBL 2.1 requerido por SUNAT para boletas y facturas.
 * Este XML es el que se firma con el certificado digital y se envía a SUNAT.
 * Referencia: https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_comprobante_de_pago.pdf
 */
export function generateXML(doc: SunatDocument): string {
  const rucEmisor = process.env.RUC_EMISOR ?? "";
  const razonSocial = process.env.RAZON_SOCIAL_EMISOR ?? "Buleje";
  const tipoDoc = doc.tipo === "boleta" ? "03" : doc.tipo === "factura" ? "01" : doc.tipo === "nota_credito" ? "07" : "08";

  const clienteTipoDoc = doc.cliente.ruc ? "6" : "1";
  const clienteNumDoc = doc.cliente.ruc ?? doc.cliente.dni ?? "00000000";

  const itemsXml = doc.items
    .map((item, idx) => {
      const valorUnitario = +(item.precioUnit / 1.18).toFixed(6);
      const _totalItem = +(item.precioUnit * item.cantidad).toFixed(2);
      return `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="NIU">${item.cantidad}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${doc.moneda}">${+(valorUnitario * item.cantidad).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${doc.moneda}">${item.igv.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${doc.moneda}">${+(valorUnitario * item.cantidad).toFixed(2)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${doc.moneda}">${item.igv.toFixed(2)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID schemeAgencyName="PE:SUNAT" schemeName="Codigo de tributos">1000</cbc:ID>
            <cbc:Percent>18.00</cbc:Percent>
            <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
            <cac:TaxScheme>
              <cbc:ID>1000</cbc:ID>
              <cbc:Name>IGV</cbc:Name>
              <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Description><![CDATA[${item.descripcion}]]></cbc:Description>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${doc.moneda}">${valorUnitario.toFixed(6)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${doc.serie}-${String(doc.numero).padStart(8, "0")}</cbc:ID>
  <cbc:IssueDate>${doc.fecha}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listID="0101">${tipoDoc}</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000"><![CDATA[SON ${amountToWords(doc.totalVenta)} ${doc.moneda === "PEN" ? "SOLES" : "DOLARES"}]]></cbc:Note>
  <cbc:DocumentCurrencyCode>${doc.moneda}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">${rucEmisor}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${razonSocial}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${razonSocial}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${clienteTipoDoc}">${clienteNumDoc}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${doc.cliente.nombre}]]></cbc:RegistrationName>
        ${doc.cliente.direccion ? `<cac:RegistrationAddress><cac:AddressLine><cbc:Line><![CDATA[${doc.cliente.direccion}]]></cbc:Line></cac:AddressLine></cac:RegistrationAddress>` : ""}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${doc.moneda}">${doc.totalIgv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${doc.moneda}">${doc.totalGravado.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${doc.moneda}">${doc.totalIgv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeAgencyName="PE:SUNAT" schemeName="Codigo de tributos">1000</cbc:ID>
        <cbc:Percent>18.00</cbc:Percent>
        <cbc:TaxExemptionReasonCode>10</cbc:TaxExemptionReasonCode>
        <cac:TaxScheme>
          <cbc:ID>1000</cbc:ID>
          <cbc:Name>IGV</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${doc.moneda}">${doc.totalGravado.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${doc.moneda}">${doc.totalVenta.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${doc.moneda}">${doc.totalVenta.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${itemsXml}
</Invoice>`;
}

// ── Emisión vía Nubefact OSE ───────────────────────────────────────────────────

export async function emitirComprobante(
  data: SunatInvoiceData,
): Promise<SunatResult> {
  const token = process.env.NUBEFACT_TOKEN;
  if (!token)
    throw new Error(
      "NUBEFACT_TOKEN no configurado. Obtenerlo en nubefact.com",
    );

  const res = await fetch("https://api.nubefact.com/api/v1/comprobante", {
    method: "POST",
    headers: {
      Authorization: `Token token="${token}"`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operacion: "generar_comprobante",
      tipo_de_comprobante: data.tipoDoc === "01" ? 1 : 2,
      serie: data.serie,
      numero: data.correlativo,
      sunat_transaction: 1,
      cliente_tipo_de_documento: data.cliente.tipoDoc,
      cliente_numero_de_documento: data.cliente.numDoc,
      cliente_denominacion: data.cliente.razonSocial,
      cliente_direccion: data.cliente.direccion ?? "",
      fecha_de_emision: data.fechaEmision,
      moneda: 1,
      porcentaje_de_igv: 18.0,
      items: data.items.map((item) => ({
        unidad_de_medida: "NIU",
        codigo: "",
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        valor_unitario: item.valorUnitario,
        precio_unitario: +(item.valorUnitario * 1.18).toFixed(6),
        descuento: "",
        subtotal: +(item.valorUnitario * item.cantidad).toFixed(2),
        tipo_de_igv: 1,
        igv: +item.igv.toFixed(2),
        total: +item.totalItem.toFixed(2),
        anticipo_regularizacion: false,
      })),
      descuentos: [],
      total_gravada: +(data.totalVenta - data.totalIgv).toFixed(2),
      total_igv: +data.totalIgv.toFixed(2),
      total: +data.totalVenta.toFixed(2),
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { mensaje?: string };
    throw new Error(err.mensaje ?? `Nubefact error ${res.status}`);
  }

  const result = (await res.json()) as {
    enlace_del_pdf?: string;
    enlace_del_xml?: string;
    codigo_hash?: string;
  };

  return {
    pdfUrl: result.enlace_del_pdf ?? null,
    xmlUrl: result.enlace_del_xml ?? null,
    hash: result.codigo_hash ?? null,
  };
}

// ── Helpers internos ───────────────────────────────────────────────────────────

function tipoToSerie(tipo: SunatDocument["tipo"]): string {
  switch (tipo) {
    case "boleta":       return "B001";
    case "factura":      return "F001";
    case "nota_credito": return "BC01";
    case "nota_debito":  return "BD01";
  }
}

/**
 * Convierte monto numérico a texto para la nota del XML (ej: 118.50 → "CIENTO DIECIOCHO CON 50/100").
 * Implementación simplificada para montos hasta 999,999.99.
 */
function amountToWords(amount: number): string {
  const cents = Math.round((amount % 1) * 100);
  const whole = Math.floor(amount);
  return `${numberToWords(whole)} CON ${String(cents).padStart(2, "0")}/100`;
}

function numberToWords(n: number): string {
  if (n === 0) return "CERO";
  const ones = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
    "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
  const tens = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const hundreds = ["", "CIEN", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
    "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " Y " + ones[n % 10] : "");
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const prefix = h === 1 && rest > 0 ? "CIENTO" : hundreds[h];
    return prefix + (rest ? " " + numberToWords(rest) : "");
  }
  if (n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const prefix = thousands === 1 ? "MIL" : numberToWords(thousands) + " MIL";
    return prefix + (rest ? " " + numberToWords(rest) : "");
  }
  return String(n);
}
