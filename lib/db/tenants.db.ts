import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * TenantsDB
 *
 * Acceso canonico a `Tenant` para lookups admin/cron (no billing).
 * Audit project-wide 2026-05-19 — migracion de endpoints que listan
 * tenants para iteracion (daily-digest, batch jobs, etc.).
 *
 * Para lookups por id/slug usar `findTenantByIdOrSlug` en lib/tenant.ts
 * (cacheado por request).
 */

export const TenantsDB = {
  /**
   * Lista solo los IDs de tenants activos. Util para crons que iteran
   * sobre todos los tenants.
   */
  async listActiveIds(): Promise<string[]> {
    const rows = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  /**
   * Lista tenants activos con campos basicos para iteracion en crons.
   */
  async listActive(): Promise<Array<{ id: string; slug: string; name: string }>> {
    return prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, slug: true, name: true },
    });
  },

  /**
   * TODOS los negocios (activos o no) con su alta: el código corto de los QR
   * (ADR-486) es del más viejo cuando dos caen en el mismo, así que hacen falta
   * también los dados de baja. Sólo lectura.
   */
  async listParaCodigoCorto(): Promise<Array<{ id: string; active: boolean; createdAt: Date }>> {
    return prisma.tenant.findMany({ select: { id: true, active: true, createdAt: true } });
  },

  /** Datos básicos de un tenant por id (nombre/slug) — para páginas públicas. */
  async getBasicById(
    id: string,
  ): Promise<{ id: string; slug: string; name: string } | null> {
    return prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true },
    });
  },
};
