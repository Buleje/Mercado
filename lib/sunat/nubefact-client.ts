/**
 * lib/sunat/nubefact-client.ts
 *
 * Cliente multi-tenant para la API REST de Nubefact OSE.
 * Cada tenant tiene su propio token y RUC almacenados en TenantSunatConfig.
 *
 * Documentación Nubefact: https://api.nubefact.com/api/v1
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── Tipos de request ──────────────────────────────────────────────────────────

export interface NubefactItem {
  unidad_de_medida: string;  // "NIU" = unidades
  codigo: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;    // precio sin IGV
  precio_unitario: number;   // precio con IGV
  descuento: number;
  subtotal: number;
  tipo_de_igv: number;       // 1 = gravado onerosa
  igv: number;
  total: number;
  anticipo_regularizacion: boolean;
  anticipo_documento_serie: string;
  anticipo_documento_numero: string;
}

export interface NubefactComprobantePayload {
  operacion: "generar_comprobante";
  /** 1=factura, 2=boleta, 3=nota débito, 4=nota crédito */
  tipo_de_comprobante: 1 | 2 | 3 | 4;
  serie: string;
  numero: number;
  sunat_transaction: 1;
  cliente_tipo_de_documento: number; // 1=DNI, 6=RUC
  cliente_numero_de_documento: string;
  cliente_denominacion: string;
  cliente_direccion: string;
  cliente_email: string;
  cliente_email_1: string;
  cliente_email_2: string;
  fecha_de_emision: string;          // YYYY-MM-DD
  fecha_de_vencimiento: string;      // YYYY-MM-DD
  moneda: 1;                         // 1 = PEN
  porcentaje_de_igv: 18;
  descuento_global: number;
  total_descuento: number;
  total_anticipo: number;
  total_gravada: number;
  total_inafecta: number;
  total_exonerada: number;
  total_igv: number;
  total_gratuita: number;
  total_otros_cargos: number;
  total: number;
  items: NubefactItem[];
  observaciones: string;
  formato_de_pdf: "A4" | "ticket";
  // Campos opcionales para nota de crédito
  motivo?: string;
  documento_que_se_modifica_tipo?: number;
  documento_que_se_modifica_serie?: string;
  documento_que_se_modifica_numero?: number;
}

export interface NubefactBajaPayload {
  operacion: "generar_anulacion";
  tipo_de_comprobante: 1 | 2;
  serie: string;
  numero: number;
  fecha_de_generacion: string;       // YYYY-MM-DD
  motivo: string;
}

// ── Tipos de respuesta ────────────────────────────────────────────────────────

export interface NubefactResponse {
  sunat_accepted: boolean;
  sunat_description?: string;
  sunat_note?: string;
  hash?: string;
  enlace_del_pdf?: string;
  enlace_del_xml?: string;
  enlace_del_cdr?: string;
  pdf_base_64_encoded?: string;
  xml_base_64_encoded?: string;
  cdr_base_64_encoded?: string;
  nubefact_id?: string;
  error?: string;
  errors?: string[];
}

// ── Config de tenant ──────────────────────────────────────────────────────────

interface TenantConfig {
  nubefactToken: string;
  nubefactUrl: string;
  ruc: string;
  razonSocial: string;
  isProduction: boolean;
}

async function getTenantConfig(tenantId: string): Promise<TenantConfig> {
  const config = await prisma.tenantSunatConfig.findUnique({
    where: { tenantId },
    select: {
      nubefactToken: true,
      nubefactUrl: true,
      ruc: true,
      razonSocial: true,
      isProduction: true,
    },
  });

  if (!config) {
    throw new Error(
      `[NubefactClient] Configuración SUNAT no encontrada para tenant ${tenantId}. ` +
      "Configura RUC y token en Ajustes > Facturación Electrónica."
    );
  }

  return config;
}

// ── Retry con exponential backoff ─────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3,
): Promise<Response> {
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, options);

      // 429 y 5xx merecen retry; 4xx son errores del cliente, no reintentar
      if (res.status === 429 || res.status >= 500) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        logger.warn("[NubefactClient] Reintentando", {
          attempt,
          status: res.status,
          delayMs: delay,
        });
        await new Promise((r) => setTimeout(r, delay));
        lastError = new Error(`Nubefact HTTP ${res.status}`);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        logger.warn("[NubefactClient] Error de red, reintentando", {
          attempt,
          error: lastError.message,
          delayMs: delay,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

// ── POST genérico a Nubefact ──────────────────────────────────────────────────

async function postToNubefact(
  config: TenantConfig,
  payload: NubefactComprobantePayload | NubefactBajaPayload,
): Promise<NubefactResponse> {
  // La URL incluye el RUC: https://api.nubefact.com/api/v1/{ruc}/comprobantes
  const url = `${config.nubefactUrl}/${config.ruc}/comprobantes`;

  logger.info("[NubefactClient] Enviando a Nubefact", {
    url,
    operacion: payload.operacion,
    serie: "serie" in payload ? payload.serie : undefined,
    numero: "numero" in payload ? payload.numero : undefined,
    isProduction: config.isProduction,
  });

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token token="${config.nubefactToken}"`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => ({}))) as NubefactResponse;

  if (!res.ok) {
    const mensaje =
      body.error ??
      (Array.isArray(body.errors) ? body.errors.join("; ") : undefined) ??
      `Nubefact HTTP ${res.status}`;
    logger.error("[NubefactClient] Error de Nubefact", {
      status: res.status,
      mensaje,
    });
    throw new Error(mensaje);
  }

  logger.info("[NubefactClient] Respuesta OK", {
    sunat_accepted: body.sunat_accepted,
    sunat_description: body.sunat_description,
    enlace_del_pdf: body.enlace_del_pdf,
  });

  return body;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Envía una boleta o factura electrónica a Nubefact.
 */
export async function sendInvoice(
  tenantId: string,
  payload: NubefactComprobantePayload,
): Promise<NubefactResponse> {
  const config = await getTenantConfig(tenantId);
  return postToNubefact(config, payload);
}

/**
 * Envía una nota de crédito electrónica a Nubefact.
 */
export async function sendCreditNote(
  tenantId: string,
  payload: NubefactComprobantePayload,
): Promise<NubefactResponse> {
  const config = await getTenantConfig(tenantId);
  return postToNubefact(config, payload);
}

/**
 * Comunica la baja (anulación) de un comprobante a SUNAT vía Nubefact.
 */
export async function voidInvoice(
  tenantId: string,
  payload: NubefactBajaPayload,
): Promise<NubefactResponse> {
  const config = await getTenantConfig(tenantId);
  return postToNubefact(config, payload);
}

/**
 * Consulta el estado (CDR) de un comprobante ya enviado.
 * Nubefact usa GET /{ruc}/comprobantes/{nubefactId}
 */
export async function getInvoiceStatus(
  tenantId: string,
  nubefactId: string,
): Promise<NubefactResponse> {
  const config = await getTenantConfig(tenantId);
  const url = `${config.nubefactUrl}/${config.ruc}/comprobantes/${nubefactId}`;

  logger.info("[NubefactClient] Consultando estado", { tenantId, nubefactId });

  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: {
      Authorization: `Token token="${config.nubefactToken}"`,
    },
  });

  const body = (await res.json().catch(() => ({}))) as NubefactResponse;

  if (!res.ok) {
    const mensaje = body.error ?? `Nubefact HTTP ${res.status}`;
    throw new Error(mensaje);
  }

  return body;
}
