import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * SuperadminStoresHealthDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/superadmin/stores/health-field.
 *
 * Acciones del modal "Salud" del superadmin. tenantId siempre presente.
 * Tenants es un modelo cross-tenant (el superadmin lo ejecuta sobre cualquier
 * tenant), pero internamente lee/actualiza el tenant por id, así que cualquier
 * regla de tenantId queda cubierta por la clave primaria.
 */

export const SuperadminStoresHealthDB = {
  async findTenant(tenantId: string) {
    return prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true },
    });
  },

  async updateTenantLogo(tenantId: string, logoUrl: string | null) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl },
    });
  },

  async updateTenantOwnerPhone(tenantId: string, ownerPhone: string | null) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { ownerPhone },
    });
  },

  async findStoreByTenant(tenantId: string) {
    return prisma.store.findFirst({
      where: { tenantId },
      select: { id: true },
    });
  },

  async updateStore(storeId: string, data: Record<string, unknown>) {
    return prisma.store.update({ where: { id: storeId }, data });
  },

  async upsertSettings(tenantId: string, data: Record<string, unknown>) {
    return prisma.settings.upsert({
      where: { tenantId },
      create: { tenantId, mode: "checkout", ...data },
      update: data,
    });
  },
};
