import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * CommissionRulesDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/commission-rules.
 * Reglas de comision por cajero (cashierId) — tenantId obligatorio.
 */

export interface CommissionRuleRow {
  id: string;
  tenantId: string;
  cashierId: string;
  label: string;
  minSales: number;
  maxSales: number | null;
  rate: number;
}

interface CreateData {
  cashierId: string;
  label: string;
  minSales: number;
  maxSales: number | null;
  rate: number;
}

interface UpdateData {
  label?: string;
  minSales?: number;
  maxSales?: number | null;
  rate?: number;
}

export const CommissionRulesDB = {
  async list(tenantId: string) {
    return prisma.commissionRule.findMany({
      where: { tenantId },
      orderBy: [{ cashierId: "asc" }, { minSales: "asc" }],
    });
  },

  async create(tenantId: string, data: CreateData) {
    return prisma.commissionRule.create({
      data: { ...data, tenantId },
    });
  },

  async getForTenant(tenantId: string, id: string) {
    return prisma.commissionRule.findFirst({
      where: { id, tenantId },
    });
  },

  async updateForTenant(tenantId: string, id: string, data: UpdateData) {
    const existing = await this.getForTenant(tenantId, id);
    if (!existing) return null;
    const updated = await prisma.commissionRule.update({ where: { id }, data });
    return { previous: existing, updated };
  },

  async deleteForTenant(tenantId: string, id: string) {
    const existing = await this.getForTenant(tenantId, id);
    if (!existing) return null;
    await prisma.commissionRule.delete({ where: { id } });
    return existing;
  },
};
