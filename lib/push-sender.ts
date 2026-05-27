import webpush from "web-push";
import { PushSubscriptionsStore } from "@/lib/push-subscriptions";

function initVapid() {
  const email = process.env.VAPID_EMAIL;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!email || !publicKey || !privateKey) return;
  webpush.setVapidDetails(email, publicKey, privateKey);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
};

/**
 * Send push to all subscriptions belonging to a phone number.
 *
 * SECURITY 2026-05-06 (audit notifs #2): si se pasa `tenantId`, filtra por
 * tenant para evitar push cross-tenant. Nuevos callers DEBEN pasarlo.
 */
export async function sendPushToPhone(phone: string, payload: PushPayload, tenantId?: string): Promise<void> {
  initVapid();
  const subs = await PushSubscriptionsStore.getByPhone(phone, tenantId);
  await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify({ ...payload, icon: payload.icon ?? "/icons/icon-192x192.png" }),
      ).catch(async (err: { statusCode?: number }) => {
        // 410 Gone / 404 Not Found → subscription expired, remove it
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await PushSubscriptionsStore.remove(s.endpoint);
        }
      }),
    ),
  );
}

/**
 * Send push to every stored subscription.
 *
 * SECURITY 2026-05-06 (audit WhatsApp #14): si `tenantId` se proporciona,
 * filtra por tenant para evitar enviar notifs cross-tenant. El parámetro es
 * opcional por backward compat — los nuevos callers DEBEN pasarlo. Sin
 * tenantId el comportamiento legacy es global (deprecated, loggear warning).
 */
export async function broadcastPush(payload: PushPayload, tenantId?: string): Promise<void> {
  initVapid();
  const subs = tenantId
    ? await PushSubscriptionsStore.getAllByTenant(tenantId)
    : await PushSubscriptionsStore.getAll();
  if (!tenantId) {
     
    console.warn("[push-sender] broadcastPush() sin tenantId — deprecated, pasar tenantId explícito");
  }
  await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify({ ...payload, icon: payload.icon ?? "/icons/icon-192x192.png" }),
      ).catch(async (err: { statusCode?: number }) => {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await PushSubscriptionsStore.remove(s.endpoint);
        }
      }),
    ),
  );
}
