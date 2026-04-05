/**
 * lib/db/forecasting.db.ts
 *
 * DB class para el modelo ForecastLog.
 * Sigue el patrón del proyecto: nunca Prisma directo en los route handlers,
 * siempre a través de esta clase con tenantId en todas las queries.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { ForecastLog as PForecastLog } from "@/lib/generated/prisma/client";

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type DbForecastLog = {
  id: string;
  tenantId: string;
  productId: number;
  predictedQty: number;
  actualQty: number | null;
  confidence: number;
  trend: string;
  daysAhead: number;
  forecastDate: string;
};

export type CreateForecastLogInput = Omit<DbForecastLog, "id" | "forecastDate" | "actualQty">;

// ── Mapper ────────────────────────────────────────────────────────────────────

function mapForecastLog(row: PForecastLog): DbForecastLog {
  return {
    id: row.id,
    tenantId: row.tenantId,
    productId: row.productId,
    predictedQty: row.predictedQty,
    actualQty: row.actualQty ?? null,
    confidence: row.confidence,
    trend: row.trend,
    daysAhead: row.daysAhead,
    forecastDate: row.forecastDate.toISOString(),
  };
}

// ── ForecastingDB ─────────────────────────────────────────────────────────────

export const ForecastingDB = {
  /**
   * Crea un nuevo registro de predicción.
   */
  async create(input: CreateForecastLogInput): Promise<DbForecastLog> {
    const row = await prisma.forecastLog.create({
      data: {
        tenantId: input.tenantId,
        productId: input.productId,
        predictedQty: input.predictedQty,
        confidence: input.confidence,
        trend: input.trend,
        daysAhead: input.daysAhead,
      },
    });
    return mapForecastLog(row);
  },

  /**
   * Crea múltiples registros en una sola transacción (útil para cron bulk).
   */
  async createMany(inputs: CreateForecastLogInput[]): Promise<{ count: number }> {
    const result = await prisma.forecastLog.createMany({
      data: inputs.map((i) => ({
        tenantId: i.tenantId,
        productId: i.productId,
        predictedQty: i.predictedQty,
        confidence: i.confidence,
        trend: i.trend,
        daysAhead: i.daysAhead,
      })),
      skipDuplicates: false,
    });
    return { count: result.count };
  },

  /**
   * Obtiene el historial de predicciones para un producto específico.
   */
  async getByProduct(
    tenantId: string,
    productId: number,
    limit = 30,
  ): Promise<DbForecastLog[]> {
    const rows = await prisma.forecastLog.findMany({
      where: { tenantId, productId },
      orderBy: { forecastDate: "desc" },
      take: limit,
    });
    return rows.map(mapForecastLog);
  },

  /**
   * Obtiene el último log de predicción para cada producto del tenant.
   * Útil para el dashboard de forecasting.
   */
  async getLatestPerProduct(tenantId: string): Promise<DbForecastLog[]> {
    // Subconsulta: max forecastDate por (tenantId, productId)
    const latest = await prisma.forecastLog.findMany({
      where: { tenantId },
      orderBy: { forecastDate: "desc" },
      distinct: ["productId"],
    });
    return latest.map(mapForecastLog);
  },

  /**
   * Actualiza el qty real (para medir accuracy después de que pasen los días).
   */
  async updateActualQty(id: string, actualQty: number): Promise<DbForecastLog | null> {
    try {
      const row = await prisma.forecastLog.update({
        where: { id },
        data: { actualQty },
      });
      return mapForecastLog(row);
    } catch {
      return null;
    }
  },

  /**
   * Elimina logs más antiguos de N días (limpieza periódica).
   * Retiene al menos los últimos 90 días de historia.
   */
  async cleanup(tenantId: string, olderThanDays = 90): Promise<{ deleted: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await prisma.forecastLog.deleteMany({
      where: { tenantId, forecastDate: { lt: cutoff } },
    });
    return { deleted: result.count };
  },
};
