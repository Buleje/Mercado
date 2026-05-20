import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * SavedFiltersDB
 *
 * Acceso canonico a `SavedFilter` — filtros guardados por usuarios
 * admin en el panel (modulo + condiciones JSON). Cumple CLAUDE.md
 * regla #3: tenantId obligatorio como 1er argumento.
 *
 * Audit project-wide 2026-05-19 — migracion de /api/saved-filters.
 */

export interface SavedFilterRow {
  id: string;
  name: string;
  description: string;
  module: string;
  conditionsJson: string;
  isDefault: boolean;
  usageCount: number;
  createdAt: Date;
}

export const SavedFiltersDB = {
  async list(tenantId: string): Promise<SavedFilterRow[]> {
    return prisma.savedFilter.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: "desc" }, { usageCount: "desc" }],
    });
  },

  async create(
    tenantId: string,
    data: {
      name: string;
      description: string;
      module: string;
      conditionsJson: string;
      isDefault: boolean;
    },
  ): Promise<SavedFilterRow> {
    return prisma.savedFilter.create({
      data: { ...data, tenantId },
    });
  },

  /**
   * Actualiza un SavedFilter con guard tenantId (cross-tenant safe).
   * @returns null si no existe en el tenant.
   */
  async updateForTenant(
    tenantId: string,
    id: string,
    data: Partial<{
      name: string;
      description: string;
      module: string;
      conditionsJson: string;
      isDefault: boolean;
      usageCount: number;
    }>,
  ): Promise<SavedFilterRow | null> {
    const existing = await prisma.savedFilter.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) return null;
    return prisma.savedFilter.update({ where: { id }, data });
  },

  /**
   * Elimina un SavedFilter con guard tenantId. Retorna true si elimino,
   * false si no existia en el tenant.
   */
  async deleteForTenant(tenantId: string, id: string): Promise<boolean> {
    const existing = await prisma.savedFilter.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) return false;
    await prisma.savedFilter.delete({ where: { id } });
    return true;
  },
};
