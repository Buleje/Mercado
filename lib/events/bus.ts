/**
 * lib/events/bus.ts
 *
 * EventBus — the central pub/sub hub.
 * Delegates transport to an injected EventTransport (default: InMemoryTransport).
 *
 * Dead-letter queue (DLQ):
 *   When a handler throws, the failed delivery is captured in an in-memory DLQ
 *   array. The DLQ is bounded to MAX_DLQ_SIZE (100) — oldest entries are evicted
 *   on overflow. Useful for debugging in dev; in production wire a real DLQ via
 *   the transport adapter.
 *
 * Logging:
 *   Every publish and handler failure is logged via lib/logger so the activity
 *   stream reflects event flow without needing Prisma.
 */

import { logger } from "@/lib/logger";
import type { DomainEvent } from "./types";
import { createTransport, type EventTransport, type Unsubscribe } from "./adapter";

// ─── Dead-Letter Queue ────────────────────────────────────────────────────────

export interface DLQEntry {
  event: DomainEvent;
  handlerName: string;
  error: string;
  failedAt: string;
}

const MAX_DLQ_SIZE = 100;

// ─── EventBus ─────────────────────────────────────────────────────────────────

export class EventBus {
  private transport: EventTransport;
  private dlq: DLQEntry[] = [];

  constructor(transport?: EventTransport) {
    this.transport = transport ?? createTransport();
  }

  /**
   * Subscribe to events of a specific type.
   * The handler receives a strongly-typed event (Extract narrows the union).
   *
   * @returns Unsubscribe function — call it to stop receiving events.
   */
  subscribe<T extends DomainEvent["type"]>(
    type: T,
    handler: (evt: Extract<DomainEvent, { type: T }>) => Promise<void>,
  ): Unsubscribe {
    const name = handler.name || "(anonymous)";
    logger.info("[events/bus] subscribe", { type, handler: name });

    // Wrap the handler so every failure is captured in DLQ + logged without
    // propagating — Promise.allSettled in InMemoryTransport handles the rest.
    const wrapped = async (evt: Extract<DomainEvent, { type: T }>) => {
      try {
        await handler(evt);
      } catch (err) {
        const entry: DLQEntry = {
          event: evt,
          handlerName: name,
          error: String(err),
          failedAt: new Date().toISOString(),
        };
        this.pushToDLQ(entry);
        logger.error("[events/bus] handler failed — added to DLQ", {
          type: evt.type,
          tenantId: evt.tenantId,
          handler: name,
          error: String(err),
        });
        throw err; // re-throw so Promise.allSettled captures it as rejected
      }
    };

    return this.transport.subscribe(type, wrapped);
  }

  /**
   * Publish an event to all registered handlers of the matching type.
   *
   * Behavior:
   * - Logs the publication (tenantId, type, occurredAt)
   * - Calls all matching handlers in parallel via Promise.allSettled
   * - A failing handler NEVER blocks other handlers or the caller
   * - Logs each individual failure with the handler name
   *
   * This function never throws.
   */
  async publish(event: DomainEvent): Promise<void> {
    logger.info("[events/bus] publish", {
      type: event.type,
      tenantId: event.tenantId,
      occurredAt: event.occurredAt,
    });

    try {
      await this.transport.publish(event);
    } catch (err) {
      // Transport itself failed (e.g. VercelQueuesTransport not yet implemented).
      // Log and swallow — callers must not be broken by infra issues.
      logger.error("[events/bus] transport.publish failed", {
        type: event.type,
        tenantId: event.tenantId,
        error: String(err),
      });
    }
  }

  // ─── Dead-Letter Queue accessors ────────────────────────────────────────────

  /** Returns a snapshot of the dead-letter queue (newest last). */
  getDLQ(): readonly DLQEntry[] {
    return this.dlq;
  }

  /** Drain and return all DLQ entries, clearing the queue. */
  drainDLQ(): DLQEntry[] {
    const entries = [...this.dlq];
    this.dlq = [];
    return entries;
  }

  private pushToDLQ(entry: DLQEntry): void {
    if (this.dlq.length >= MAX_DLQ_SIZE) {
      this.dlq.shift(); // evict oldest
    }
    this.dlq.push(entry);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

/**
 * Global EventBus singleton.
 * Import this in any server-side module that needs to publish or subscribe.
 *
 * The transport is selected from EVENT_TRANSPORT env var (default: "memory").
 * To use a different transport in tests, construct a new EventBus(transport).
 */
export const eventBus = new EventBus();
