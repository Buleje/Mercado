/**
 * Simple file-based push subscription store.
 * Subscriptions are keyed by endpoint (unique per browser/device).
 */
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "local-data", "push-subscriptions.json");

export type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  phone?: string;       // optional — link subscription to a customer phone
  createdAt: string;
};

function read(): StoredSubscription[] {
  try {
    const raw = fs.readFileSync(FILE, "utf-8");
    return JSON.parse(raw) as StoredSubscription[];
  } catch {
    return [];
  }
}

function write(subs: StoredSubscription[]): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(subs, null, 2), "utf-8");
}

export const PushSubscriptionsStore = {
  save(sub: Omit<StoredSubscription, "createdAt">): void {
    const all = read();
    const idx = all.findIndex((s) => s.endpoint === sub.endpoint);
    const entry: StoredSubscription = { ...sub, createdAt: new Date().toISOString() };
    if (idx >= 0) all[idx] = entry;
    else all.push(entry);
    write(all);
  },
  remove(endpoint: string): void {
    write(read().filter((s) => s.endpoint !== endpoint));
  },
  getAll(): StoredSubscription[] {
    return read();
  },
  getByPhone(phone: string): StoredSubscription[] {
    const clean = phone.replace(/\D/g, "");
    return read().filter((s) => s.phone?.replace(/\D/g, "") === clean);
  },
};
