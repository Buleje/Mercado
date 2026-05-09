import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate, invalidateByPrefix } from "@/lib/cache";

// ── Cache helpers ─────────────────────────────────────────────────────────────
function listKey(tenantId: string) {
  return `custom-kpis:${tenantId}:list`;
}
function rowKey(tenantId: string, id: string) {
  return `custom-kpis:${tenantId}:${id}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CreateKpiInput {
  name: string;
  description?: string;
  formula?: string;
  target?: number;
  unit?: string;
  category?: string;
  color?: string;
}

export const CustomKpisDB = {
  /**
   * Listar KPIs del tenant ordenados por creación.
   */
  async list(tenantId: string) {
    return getOrSet(listKey(tenantId), 60, () =>
      prisma.customKpi.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
      })
    );
  },

  /**
   * Crear KPI con valores iniciales de tendencia.
   */
  async create(tenantId: string, data: CreateKpiInput) {
    const row = await prisma.customKpi.create({
      data: {
        ...data,
        description: data.description ?? "",
        formula: data.formula ?? "",
        target: data.target ?? 0,
        unit: data.unit ?? "S/",
        category: data.category ?? "Ventas",
        color: data.color ?? "bg-[var(--data-success-500)]",
        tenantId,
        currentValue: 0,
        trend: "flat",
        changePercent: 0,
        period: "Hoy",
        history: [],
      },
    });
    invalidateByPrefix(`custom-kpis:${tenantId}`);
    return row;
  },

  /**
   * Actualizar KPI por id + tenantId.
   * Retorna null si no existía.
   */
  async update(tenantId: string, id: string, data: Partial<CreateKpiInput>) {
    try {
      const row = await prisma.customKpi.update({
        where: { id, tenantId },
        data,
      });
      invalidate(rowKey(tenantId, id));
      invalidateByPrefix(`custom-kpis:${tenantId}:list`);
      return row;
    } catch {
      return null;
    }
  },

  /**
   * Eliminar KPI por id + tenantId.
   * Retorna false si no existía.
   */
  async delete(tenantId: string, id: string): Promise<boolean> {
    try {
      await prisma.customKpi.delete({ where: { id, tenantId } });
      invalidate(rowKey(tenantId, id));
      invalidateByPrefix(`custom-kpis:${tenantId}:list`);
      return true;
    } catch {
      return false;
    }
  },
};
