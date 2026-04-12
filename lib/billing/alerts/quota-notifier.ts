import "server-only";
/**
 * ADR-047 — Quota Notifier.
 *
 * Envía alertas de quota via:
 * 1. Email Resend (primario) — usa sendQuotaAlert() wrapper
 * 2. WhatsApp fallback (si WHATSAPP_STAFF_PHONE configurado y email falla)
 * 3. ActivityLog (siempre, fire-and-forget)
 *
 * Nunca bloquea el request del caller.
 */
import { sendQuotaAlert } from "@/lib/billing/alerts/resend-sender";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logActivity } from "@/lib/activity-logger";
import { isDuplicate, markSent } from "./deduper";
import { buildQuotaAlertText } from "./templates";
import type { QuotaCheckResult } from "./quota-checker";
import type { MeteredEvent } from "@/lib/billing/metering";
import { logger } from "@/lib/logger";

export interface NotifyQuotaOptions {
  tenantId: string;
  event: MeteredEvent;
  checkResult: QuotaCheckResult;
  /** Email del admin del tenant para enviar la alerta. */
  adminEmail?: string;
}

/**
 * Envía una alerta de quota si corresponde (nivel != null y no duplicado).
 * Siempre fire-and-forget — no lanza hacia el caller.
 */
export async function notifyQuotaAlert(opts: NotifyQuotaOptions): Promise<void> {
  const { tenantId, event, checkResult, adminEmail } = opts;
  if (!checkResult.level) return;

  // Dedup — no enviar más de una vez por día
  if (isDuplicate(tenantId, event, checkResult.level)) {
    logger.debug("[quota-notifier] suppressed (duplicate)", {
      tenantId,
      event,
      level: checkResult.level,
    });
    return;
  }

  const templateInput = {
    tenantId,
    businessName: checkResult.businessName,
    event,
    currentUsage: checkResult.currentUsage,
    limit: checkResult.limit,
    percentUsed: checkResult.percentUsed,
    level: checkResult.level,
    planName: checkResult.planName,
  };

  let emailSent = false;

  // 1. Email via Resend wrapper
  if (adminEmail) {
    try {
      await sendQuotaAlert(adminEmail, templateInput);
      emailSent = true;
    } catch (err) {
      logger.warn("[quota-notifier] email failed, trying WhatsApp fallback", {
        tenantId,
        event,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. WhatsApp fallback
  const staffPhone = process.env.WHATSAPP_STAFF_PHONE;
  if (!emailSent && staffPhone) {
    sendWhatsAppText(staffPhone, buildQuotaAlertText(templateInput)).catch(
      (err: unknown) => {
        logger.warn("[quota-notifier] WhatsApp fallback failed", {
          tenantId,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    );
  }

  // 3. ActivityLog — siempre
  logActivity(
    "quota.alert",
    "usage.meter",
    JSON.stringify(templateInput),
    event,
    "system",
    undefined,
    tenantId,
  ).catch(() => {});

  // Marcar como enviado después de intentar
  markSent(tenantId, event, checkResult.level);
}
