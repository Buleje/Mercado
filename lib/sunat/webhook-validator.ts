/**
 * lib/sunat/webhook-validator.ts
 *
 * Valida la firma HMAC-SHA256 de los webhooks entrantes de Nubefact.
 * Nubefact incluye la firma en el header "x-nubefact-signature".
 * Formato: "sha256=<hex-digest>"
 *
 * Nunca secrets hardcodeados (CLAUDE.md regla #10).
 * El secret vive en process.env.NUBEFACT_WEBHOOK_SECRET.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resultado de la validación del webhook.
 */
export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Payload tipado del webhook de Nubefact.
 * Nubefact envía updates cuando SUNAT acepta o rechaza un CDR.
 */
export interface NubefactWebhookPayload {
  /** ID interno de Nubefact */
  nubefact_id: string;
  /** Estado SUNAT: "ACEPTADO" | "RECHAZADO" | "ANULADO" */
  estado: "ACEPTADO" | "RECHAZADO" | "ANULADO";
  /** Código de respuesta SUNAT */
  codigo_sunat?: string;
  /** Descripción de SUNAT */
  descripcion_sunat?: string;
  /** URL del CDR XML */
  enlace_del_cdr?: string;
  /** URL del PDF generado */
  enlace_del_pdf?: string;
  /** URL del XML UBL */
  enlace_del_xml?: string;
  /** Serie del comprobante */
  serie?: string;
  /** Número correlativo */
  numero?: number;
  /** Tipo: 1=factura, 2=boleta */
  tipo_de_comprobante?: number;
}

/**
 * Verifica la firma HMAC-SHA256 del webhook.
 *
 * @param rawBody - El cuerpo raw del request como string UTF-8
 * @param signatureHeader - El valor del header "x-nubefact-signature"
 * @param secret - El NUBEFACT_WEBHOOK_SECRET
 */
export function validateWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): WebhookValidationResult {
  if (!signatureHeader) {
    return { valid: false, error: "Header x-nubefact-signature ausente" };
  }

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return {
      valid: false,
      error: `Formato de firma inválido. Se esperaba "sha256=<hex>", recibido: "${signatureHeader.slice(0, 20)}"`,
    };
  }

  const receivedHex = signatureHeader.slice(prefix.length);

  // Calcular HMAC esperado
  const expectedHex = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Comparación timing-safe para prevenir timing attacks
  try {
    const receivedBuf = Buffer.from(receivedHex, "hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");

    if (receivedBuf.length !== expectedBuf.length) {
      return { valid: false, error: "Firma inválida (longitud diferente)" };
    }

    const isValid = timingSafeEqual(receivedBuf, expectedBuf);
    return isValid
      ? { valid: true }
      : { valid: false, error: "Firma HMAC inválida" };
  } catch {
    return { valid: false, error: "Error al comparar firma" };
  }
}

/**
 * Mapea el estado del webhook de Nubefact a nuestro SunatInvoiceStatus.
 */
export function mapWebhookEstadoToStatus(
  estado: NubefactWebhookPayload["estado"]
): "accepted" | "rejected" | "voided" {
  switch (estado) {
    case "ACEPTADO":
      return "accepted";
    case "RECHAZADO":
      return "rejected";
    case "ANULADO":
      return "voided";
    default:
      return "rejected";
  }
}
