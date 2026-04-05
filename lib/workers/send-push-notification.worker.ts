/**
 * Worker: send-push-notification
 *
 * Envía notificaciones push web con web-push (VAPID).
 * Si phone está presente → envía a las subscripciones de ese teléfono.
 * Si phone está ausente → broadcast a todas las subscripciones del tenant.
 *
 * Subscripciones expiradas (410/404) se eliminan automáticamente.
 * Errores de red se reintentan con backoff exponencial.
 */

import { logger } from "@/lib/logger";
import { queue, PushPayloadSchema, type JobEnvelope } from "@/lib/queue";
import { sendPushToPhone, broadcastPush } from "@/lib/push-sender";

export async function handleSendPushNotification(envelope: JobEnvelope): Promise<void> {
  const parsed = PushPayloadSchema.safeParse(envelope.payload);
  if (!parsed.success) {
    logger.error("[worker:send-push-notification] Invalid payload — skipping retry", {
      jobId: envelope.jobId,
      issues: parsed.error.issues,
    });
    return;
  }

  const { tenantId, phone, title, body, url, icon } = parsed.data;

  const vapidEmail = process.env.VAPID_EMAIL;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidEmail || !vapidPublicKey || !vapidPrivateKey) {
    logger.warn("[worker:send-push-notification] VAPID not configured — skipping", {
      jobId: envelope.jobId,
      tenantId,
    });
    return;
  }

  const pushPayload = { title, body, url, icon };

  try {
    if (phone) {
      await sendPushToPhone(phone, pushPayload);
      logger.info("[worker:send-push-notification] Push sent to phone", {
        jobId: envelope.jobId,
        tenantId,
        phone,
        attempt: envelope.attempt,
      });
    } else {
      await broadcastPush(pushPayload);
      logger.info("[worker:send-push-notification] Push broadcast completed", {
        jobId: envelope.jobId,
        tenantId,
        attempt: envelope.attempt,
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.error("[worker:send-push-notification] Failed to send push", {
      jobId: envelope.jobId,
      tenantId,
      phone,
      attempt: envelope.attempt,
      error: errorMessage,
    });

    await queue.retry(envelope);
  }
}
