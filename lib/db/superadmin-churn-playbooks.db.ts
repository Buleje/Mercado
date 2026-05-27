import "server-only";
 
import { prisma } from "@/lib/prisma";

/**
 * SuperadminChurnPlaybooksDB
 *
 * Audit project-wide 2026-05-19 — migración de /api/superadmin/churn/playbooks.
 *
 * ChurnPlaybook es un modelo platform-wide (sin tenantId). Reglas globales del
 * sistema anti-churn. ADR-101 (platform-wide-models): acceso superadmin con
 * `requirePlatformAPI` ya validado en el caller.
 */

type PlaybookCreateData = {
  name: string;
  triggerSignal: string;
  triggerSeverity: string;
  action: string;
  templateId: string | null;
  discountPercent: number | null;
  discountDays: number | null;
  isActive: boolean;
};

type PlaybookUpdateData = Partial<PlaybookCreateData>;

export const SuperadminChurnPlaybooksDB = {
  async list(isActive?: boolean) {
    return prisma.churnPlaybook.findMany({
      where: isActive !== undefined ? { isActive } : undefined,
      orderBy: { createdAt: "asc" },
    });
  },

  async findByName(name: string) {
    return prisma.churnPlaybook.findUnique({ where: { name } });
  },

  async findById(id: string) {
    return prisma.churnPlaybook.findUnique({ where: { id } });
  },

  async create(data: PlaybookCreateData) {
    return prisma.churnPlaybook.create({ data });
  },

  async update(id: string, data: PlaybookUpdateData) {
    return prisma.churnPlaybook.update({ where: { id }, data });
  },

  async deactivate(id: string) {
    return prisma.churnPlaybook.update({
      where: { id },
      data: { isActive: false },
    });
  },
};
