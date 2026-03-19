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

/** Send push to all subscriptions belonging to a phone number. */
export async function sendPushToPhone(phone: string, payload: PushPayload): Promise<void> {
  initVapid();
  const subs = await PushSubscriptionsStore.getByPhone(phone);
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

/** Send push to every stored subscription (e.g. broadcast promo). */
export async function broadcastPush(payload: PushPayload): Promise<void> {
  initVapid();
  const subs = await PushSubscriptionsStore.getAll();
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
