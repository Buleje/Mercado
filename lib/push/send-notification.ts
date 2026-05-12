import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ── VAPID init (lazy, idempotent) ────────────────────────────────────────────

let vapidReady = false;

function ensureVapid(): boolean {
  if (vapidReady) return true;
  const email = process.env.VAPID_EMAIL || process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!email || !publicKey || !privateKey) return false;
  webpush.setVapidDetails(email, publicKey, privateKey);
  vapidReady = true;
  return true;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Send a Web Push notification to all subscriptions for a customer phone
 * within a specific tenant. Cleans up expired subscriptions automatically.
 *
 * Usage (fire-and-forget):
 *   sendPushNotification(phone, tenantId, { title, body, url }).catch(() => {});
 */
export async function sendPushNotification(
  customerPhone: string,
  tenantId: string,
  payload: PushNotificationPayload,
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) {
    logger.debug("[PUSH] VAPID not configured — skipping");
    return { sent: 0, failed: 0 };
  }

  // Lookup all subscriptions for this customer in this tenant
  const cleanPhone = customerPhone.replace(/\D/g, "");
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      tenantId,
      phone: { contains: cleanPhone },
    },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/icons/icon-192x192.png",
    url: payload.url ?? "/",
  });

  let sent = 0;
  let failed = 0;

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        // 410 Gone or 404 Not Found = subscription expired, clean up
        if (statusCode === 410 || statusCode === 404) {
          /* eslint-disable no-restricted-syntax -- cleanup de subscription expirada por endpoint (único globalmente, scope efectivo). */
          await prisma.pushSubscription
            .deleteMany({ where: { endpoint: sub.endpoint } })
            .catch((err) => logger.error("[push] cleanup failed", { err: String(err) }));
          /* eslint-enable no-restricted-syntax */
          logger.debug("[PUSH] Removed expired subscription", { endpoint: sub.endpoint.slice(0, 60) });
        }
        failed++;
      }
    }),
  );

  logger.info("[PUSH] Notification batch", {
    customerPhone: cleanPhone,
    tenantId,
    total: results.length,
    sent,
    failed,
  });

  return { sent, failed };
}

/**
 * Broadcast a push notification to ALL subscriptions in a tenant.
 * Useful for promotions, announcements, etc.
 */
export async function broadcastPushToTenant(
  tenantId: string,
  payload: PushNotificationPayload,
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) {
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { tenantId },
  });

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? "/icons/icon-192x192.png",
    url: payload.url ?? "/",
  });

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          /* eslint-disable no-restricted-syntax -- cleanup de subscription expirada por endpoint (único globalmente, scope efectivo). */
          await prisma.pushSubscription
            .deleteMany({ where: { endpoint: sub.endpoint } })
            .catch((err) => logger.error("[push] cleanup failed", { err: String(err) }));
          /* eslint-enable no-restricted-syntax */
        }
        failed++;
      }
    }),
  );

  logger.info("[PUSH] Broadcast to tenant", { tenantId, sent, failed });
  return { sent, failed };
}
