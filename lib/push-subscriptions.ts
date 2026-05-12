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
  async save(tenantId: string, sub: Omit<StoredSubscription, "createdAt">): Promise<void> {
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, phone: sub.phone ?? null },
      create: { tenantId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, phone: sub.phone ?? null },
    });
  },

  async remove(endpoint: string): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- endpoint es @unique global; cleanup de subscription expirada/revocada por su URL.
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

  // SECURITY 2026-05-06 (audit WhatsApp #14): scope por tenantId para evitar
  // que un broadcast de tenant A llegue a clientes de tenant B (cross-tenant
  // notification leak).
  async getAllByTenant(tenantId: string): Promise<StoredSubscription[]> {
    const rows = await prisma.pushSubscription.findMany({
      where: { tenantId },
    });
    return rows.map((r) => ({
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
      phone: r.phone ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  },

  /**
   * Busca una suscripción por endpoint exacto — O(1) vs O(N) scan.
   * Usado por DELETE /api/notifications/subscribe para verificar ownership
   * sin cargar todas las subs del tenant en memoria.
   */
  async findByEndpoint(endpoint: string): Promise<StoredSubscription | null> {
    const row = await prisma.pushSubscription.findFirst({ where: { endpoint } });
    if (!row) return null;
    return {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
      phone: row.phone ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  },

  // SECURITY 2026-05-06 (audit notifs #2): tenant-scoped + match exacto.
  // Antes `contains: clean` daba match parcial (cliente "999123" recibía
  // push destinada a "5599991234") + sin tenantId permitía leak cross-tenant.
  async getByPhone(phone: string, tenantId?: string): Promise<StoredSubscription[]> {
    const clean = phone.replace(/\D/g, "");
    const rows = await prisma.pushSubscription.findMany({
      where: {
        phone: clean,
        ...(tenantId ? { tenantId } : {}),
      },
    });
    return rows.map((r) => ({
      endpoint: r.endpoint,
      keys: { p256dh: r.p256dh, auth: r.auth },
      phone: r.phone ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));
  },
};
