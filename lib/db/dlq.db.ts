import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * lib/db/dlq.db.ts
 *
 * Audit P0 #5 (2026-05-19): Antes `app/superadmin/dlq/page.tsx` hacía 3
 * queries Prisma directas — violaba CLAUDE.md regla #1 ("Nunca prisma.*
 * directo — usar lib/db/*.db.ts"). Ahora vive acá.
 *
 * Las 3 fuentes del DLQ son cross-tenant por diseño (panel superadmin):
 *  - EventDeadLetter: tiene tenantId pero el panel muestra TODOS
 *  - CronDeadLetter: system-wide (no tenantId)
 *  - StripeWebhookQueue: mapeo via payload, sin tenantId
 *
 * No requiere `tenantId` 1er param porque NO es operación per-tenant —
 * es lectura platform-level legítima del superadmin.
 *
 * Limit hardcoded a 50 c/u: si hay más, el problema no es la UI sino
 * el bug raíz del handler/cron/webhook que se acumula. Brandon usa el
 * panel para detectar crecimiento sostenido.
 */

export interface EventDeadLetterRow {
  id: string;
  tenantId: string;
  eventType: string;
  handlerName: string;
  attemptCount: number;
  failedAt: Date;
  lastError: string;
}

export interface CronDeadLetterRow {
  id: string;
  jobName: string;
  attempts: number;
  createdAt: Date;
  error: string;
}

export interface MpWebhookRow {
  id: string;
  stripeId: string;
  eventType: string;
  attempts: number;
  createdAt: Date;
  lastError: string | null;
}

const DLQ_LIMIT = 50;

/**
 * Eventos de dominio que fallaron tras retries y no se autorrecuperaron.
 * Solo no-resueltos (resolvedAt IS NULL).
 */
export async function getEventDeadLetters(): Promise<EventDeadLetterRow[]> {
  try {
    return await prisma.eventDeadLetter.findMany({
      where: { resolvedAt: null },
      orderBy: { failedAt: "desc" },
      take: DLQ_LIMIT,
    });
  } catch (err) {
    logger.warn("[dlq.db] getEventDeadLetters failed", { error: String(err) });
    return [];
  }
}

/**
 * Cron jobs que llegaron a max-attempts y se rindieron.
 * No filtramos por resuelto/no-resuelto porque el modelo no lo tiene.
 */
export async function getCronDeadLetters(): Promise<CronDeadLetterRow[]> {
  try {
    return await prisma.cronDeadLetter.findMany({
      orderBy: { createdAt: "desc" },
      take: DLQ_LIMIT,
    });
  } catch (err) {
    logger.warn("[dlq.db] getCronDeadLetters failed", { error: String(err) });
    return [];
  }
}

/**
 * Webhooks de Mercado Pago pendientes de procesar.
 * Prefix `mpmkt_` los distingue de Stripe legítimo (que pasa por el mismo modelo
 * histórico StripeWebhookQueue). processedAt IS NULL = pendiente.
 */
export async function getMpPendingWebhooks(): Promise<MpWebhookRow[]> {
  try {
    return await prisma.stripeWebhookQueue.findMany({
      where: {
        stripeId: { startsWith: "mpmkt_" },
        processedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: DLQ_LIMIT,
    });
  } catch (err) {
    logger.warn("[dlq.db] getMpPendingWebhooks failed", { error: String(err) });
    return [];
  }
}

/**
 * Helper conveniente: trae las 3 fuentes en paralelo. Es lo que usa el
 * dashboard /superadmin/dlq.
 */
export async function getDeadLetterDashboard() {
  const [events, crons, mpWebhooks] = await Promise.all([
    getEventDeadLetters(),
    getCronDeadLetters(),
    getMpPendingWebhooks(),
  ]);
  return { events, crons, mpWebhooks };
}
