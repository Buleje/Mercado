/**
 * In-memory push subscription store.
 * On serverless (Vercel), subscriptions persist for the lifetime of the
 * function instance. Users re-subscribe on each visit so eventual loss is OK.
 */

export type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  phone?: string;
  createdAt: string;
};

let subscriptions: StoredSubscription[] = [];

export const PushSubscriptionsStore = {
  save(sub: Omit<StoredSubscription, "createdAt">): void {
    const idx = subscriptions.findIndex((s) => s.endpoint === sub.endpoint);
    const entry: StoredSubscription = { ...sub, createdAt: new Date().toISOString() };
    if (idx >= 0) subscriptions[idx] = entry;
    else subscriptions.push(entry);
  },
  remove(endpoint: string): void {
    subscriptions = subscriptions.filter((s) => s.endpoint !== endpoint);
  },
  getAll(): StoredSubscription[] {
    return subscriptions;
  },
  getByPhone(phone: string): StoredSubscription[] {
    const clean = phone.replace(/\D/g, "");
    return subscriptions.filter((s) => s.phone?.replace(/\D/g, "") === clean);
  },
};
