import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * StorePermissionsDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/store-permissions.
 * Permisos granulares por (storeId, userId, userType) — modela RBAC
 * a nivel store dentro de un tenant multi-store.
 */

interface RowFromDb {
  id: string;
  storeId: string;
  userId: string;
  userType: string;
  permissions: string;
  grantedBy: string;
  createdAt: Date;
  store: { id: string; name: string | null; tenantId: string } | null;
}

interface UpsertData {
  storeId: string;
  userId: string;
  userType: string;
  permissions: string[];
  grantedBy: string;
}

export const StorePermissionsDB = {
  /**
   * Lista permisos del tenant — filtro opcional por storeId (verificado
   * contra tenantId antes de query).
   */
  async listForTenant(tenantId: string, opts: { storeId?: string } = {}): Promise<RowFromDb[]> {
    if (opts.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: opts.storeId, tenantId },
        select: { id: true },
      });
      if (!store) return [];
    }
    const where: Record<string, unknown> = {
      store: { tenantId },
      ...(opts.storeId ? { storeId: opts.storeId } : {}),
    };
    return prisma.storePermission.findMany({
      where,
      include: { store: { select: { id: true, name: true, tenantId: true } } },
      orderBy: { createdAt: "desc" },
    }) as Promise<RowFromDb[]>;
  },

  /**
   * Resolve admin/partner display data para decorar permission rows.
   * Bulk lookup paralelo (1 query por tipo).
   */
  async resolveActors(
    adminIds: string[],
    partnerIds: string[],
  ): Promise<{
    admins: Array<{ id: string; username: string; name: string | null }>;
    partners: Array<{ id: string; name: string; phone: string }>;
  }> {
    const [admins, partners] = await Promise.all([
      adminIds.length
        ? prisma.adminUser.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, username: true, name: true },
          })
        : Promise.resolve([]),
      partnerIds.length
        ? prisma.deliveryPartner.findMany({
            where: { id: { in: partnerIds } },
            select: { id: true, name: true, phone: true },
          })
        : Promise.resolve([]),
    ]);
    return { admins, partners };
  },

  /**
   * Verifica que un storeId pertenece al tenant (anti cross-tenant).
   */
  async storeOwnedBy(tenantId: string, storeId: string): Promise<boolean> {
    const store = await prisma.store.findFirst({
      where: { id: storeId, tenantId },
      select: { id: true },
    });
    return !!store;
  },

  /**
   * Upsert de permiso (idempotente por unique compuesto). El caller
   * debe llamar primero a storeOwnedBy para validar tenant scope.
   */
  async upsert(data: UpsertData): Promise<RowFromDb> {
    const { storeId, userId, userType, permissions, grantedBy } = data;
    return prisma.storePermission.upsert({
      where: { storeId_userId_userType: { storeId, userId, userType } },
      update: {
        permissions: permissions.join(","),
        grantedBy,
      },
      create: {
        storeId,
        userId,
        userType,
        permissions: permissions.join(","),
        grantedBy,
      },
      include: { store: { select: { id: true, name: true, tenantId: true } } },
    }) as Promise<RowFromDb>;
  },

  /**
   * Elimina un permiso con guard cross-tenant via store.tenantId nested.
   * Retorna el row eliminado o null si no existe / cross-tenant.
   */
  async deleteForTenant(tenantId: string, id: string): Promise<{ userId: string; storeId: string } | null> {
    const existing = await prisma.storePermission.findFirst({
      where: { id, store: { tenantId } },
      select: { id: true, userId: true, storeId: true },
    });
    if (!existing) return null;
    await prisma.storePermission.delete({ where: { id } });
    return { userId: existing.userId, storeId: existing.storeId };
  },
};
