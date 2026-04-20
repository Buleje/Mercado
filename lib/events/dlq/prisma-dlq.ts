/**
 * lib/events/dlq/prisma-dlq.ts
 *
 * Implementacion Prisma del DeadLetterQueue — produccion.
 *
 * REQUIERE migration: 20260420_add_event_dead_letter
 * Hasta que la migration se ejecute, las lineas de acceso al delegate
 * usan @ts-expect-error para que el resto del modulo compile limpio.
 *
 * Instrucciones de activacion:
 *   1. Pegar el modelo de SCHEMA-PROPOSAL.prisma en prisma/schema.prisma
 *   2. Correr:  DATABASE_URL="$DIRECT_URL" npx prisma migrate dev --name add_event_dead_letter
 *   3. Quitar los comentarios @ts-expect-error de este archivo
 */

import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import type {
  DeadLetterQueue,
  DeadLetterEntry,
  DeadLetterEnqueueInput,
  RetryResult,
} from "./dlq";
import { DeadLetterEnqueueInputSchema } from "./dlq";
import type { DomainEvent } from "@/lib/events/types";

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LIST_LIMIT = 50;

// ─── Tipo local para la fila Prisma (espejea el modelo propuesto) ─────────────
// Una vez generado el cliente, este tipo viene de @prisma/client automáticamente.

type PrismaEventDeadLetter = {
  id: string;
  tenantId: string;
  eventType: string;
  eventPayload: unknown;
  occurredAt: Date;
  failedAt: Date;
  attemptCount: number;
  lastError: string;
  handlerName: string;
  resolvedAt: Date | null;
};

// ─── Mapper Prisma → DeadLetterEntry ─────────────────────────────────────────

function mapRow(row: PrismaEventDeadLetter): DeadLetterEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    eventType: row.eventType,
    eventPayload: row.eventPayload as Record<string, unknown>,
    occurredAt: row.occurredAt.toISOString(),
    failedAt: row.failedAt.toISOString(),
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    handlerName: row.handlerName,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

// ─── Implementacion ───────────────────────────────────────────────────────────

/** Subset minimo del EventBus que necesita PrismaDLQ para retryPending. */
export interface RetryableBus {
  publish(event: DomainEvent): Promise<void>;
}

export class PrismaDeadLetterQueue implements DeadLetterQueue {
  private bus: RetryableBus | null = null;

  constructor() {}

  setRetryBus(bus: RetryableBus): void {
    this.bus = bus;
  }

  async enqueue(input: DeadLetterEnqueueInput): Promise<void> {
    const parsed = DeadLetterEnqueueInputSchema.safeParse(input);
    if (!parsed.success) {
      logger.warn("[dlq/prisma] enqueue — invalid input", {
        error: parsed.error.message,
      });
      return;
    }

    const { tenantId, event, handlerName, error } = parsed.data;

    try {
      // @ts-expect-error pending migration 20260420_add_event_dead_letter
      await prisma.eventDeadLetter.create({
        data: {
          id: randomUUID(),
          tenantId,
          eventType: event.type,
          eventPayload: event as unknown as Record<string, unknown>,
          occurredAt: new Date(event.occurredAt),
          failedAt: new Date(),
          attemptCount: 1,
          lastError: error,
          handlerName,
        },
      });

      logger.info("[dlq/prisma] enqueued", {
        tenantId,
        eventType: event.type,
        handlerName,
      });
    } catch (err) {
      // Fire-and-forget safe — nunca propagar el error del DLQ al caller
      logger.error("[dlq/prisma] enqueue failed", { error: String(err) });
    }
  }

  async listUnresolved(
    tenantId: string,
    opts: { limit?: number; eventType?: string } = {},
  ): Promise<DeadLetterEntry[]> {
    const limit = Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, 200);

    try {
      // @ts-expect-error pending migration 20260420_add_event_dead_letter
      const rows: PrismaEventDeadLetter[] = await prisma.eventDeadLetter.findMany({
        where: {
          tenantId,
          resolvedAt: null,
          ...(opts.eventType ? { eventType: opts.eventType } : {}),
        },
        orderBy: { failedAt: "asc" },
        take: limit,
      });

      return rows.map(mapRow);
    } catch (err) {
      logger.error("[dlq/prisma] listUnresolved failed", { error: String(err) });
      return [];
    }
  }

  async markResolved(id: string, reason?: string): Promise<void> {
    try {
      // @ts-expect-error pending migration 20260420_add_event_dead_letter
      const current: PrismaEventDeadLetter | null = await prisma.eventDeadLetter.findUnique({
        where: { id },
      });

      if (!current) {
        logger.warn("[dlq/prisma] markResolved — id not found", { id });
        return;
      }

      const lastError = reason
        ? `${current.lastError} | resolved: ${reason}`
        : current.lastError;

      // @ts-expect-error pending migration 20260420_add_event_dead_letter
      await prisma.eventDeadLetter.update({
        where: { id },
        data: {
          resolvedAt: new Date(),
          lastError,
        },
      });
    } catch (err) {
      logger.error("[dlq/prisma] markResolved failed", { id, error: String(err) });
    }
  }

  async retryPending(
    tenantId: string,
    opts: { maxAttempts?: number } = {},
  ): Promise<RetryResult> {
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const result: RetryResult = { retried: 0, succeeded: 0, failed: 0, exhausted: 0 };

    if (!this.bus) {
      logger.warn("[dlq/prisma] retryPending — no bus injected, use setRetryBus()");
      return result;
    }

    const candidates = await this.listUnresolved(tenantId, { limit: 200 });

    for (const entry of candidates) {
      if (entry.attemptCount >= maxAttempts) {
        await this.markResolved(entry.id, "max attempts exceeded");
        result.exhausted++;
        continue;
      }

      result.retried++;
      try {
        const event = entry.eventPayload as unknown as DomainEvent;
        await this.bus.publish(event);
        await this.markResolved(entry.id, "retry succeeded");
        result.succeeded++;
      } catch (err) {
        try {
          // @ts-expect-error pending migration 20260420_add_event_dead_letter
          await prisma.eventDeadLetter.update({
            where: { id: entry.id },
            data: {
              attemptCount: { increment: 1 },
              lastError: String(err),
            },
          });
        } catch (updateErr) {
          logger.error("[dlq/prisma] failed to increment attemptCount", {
            id: entry.id,
            error: String(updateErr),
          });
        }
        result.failed++;
        logger.warn("[dlq/prisma] retry failed", {
          id: entry.id,
          newAttemptCount: entry.attemptCount + 1,
          error: String(err),
        });
      }
    }

    return result;
  }
}
