/**
 * lib/events/dlq/in-memory-dlq.ts
 *
 * Implementacion in-memory del DeadLetterQueue.
 * Uso: dev local y tests de Vitest.
 * NO usar en produccion — los datos no sobreviven reinicios.
 *
 * Caracteristicas:
 *   - FIFO bounded: desaloja la entrada mas antigua al llegar a MAX_SIZE
 *   - retryPending requiere que se inyecte un bus externamente via setRetryBus()
 */

import { randomUUID } from "node:crypto";
import type {
  DeadLetterQueue,
  DeadLetterEntry,
  DeadLetterEnqueueInput,
  RetryResult,
} from "./dlq";
import { DeadLetterEnqueueInputSchema } from "./dlq";
import type { DomainEvent } from "@/lib/events/types";
import { logger } from "@/lib/logger";

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_SIZE = 500;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LIST_LIMIT = 50;

// ─── Interface para bus inyectable ────────────────────────────────────────────

/** Subset minimo del EventBus que necesita InMemoryDLQ para retryPending. */
export interface RetryableBus {
  publish(event: DomainEvent): Promise<void>;
}

// ─── Implementacion ───────────────────────────────────────────────────────────

export class InMemoryDeadLetterQueue implements DeadLetterQueue {
  private readonly entries = new Map<string, DeadLetterEntry>();
  private readonly order: string[] = []; // mantiene insercion FIFO
  private bus: RetryableBus | null = null;

  constructor(private readonly maxSize: number = DEFAULT_MAX_SIZE) {}

  /**
   * Inyectar un bus para retryPending.
   * Separado del constructor para evitar dependencia circular.
   */
  setRetryBus(bus: RetryableBus): void {
    this.bus = bus;
  }

  async enqueue(input: DeadLetterEnqueueInput): Promise<void> {
    const parsed = DeadLetterEnqueueInputSchema.safeParse(input);
    if (!parsed.success) {
      logger.warn("[dlq/in-memory] enqueue — invalid input", {
        error: parsed.error.message,
      });
      return;
    }

    const { tenantId, event, handlerName, error } = parsed.data;
    const id = randomUUID();
    const now = new Date().toISOString();

    const entry: DeadLetterEntry = {
      id,
      tenantId,
      eventType: event.type,
      eventPayload: event as unknown as Record<string, unknown>,
      occurredAt: event.occurredAt,
      failedAt: now,
      attemptCount: 1,
      lastError: error,
      handlerName,
      resolvedAt: null,
    };

    // Eviccion FIFO si se supera el limite
    if (this.order.length >= this.maxSize) {
      const oldest = this.order.shift()!;
      this.entries.delete(oldest);
    }

    this.entries.set(id, entry);
    this.order.push(id);

    logger.info("[dlq/in-memory] enqueued", {
      id,
      tenantId,
      eventType: event.type,
      handlerName,
    });
  }

  async listUnresolved(
    tenantId: string,
    opts: { limit?: number; eventType?: string } = {},
  ): Promise<DeadLetterEntry[]> {
    const limit = Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, 200);

    const results: DeadLetterEntry[] = [];
    for (const id of this.order) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      if (entry.resolvedAt !== null) continue;
      if (entry.tenantId !== tenantId) continue;
      if (opts.eventType && entry.eventType !== opts.eventType) continue;
      results.push(entry);
      if (results.length >= limit) break;
    }
    return results;
  }

  async markResolved(id: string, reason?: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      logger.warn("[dlq/in-memory] markResolved — id not found", { id });
      return;
    }
    this.entries.set(id, {
      ...entry,
      resolvedAt: new Date().toISOString(),
      lastError: reason ? `${entry.lastError} | resolved: ${reason}` : entry.lastError,
    });
  }

  async retryPending(
    tenantId: string,
    opts: { maxAttempts?: number } = {},
  ): Promise<RetryResult> {
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const result: RetryResult = { retried: 0, succeeded: 0, failed: 0, exhausted: 0 };

    if (!this.bus) {
      logger.warn("[dlq/in-memory] retryPending — no bus injected, use setRetryBus()");
      return result;
    }

    // Snapshot para no iterar sobre entries que se modifiquen durante el retry
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
        const updated = this.entries.get(entry.id);
        if (updated) {
          this.entries.set(entry.id, {
            ...updated,
            attemptCount: updated.attemptCount + 1,
            lastError: String(err),
          });
        }
        result.failed++;
        logger.warn("[dlq/in-memory] retry failed", {
          id: entry.id,
          attemptCount: (updated?.attemptCount ?? entry.attemptCount) + 1,
          error: String(err),
        });
      }
    }

    return result;
  }

  /** Solo para tests — acceso directo al store interno. */
  _getAll(): DeadLetterEntry[] {
    return [...this.entries.values()];
  }

  /** Solo para tests — limpia el estado. */
  _clear(): void {
    this.entries.clear();
    this.order.length = 0;
  }
}
