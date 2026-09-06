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

const MAX_ATTEMPTS = 5; // igual que el cron event-dlq-replay

export interface EventDlqStats {
  unresolved: number;
  nearMax: number; // attemptCount >= MAX-1 → casi sin reintentos
  oldestFailedAt: string | null;
  byHandler: { handler: string; count: number }[];
  byEventType: { eventType: string; count: number }[];
}

/** Resumen de triage del DLQ de eventos (solo no-resueltos). */
export async function getEventDlqStats(): Promise<EventDlqStats> {
  try {
    const [unresolved, nearMax, oldest, byHandler, byEventType] = await Promise.all([
      prisma.eventDeadLetter.count({ where: { resolvedAt: null } }),
      prisma.eventDeadLetter.count({ where: { resolvedAt: null, attemptCount: { gte: MAX_ATTEMPTS - 1 } } }),
      prisma.eventDeadLetter.findFirst({ where: { resolvedAt: null }, orderBy: { failedAt: "asc" }, select: { failedAt: true } }),
      prisma.eventDeadLetter.groupBy({ by: ["handlerName"], where: { resolvedAt: null }, _count: { _all: true }, orderBy: { _count: { handlerName: "desc" } }, take: 8 }),
      prisma.eventDeadLetter.groupBy({ by: ["eventType"], where: { resolvedAt: null }, _count: { _all: true }, orderBy: { _count: { eventType: "desc" } }, take: 8 }),
    ]);
    return {
      unresolved,
      nearMax,
      oldestFailedAt: oldest?.failedAt.toISOString() ?? null,
      byHandler: byHandler.map((h) => ({ handler: h.handlerName, count: h._count._all })),
      byEventType: byEventType.map((e) => ({ eventType: e.eventType, count: e._count._all })),
    };
  } catch (err) {
    logger.warn("[dlq.db] getEventDlqStats failed", { error: String(err) });
    return { unresolved: 0, nearMax: 0, oldestFailedAt: null, byHandler: [], byEventType: [] };
  }
}

/** Marca un evento del DLQ como resuelto manualmente (sin reintentar). */
export async function resolveEventDeadLetter(id: string): Promise<boolean> {
  try {
    await prisma.eventDeadLetter.update({ where: { id }, data: { resolvedAt: new Date() } });
    return true;
  } catch (err) {
    logger.warn("[dlq.db] resolveEventDeadLetter failed", { id, error: String(err) });
    return false;
  }
}

/**
 * Reintenta UN evento del DLQ: re-emite el evento original (el handler corre de
 * nuevo). Si tiene éxito → resolvedAt=now. Misma mecánica que el cron de replay,
 * pero por-entry desde el panel.
 */
export async function retryEventDeadLetter(id: string): Promise<{ ok: boolean; resolved: boolean; error?: string }> {
  const evt = await prisma.eventDeadLetter.findUnique({ where: { id } });
  if (!evt) return { ok: false, resolved: false, error: "No encontrado" };
  if (evt.resolvedAt) return { ok: false, resolved: true, error: "Ya estaba resuelto" };
  try {
    const { emitDomainEvent } = await import("@/lib/domain-events/domain-events");
    const payload = { ...(evt.eventPayload as Record<string, unknown>), _replay: true, _replayAttempt: evt.attemptCount + 1 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- emitDomainEvent acepta DomainEvent dinámico
    await emitDomainEvent({ type: evt.eventType, tenantId: evt.tenantId, payload } as any);
    await prisma.eventDeadLetter.update({ where: { id }, data: { resolvedAt: new Date(), attemptCount: { increment: 1 } } });
    return { ok: true, resolved: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.eventDeadLetter
      .update({ where: { id }, data: { attemptCount: { increment: 1 }, lastError: msg.slice(0, 500) } })
      .catch((uErr) => logger.error("[dlq.db] retry: update tras fallo falló", { id, error: String(uErr) }));
    return { ok: true, resolved: false, error: msg };
  }
}
