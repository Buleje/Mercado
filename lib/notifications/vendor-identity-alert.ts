/**
 * lib/notifications/vendor-identity-alert.ts
 *
 * Envía alerta al titular del vendor cuando RENIEC/SUNAT detecta
 * degradación de su identidad (RUC NO HABIDO, DNI ya no existe, etc).
 *
 * Diseño multi-canal con fallback:
 *   1. WhatsApp al contactPhone (canal preferido — instantáneo)
 *   2. Email al contactEmail si:
 *      - WhatsApp falló (sent=false), O
 *      - El vendor no tiene contactPhone registrado
 *   3. Solo logger.warn si ambos canales fallan (operador soluciona manual)
 *
 * Idempotencia delegada al caller: el cron solo invoca tras
 * `notification.created=true` — eso garantiza 1 alerta por degradación
 * (no 1 por run).
 *
 * Audit ref: TD-058 — capa 6 (WhatsApp) + capa 7 (email backup).
 */
import "server-only";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { sendVendorIdentityAlertEmail } from "@/lib/email/send";
import { logger } from "@/lib/logger";

export type AlertKind = "ruc-changed" | "ruc-not-found" | "dni-not-found";

export interface VendorAlertParams {
  tenantId: string;
  vendorId: string;
  /** Nombre comercial para personalizar el mensaje */
  businessName: string;
  /** E.164 del contactPhone (con 51... o + prefix tolerable). Opcional — si falta, salta WA. */
  contactPhone?: string | null;
  /** Email del contacto. Opcional — usado como backup si WA falla o no hay phone. */
  contactEmail?: string | null;
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

export interface VendorAlertResult {
  /** WhatsApp dispatched (BullMQ o direct) */
  waSent: boolean;
  /** Email dispatched via Resend */
  emailSent: boolean;
  /** Al menos un canal alcanzó al vendor */
  anyChannelOk: boolean;
}

/** Helper interno: intenta enviar WhatsApp. Null si no hay phone válido. */
async function tryWhatsApp(
  params: VendorAlertParams,
): Promise<{ sent: boolean; queued: boolean } | null> {
  const { tenantId, vendorId, businessName, contactPhone, kind, rucLast4 } = params;
  if (!contactPhone) return null;

  const digits = contactPhone.replace(/\D/g, "");
  if (digits.length < 9) {
    logger.warn("[vendor-identity-alert] phone inválido — skip WA", {
      tenantId,
      vendorId,
      phoneLength: digits.length,
    });
    return null;
  }
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

/** Helper interno: intenta email. Null si no hay email válido. */
async function tryEmail(
  params: VendorAlertParams,
): Promise<{ sent: boolean } | null> {
  const { tenantId, vendorId, businessName, contactEmail, kind, rucLast4 } = params;
  if (!contactEmail || !contactEmail.includes("@")) return null;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
  const adminUrl = `${baseUrl}/admin/settings/business`;

  try {
    const result = await sendVendorIdentityAlertEmail(contactEmail, {
      businessName,
      kind,
      adminUrl,
      ...(rucLast4 != null && { rucLast4 }),
    });
    if (result.success) {
      logger.info("[vendor-identity-alert] Email dispatched", {
        tenantId,
        vendorId,
        kind,
      });
      return { sent: true };
    }
    logger.warn("[vendor-identity-alert] Email failed", {
      tenantId,
      vendorId,
      kind,
      error: result.error,
    });
    return { sent: false };
  } catch (err) {
    logger.warn("[vendor-identity-alert] Email threw", {
      tenantId,
      vendorId,
      kind,
      err: err instanceof Error ? err.message : String(err),
    });
    return { sent: false };
  }
}

/**
 * Envía alerta al vendor por WhatsApp con fallback automático a email:
 *
 * | Phone | Email | Resultado |
 * |---|---|---|
 * | sí | sí | Intenta WA. Si falla → email. Si WA ok → no email. |
 * | sí | no | Solo WA. |
 * | no | sí | Solo email. |
 * | no | no | logger.warn, no envía nada. |
 */
export async function sendVendorIdentityAlert(
  params: VendorAlertParams,
): Promise<VendorAlertResult> {
  const wa = await tryWhatsApp(params);
  if (wa?.sent) {
    return { waSent: true, emailSent: false, anyChannelOk: true };
  }
  // WA falló o no hay phone → intentar email
  const email = await tryEmail(params);
  const waSent = wa?.sent ?? false;
  const emailSent = email?.sent ?? false;

  if (!waSent && !emailSent) {
    logger.warn("[vendor-identity-alert] no channel reached vendor", {
      tenantId: params.tenantId,
      vendorId: params.vendorId,
      kind: params.kind,
      hasPhone: !!params.contactPhone,
      hasEmail: !!params.contactEmail,
    });
  }

  return { waSent, emailSent, anyChannelOk: waSent || emailSent };
}

/**
 * @deprecated Use `sendVendorIdentityAlert` (multi-canal con fallback email).
 * Backwards-compat wrapper para call sites que aún esperan solo WA.
 */
export async function sendVendorIdentityWhatsApp(
  params: VendorAlertParams,
): Promise<{ sent: boolean; queued: boolean }> {
  const wa = await tryWhatsApp(params);
  return wa ?? { sent: false, queued: false };
}
