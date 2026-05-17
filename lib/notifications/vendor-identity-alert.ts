/**
 * lib/notifications/vendor-identity-alert.ts
 *
 * Envía alerta por WhatsApp al titular del vendor cuando RENIEC/SUNAT
 * detecta degradación de su identidad (RUC NO HABIDO, DNI ya no existe, etc).
 *
 * Diseño:
 *   - Mensaje breve con CTA clara al panel admin
 *   - Phone del vendor.contactPhone (E.164)
 *   - Idempotencia delegada al caller: sendVendorIdentityWhatsApp NO
 *     dedup. El caller (cron) verifica `notification.created=true` antes
 *     de invocar — eso garantiza 1 mensaje por degradación (no por run).
 *   - Fail-soft: si WhatsApp falla, logger.warn pero NO bloquea el cron.
 *   - sendWhatsAppQueued: usa BullMQ si disponible, fallback direct send
 *     con circuit breaker.
 *
 * Audit ref: TD-058 — capa 6 (canal externo al panel admin).
 */
import "server-only";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

export type AlertKind = "ruc-changed" | "ruc-not-found" | "dni-not-found";

export interface VendorAlertParams {
  tenantId: string;
  vendorId: string;
  /** Nombre comercial para personalizar el mensaje */
  businessName: string;
  /** E.164 del contactPhone (con 51... o + prefix tolerable) */
  contactPhone: string;
  /** Tipo de alerta para escoger el copy */
  kind: AlertKind;
  /** Last 4 dígitos del RUC para citar sin exponer en logs */
  rucLast4?: string;
}

interface AlertCopy {
  title: string;
  cta: string;
}

const COPY_BY_KIND: Record<AlertKind, AlertCopy> = {
  "ruc-changed": {
    title: "Tu RUC pasó a estado no apto para facturar",
    cta: "Tus facturas dejarán de ser deducibles para tus clientes hasta regularizar con SUNAT.",
  },
  "ruc-not-found": {
    title: "Tu RUC no figura en SUNAT",
    cta: "Revisa el número que registraste o regulariza tu inscripción.",
  },
  "dni-not-found": {
    title: "El DNI registrado ya no figura en RENIEC",
    cta: "Verifica los datos del contacto principal o actualízalos desde el panel.",
  },
};

/**
 * Envía WA al vendor con copy estandarizado según `kind`.
 * Retorna { sent: boolean } — sent=false si el phone es inválido o WA falló.
 */
export async function sendVendorIdentityWhatsApp(
  params: VendorAlertParams,
): Promise<{ sent: boolean; queued: boolean }> {
  const { tenantId, vendorId, businessName, contactPhone, kind, rucLast4 } = params;

  // Normaliza phone: solo dígitos. Vendor podría haberse registrado con espacios.
  const digits = contactPhone.replace(/\D/g, "");
  if (digits.length < 9) {
    logger.warn("[vendor-identity-alert] phone inválido — skip WA", {
      tenantId,
      vendorId,
      phoneLength: digits.length,
    });
    return { sent: false, queued: false };
  }

  // Asegurar prefijo 51 (Perú E.164) si no lo trae.
  const normalized = digits.startsWith("51") ? digits : `51${digits}`;

  const copy = COPY_BY_KIND[kind];
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
  const adminUrl = `${baseUrl}/admin/settings/business`;

  const message = [
    `🛡️ *${copy.title}*`,
    ``,
    `Hola ${businessName},`,
    ``,
    copy.cta,
    rucLast4 ? `Tu RUC ***${rucLast4}` : null,
    ``,
    `Revisa el detalle aquí:`,
    adminUrl,
    ``,
    `─────`,
    `Buleje · Marketplace`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await sendWhatsAppQueued(normalized, message, {
      tenantId,
      context: `vendor-identity-alert:${vendorId}:${kind}`,
      metadata: { vendorId, kind, rucLast4 },
    });
    logger.info("[vendor-identity-alert] WA dispatched", {
      tenantId,
      vendorId,
      kind,
      queued: result.queued,
    });
    return { sent: true, queued: result.queued };
  } catch (err) {
    logger.warn("[vendor-identity-alert] WA send failed", {
      tenantId,
      vendorId,
      kind,
      err: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, queued: false };
  }
}
