import "server-only";
import { NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * /api/cron/event-dlq-replay
 *
 * Brandon 2026-05-18 (audit profundo arquitectura Sprint 4):
 * Reintenta automáticamente eventos del Dead Letter Queue cuando
 * el handler probablemente ya está estable de nuevo (ej. Twilio que
 * volvió, Stripe que estuvo intermitente).
 *
 * Filtra:
 *   - resolvedAt: null (no procesados)
 *   - failedAt > 1h atrás (no inmediato — dar tiempo al servicio externo)
 *   - attemptCount < MAX_ATTEMPTS (5)
 *
 * Para cada uno:
 *   - Marca `attemptCount++`
 *   - Re-emite el evento via DomainEvents.publish() (BullMQ + handlers)
 *   - Si éxito → setea resolvedAt=now()
 *   - Si fail otra vez → lastError actualizado, queda para próximo replay
 *
 * Después de MAX_ATTEMPTS, queda visible en /superadmin/dlq como "rendido"
 * para que el equipo decida manualmente: descartar o intervenir.
 *
 * Cubre WhatsApp outbound (audit Sprint 2 #10), email Resend fallidos,
 * webhooks salientes y cualquier handler que llame DomainEvents.publish.
 *
 * Schedule: cada hora 37 minutos (entre crons existentes).
 */

const MAX_ATTEMPTS = 5;
const RETRY_AFTER_MS = 60 * 60 * 1000; // 1h
const BATCH_SIZE = 30;

async function handler() {
  const retryThreshold = new Date(Date.now() - RETRY_AFTER_MS);

   
  const pending = await prisma.eventDeadLetter.findMany({
    where: {
      resolvedAt: null,
      attemptCount: { lt: MAX_ATTEMPTS },
      failedAt: { lt: retryThreshold },
    },
    orderBy: { failedAt: "asc" },
    take: BATCH_SIZE,
  });

  if (pending.length === 0) {
    return NextResponse.json({
      retried: 0,
      message: "No DLQ events ready for retry",
    });
  }

  logger.info("[cron/event-dlq-replay] processing batch", { count: pending.length });

  let succeeded = 0;
  let stillFailing = 0;

  for (const entry of pending) {
    try {
      // Re-emit via emitDomainEvent — el handler original se ejecuta de nuevo.
      // Si tiene success ahora (servicio externo recuperado), el handler
      // termina sin lanzar excepción y nosotros marcamos resolvedAt.
      const { emitDomainEvent } = await import("@/lib/domain-events/domain-events");

       
      await emitDomainEvent({
        type: entry.eventType,
        tenantId: entry.tenantId,
        payload: {
          ...(entry.eventPayload as Record<string, unknown>),
          _replay: true,
          _replayAttempt: entry.attemptCount + 1,
        },
      } as any);

       
      await prisma.eventDeadLetter.update({
        where: { id: entry.id },
        data: {
          resolvedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
      succeeded++;
    } catch (err) {
      stillFailing++;
      const errMsg = err instanceof Error ? err.message : String(err);
       
      await prisma.eventDeadLetter
        .update({
          where: { id: entry.id },
          data: {
            attemptCount: { increment: 1 },
            lastError: errMsg.slice(0, 500),
          },
        })
        .catch((updateErr) =>
          logger.warn("[cron/event-dlq-replay] failed to record attempt", {
            id: entry.id,
            error: String(updateErr),
          }),
        );
    }
  }

  // Si después del replay siguen muchos pending = problema sistemático,
  // logueamos warn para que Brandon investigue.
  if (stillFailing > 5) {
    logger.warn("[cron/event-dlq-replay] high failure rate after replay", {
      retried: pending.length,
      succeeded,
      stillFailing,
    });
  }

  return NextResponse.json({
    retried: pending.length,
    succeeded,
    stillFailing,
    remaining: pending.length === BATCH_SIZE ? "possibly more — next run will catch up" : "all attempted",
  });
}

export const GET = withCronHealth("event-dlq-replay", handler);
