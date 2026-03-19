/**
 * Persistent push subscription store backed by PostgreSQL via Prisma.
 * Replaces the old in-memory store so subscriptions survive restarts.
 */

import { prisma } from "@/lib/prisma";

export type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  phone?: string;
  createdAt: string;
};

export const PushSubscriptionsStore = {
  async save(sub: Omit<StoredSubscription, "createdAt">): Promise<void> {
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, phone: sub.phone ?? null },
      create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, phone: sub.phone ?? null },
    });
  },

  async remove(endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  },

  async getAll(): Promise<StoredSubscription[]> {
    const rows = await prisma.pushSubscription.findMany();
    return rows.map((r) => ({
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
      phone: r.phone ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  async getByPhone(phone: string): Promise<StoredSubscription[]> {
    const clean = phone.replace(/\D/g, "");
    const rows = await prisma.pushSubscription.findMany({
      where: { phone: { contains: clean } },
    });
    return rows.map((r) => ({
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
      phone: r.phone ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  },
};
