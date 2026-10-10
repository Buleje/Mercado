/**
 * lib/sunat/invoice-builder.ts
 *
 * Transforma datos del sistema (Order, Settings, Customer) al formato JSON
 * que espera la API de Nubefact.
 *
 * Reglas de negocio SUNAT:
 *  - Boleta (B001): cliente puede ser DNI o sin documento (00000000)
 *  - Factura (F001): cliente obligatorio con RUC
 *  - Nota de crédito: referencia al comprobante original
 *  - IGV por producto (Product.taxType): gravado 18 % (base = precio / 1.18),
 *    exonerado (Amazonía, Ley 27037) o inafecto sin IGV. Los totales salen de
 *    sumar las líneas (lib/sunat/lineas-comprobante.ts).
 *  - Si la orden se cobró por menos que sus productos, ese descuento se
 *    prorratea en las líneas; el total del comprobante = lo cobrado.
 */

import type {
  NubefactComprobantePayload,
  NubefactBajaPayload,
} from "./nubefact-client";
import {
  armarLineasComprobante,
  type LineasComprobante,
} from "./lineas-comprobante";

// ── Tipos de entrada ──────────────────────────────────────────────────────────

export interface BuilderOrderItem {
  name: string;
  quantity: number;
  price: number;   // precio con IGV incluido (precio de venta al público)
  unit: string;
  productCode?: string;
  /** Product.taxType: gravado | exonerado | inafecto. Vacío = gravado. */
  taxType?: string | null;
}

export interface BuilderOrder {
  id: string;
  customerName: string;
  customerPhone?: string | null;
  total: number;
  items: BuilderOrderItem[];
}

export interface BuilderTenant {
  ruc: string;
  razonSocial: string;
  direccionFiscal?: string | null;
}

export interface BuilderSettings {
  boletaSeries: string;  // "B001"
  facturaSeries: string; // "F001"
  nextBoletaNum: number;
  nextFacturaNum: number;
}

export interface BuilderCustomer {
  ruc: string;
  razonSocial: string;
  direccion?: string;
  email?: string;
}

export interface BuiltCreditNoteInput {
  originalSeries: string;
  originalNumber: number;
  originalTipoComprobante: 1 | 2;
  customerName: string;
  customerDocTipo: 1 | 6;
  customerDoc: string;
  /** Total de la nota. El IGV y la base se recalculan desde las líneas. */
  total: number;
  /** @deprecated Se recalcula desde `items` (cada uno con su afectación). */
  igv: number;
  /** @deprecated Se recalcula desde `items` (cada uno con su afectación). */
  gravado: number;
  items: BuilderOrderItem[];
  series: string;        // "BC01" | "FC01"
  nextNumber: number;
  motivo: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Líneas con su afectación + totales que cuadran con lo cobrado. */
export function lineasDeOrden(order: Pick<BuilderOrder, "items" | "total">): LineasComprobante {
  return armarLineasComprobante(order.items, { totalCobrado: order.total });
}

/** Los campos de totales del payload, todos salidos de las líneas. */
function totalesDelPayload({ totales }: LineasComprobante) {
  return {
    descuento_global: 0,
    total_descuento: totales.descuento,
    total_anticipo: 0,
    total_gravada: totales.gravada,
    total_inafecta: totales.inafecta,
    total_exonerada: totales.exonerada,
    total_igv: totales.igv,
    total_gratuita: 0,
    total_otros_cargos: totales.otrosCargos,
    total: totales.total,
  };
}

// ── Constructores públicos ────────────────────────────────────────────────────

/**
 * Construye el payload de boleta electrónica para consumidores finales.
 * Si el cliente tiene DNI, lo usa; si no, envía "00000000" (consumidor final anónimo).
 */
export function buildBoleta(
  order: BuilderOrder,
  tenant: BuilderTenant,
  settings: BuilderSettings,
  customerDni?: string,
  customerEmail?: string,
): NubefactComprobantePayload {
  const lineas = lineasDeOrden(order);
  const hoy = todayISO();

  const tieneDocumento = customerDni && /^\d{8}$/.test(customerDni);

  return {
    operacion: "generar_comprobante",
    tipo_de_comprobante: 2,
    serie: settings.boletaSeries,
    numero: settings.nextBoletaNum,
    sunat_transaction: 1,
    cliente_tipo_de_documento: 1,   // 1 = DNI (o sin documento)
    cliente_numero_de_documento: tieneDocumento ? customerDni! : "00000000",
    cliente_denominacion: order.customerName || "CONSUMIDOR FINAL",
    cliente_direccion: "",
    cliente_email: customerEmail ?? "",
    cliente_email_1: "",
    cliente_email_2: "",
    fecha_de_emision: hoy,
    fecha_de_vencimiento: hoy,
    moneda: 1,
    porcentaje_de_igv: 18,
    ...totalesDelPayload(lineas),
    items: lineas.items,
    observaciones: `Orden #${order.id}`,
    formato_de_pdf: "A4",
  };
}

/**
 * Construye el payload de factura electrónica para clientes con RUC.
 */
export function buildFactura(
  order: BuilderOrder,
  tenant: BuilderTenant,
  settings: BuilderSettings,
  customer: BuilderCustomer,
): NubefactComprobantePayload {
  if (!/^\d{11}$/.test(customer.ruc)) {
    throw new Error(
      `RUC inválido para factura: "${customer.ruc}". Debe tener 11 dígitos.`
    );
  }

  const lineas = lineasDeOrden(order);
  const hoy = todayISO();

  return {
    operacion: "generar_comprobante",
    tipo_de_comprobante: 1,
    serie: settings.facturaSeries,
    numero: settings.nextFacturaNum,
    sunat_transaction: 1,
    cliente_tipo_de_documento: 6,   // 6 = RUC
    cliente_numero_de_documento: customer.ruc,
    cliente_denominacion: customer.razonSocial,
    cliente_direccion: customer.direccion ?? "",
    cliente_email: customer.email ?? "",
    cliente_email_1: "",
    cliente_email_2: "",
    fecha_de_emision: hoy,
    fecha_de_vencimiento: hoy,
    moneda: 1,
    porcentaje_de_igv: 18,
    ...totalesDelPayload(lineas),
    items: lineas.items,
    observaciones: `Orden #${order.id}`,
    formato_de_pdf: "A4",
  };
}

/**
 * Construye el payload de nota de crédito electrónica.
 * Serie: BC01 (para boletas) / FC01 (para facturas).
 */
export function buildNotaCredito(
  input: BuiltCreditNoteInput,
): NubefactComprobantePayload {
  const lineas = armarLineasComprobante(input.items, { totalCobrado: input.total });
  return {
    operacion: "generar_comprobante",
    tipo_de_comprobante: 4,           // 4 = nota de crédito
    serie: input.series,
    numero: input.nextNumber,
    sunat_transaction: 1,
    cliente_tipo_de_documento: input.customerDocTipo,
    cliente_numero_de_documento: input.customerDoc,
    cliente_denominacion: input.customerName,
    cliente_direccion: "",
    cliente_email: "",
    cliente_email_1: "",
    cliente_email_2: "",
    fecha_de_emision: todayISO(),
    fecha_de_vencimiento: todayISO(),
    moneda: 1,
    porcentaje_de_igv: 18,
    ...totalesDelPayload(lineas),
    items: lineas.items,
    observaciones: input.motivo,
    formato_de_pdf: "A4",
    // Campos específicos de nota de crédito
    motivo: input.motivo,
    documento_que_se_modifica_tipo: input.originalTipoComprobante,
    documento_que_se_modifica_serie: input.originalSeries,
    documento_que_se_modifica_numero: input.originalNumber,
  };
}

/**
 * Construye el payload de comunicación de baja (anulación).
 */
export function buildBaja(
  tipo: 1 | 2,
  serie: string,
  numero: number,
  motivo: string,
): NubefactBajaPayload {
  return {
    operacion: "generar_anulacion",
    tipo_de_comprobante: tipo,
    serie,
    numero,
    fecha_de_generacion: todayISO(),
    motivo,
  };
}
