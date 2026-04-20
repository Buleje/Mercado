/**
 * lib/events/adapter.ts
 *
 * Swappable transport layer for EventBus.
 * Selected at runtime via EVENT_TRANSPORT env var (default: "memory").
 *
 * To add a new transport:
 * 1. Implement EventTransport
 * 2. Add a case in createTransport()
 * 3. Add the value to the env var docs in lib/env.ts
 */

import type { DomainEvent } from "./types";

export type Unsubscribe = () => void;

// ─── Interface ────────────────────────────────────────────────────────────────

/**
 * Transport contract. Both InMemory and external transports (Vercel Queues,
 * SQS, etc.) implement this interface so EventBus has no coupling to infra.
 */
export interface EventTransport {
  /**
   * Publish a single event. Must never throw — callers rely on fire-and-forget.
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Register a typed handler for a specific event type.
   * Returns an unsubscribe function.
   */
  subscribe<T extends DomainEvent["type"]>(
    type: T,
    handler: (evt: Extract<DomainEvent, { type: T }>) => Promise<void>,
  ): Unsubscribe;
}

// ─── InMemoryTransport ────────────────────────────────────────────────────────

type AnyHandler = (evt: DomainEvent) => Promise<void>;

/**
 * Default transport: all pub/sub happens in the same Node.js process.
 * Suitable for development and serverless warm-instance scenarios.
 * State is per-process — no cross-instance delivery.
 */
export class InMemoryTransport implements EventTransport {
  private handlers = new Map<DomainEvent["type"], Set<AnyHandler>>();

  subscribe<T extends DomainEvent["type"]>(
    type: T,
    handler: (evt: Extract<DomainEvent, { type: T }>) => Promise<void>,
  ): Unsubscribe {
    const set = this.handlers.get(type) ?? new Set<AnyHandler>();
    const typed = handler as unknown as AnyHandler;
    set.add(typed);
    this.handlers.set(type, set);
    return () => set.delete(typed);
  }

  async publish(event: DomainEvent): Promise<void> {
    const set = this.handlers.get(event.type);
    if (!set || set.size === 0) return;
    // Deliver synchronously (callers await publish; handlers run inline)
    await Promise.allSettled([...set].map((h) => h(event)));
  }

  /** Expose internal handler count — useful in tests. */
  handlerCount(type: DomainEvent["type"]): number {
    return this.handlers.get(type)?.size ?? 0;
  }
}

// ─── VercelQueuesTransport (STUB) ─────────────────────────────────────────────

/**
 * Stub for Vercel Queues (currently in beta).
 * Swap InMemoryTransport for this when @vercel/queues is stable.
 *
 * TODO: @vercel/queues beta — replace stub with real implementation:
 *   import { Queue } from "@vercel/queues";
 *   const queue = new Queue("domain-events");
 *   await queue.sendMessage({ body: event });
 */
export class VercelQueuesTransport implements EventTransport {
  subscribe<T extends DomainEvent["type"]>(
    _type: T,
    _handler: (evt: Extract<DomainEvent, { type: T }>) => Promise<void>,
  ): Unsubscribe {
    // TODO: @vercel/queues beta — register webhook endpoint as consumer
    throw new Error("[VercelQueuesTransport] not implemented — @vercel/queues is in beta");
  }

  async publish(_event: DomainEvent): Promise<void> {
    // TODO: @vercel/queues beta — await queue.sendMessage({ body: _event });
    throw new Error("[VercelQueuesTransport] not implemented — @vercel/queues is in beta");
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a transport based on the EVENT_TRANSPORT env var.
 * Default: "memory". Falls back to memory on unknown values.
 */
export function createTransport(): EventTransport {
  const raw = process.env.EVENT_TRANSPORT ?? "memory";
  switch (raw) {
    case "queues":
      return new VercelQueuesTransport();
    case "memory":
    default:
      return new InMemoryTransport();
  }
}
