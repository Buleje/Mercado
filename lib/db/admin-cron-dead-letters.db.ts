import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/admin-cron-dead-letters.db.ts
 *
 * Audit project-wide 2026-05-19: centraliza acceso a CronDeadLetter para el
 * panel admin superadmin. CronDeadLetter es un modelo GLOBAL (sin tenantId)
 * por diseño — son logs de sistema, no datos de tenant. Requiere rol superadmin.
 *
 * Operaciones distintas a dlq.db.ts (que es para el dashboard superadmin DLQ):
 *  - listWithSummary: GET filtrado + groupBy en paralelo (panel admin DL)
 *  - deleteByIds: borrar entradas específicas por ID
 *  - deleteByJobName: borrar todas las entradas de un job
 */

export interface CronDeadLetterEntry {
  id: string;
  jobName: string;
  attempts: number;
  createdAt: Date;
  error: string;
}

export interface CronDeadLetterSummaryRow {
  jobName: string;
  failureCount: number;
}

export interface CronDeadLetterListResult {
  entries: CronDeadLetterEntry[];
  summary: CronDeadLetterSummaryRow[];
  total: number;
}

/**
 * Lista entradas de dead-letter con resumen de conteo por job.
 * jobName: filtro opcional. limit: máximo de entradas (cap 100).
 */
export async function listCronDeadLetters(
  jobName: string | null,
  limit: number,
): Promise<CronDeadLetterListResult> {
  const [entries, summary] = await Promise.all([
    prisma.cronDeadLetter.findMany({
      where: {
        ...(jobName ? { jobName } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.cronDeadLetter.groupBy({
      by: ["jobName"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);

  return {
    entries,
    summary: summary.map((s) => ({
      jobName: s.jobName,
      failureCount: s._count.id,
    })),
    total: entries.length,
  };
}

/**
 * Borra entradas por array de IDs. Retorna el conteo eliminado.
 *
 * CronDeadLetter es modelo PLATFORM-WIDE (no tiene tenantId field).
 * El acceso queda gated por `requireAdmin` con role guard en el endpoint
 * caller. Ver ADR-101: cross-tenant intentional para crons/webhooks.
 */
/* eslint-disable no-restricted-syntax */
// ADR-101: CronDeadLetter es modelo PLATFORM-WIDE sin tenantId field.
// Los deleteMany aquí no pueden incluir tenantId literal — el access queda
// gated por requireAdmin con role check en el endpoint caller.
export async function deleteCronDeadLettersByIds(ids: string[]): Promise<number> {
  try {
    const result = await prisma.cronDeadLetter.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  } catch (err) {
    logger.error("[admin-cron-dead-letters.db] deleteByIds failed", { error: String(err) });
    throw err;
  }
}

/**
 * Borra todas las entradas de un job específico. Retorna el conteo eliminado.
 *
 * CronDeadLetter es platform-wide (ver bloque eslint-disable arriba).
 */
export async function deleteCronDeadLettersByJobName(jobName: string): Promise<number> {
  try {
    const result = await prisma.cronDeadLetter.deleteMany({
      where: { jobName },
    });
    return result.count;
  } catch (err) {
    logger.error("[admin-cron-dead-letters.db] deleteByJobName failed", { error: String(err) });
    throw err;
  }
}
/* eslint-enable no-restricted-syntax */
