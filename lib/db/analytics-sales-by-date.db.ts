import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * AnalyticsSalesByDateDB
 *
 * Audit project-wide 2026-05-19 — migración de 3 endpoints analytics que
 * compartían el mismo patrón:
 *   /api/analytics/heatmap
 *   /api/analytics/ventas-tendencia
 *   /api/analytics/peak-hours
 *
 * Helper canónico: ventas con scope tenantId + filtro de fecha.
 * Solo retorna { total, createdAt } — los cálculos (heatmap por hora/día,
 * moving average 7d, peak hours, holidays) quedan en el route handler.
 */

export const AnalyticsSalesByDateDB = {
  /**
   * Ventas desde una fecha (since inclusive) — usado por heatmap +
   * ventas-tendencia + peak-hours (variante default).
   */
  async listSince(tenantId: string, since: Date) {
    return prisma.sale.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { total: true, createdAt: true },
    });
  },

  /**
   * Ventas con filtro de fecha custom (from/to opcionales) — usado por
   * peak-hours cuando vienen explícitos from/to vs days.
   */
  async listInRange(
    tenantId: string,
    range: { from?: Date; to?: Date },
  ) {
    const dateFilter: Record<string, Date> = {};
    if (range.from) dateFilter.gte = range.from;
    if (range.to) dateFilter.lte = range.to;

    return prisma.sale.findMany({
      where: {
        tenantId,
        ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
      },
      select: { total: true, createdAt: true },
    });
  },
};
