/**
 * Web Push Notifications — server-side
 * Uses VAPID keys (free, no third party needed)
 * Env: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL
 */

import webpush from "web-push";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@buleje.pe";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
};

export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: PushPayload
) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icons/icon-192x192.png",
    data: { url: payload.url || "/" },
    tag: payload.tag,
  });

  return webpush.sendNotification(subscription, data).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
}

export async function sendBulkPush(
  subscriptions: webpush.PushSubscription[],
  payload: PushPayload
) {
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub, payload))
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { sent, total: subscriptions.length };
}
