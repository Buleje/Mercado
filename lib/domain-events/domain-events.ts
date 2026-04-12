/**
 * lib/domain-events/domain-events.ts
 *
 * Domain events for Buleje ERP — Event-Driven Architecture.
 * NOTE: lib/events.ts (sin "domain-") es el sistema de CustomEvents del DOM
 * para el storefront — son conceptos diferentes. Este módulo es server-only.
 *
 * These are **business-level events** that represent something important
 * happening in the domain (not infrastructure events like "job enqueued").
 *
 * Each event is emitted after a successful write in a DB class, and consumed
 * asynchronously by subscribers via BullMQ queues.
 *
 * Contract: events are **at-least-once delivery** — subscribers MUST be idempotent.
 *
 * See ADR 007 for the architecture decision.
 *
 * Usage (emitter):
 * ```ts
 * await emitDomainEvent({
 *   type: "VentaCompletada",
 *   tenantId,
 *   payload: { orderId, total, itemCount },
 * });
 * ```
 *
 * Usage (subscriber — in a worker):
 * ```ts
 * onDomainEvent("VentaCompletada", async (event) => {
 *   await sendInvoiceEmail(event.payload.orderId);
 * });
 * ```
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import { getQueueConnection } from "@/lib/queue/connection";

// ─── Event Types ──────────────────────────────────────────────────────────────

/**
 * Base shape all domain events share. Every event carries:
 * - `id`: unique UUID for idempotency tracking in subscribers
 * - `type`: discriminator for pattern matching
 * - `tenantId`: multi-tenant scope (NEVER cross-tenant)
 * - `occurredAt`: ISO timestamp of when the event happened
 * - `payload`: event-specific data (typed per event)
 */
interface BaseDomainEvent<TType extends string, TPayload> {
  id: string;
  type: TType;
  tenantId: string;
  occurredAt: string;
  payload: TPayload;
}

// ─── Specific Events ──────────────────────────────────────────────────────────

/** A sale/order was fully completed (paid, confirmed, delivered). */
export type VentaCompletadaEvent = BaseDomainEvent<
  "VentaCompletada",
  {
    orderId: string;
    customerId?: string;
    customerPhone: string;
    total: number;
    itemCount: number;
    paymentMethod: string;
    /** Whether the order had a coupon applied */
    hadCoupon: boolean;
    /** Whether delivery was requested */
    isDelivery: boolean;
  }
>;

/** A product's stock dropped below its `stockMin` threshold. */
export type StockBajoEvent = BaseDomainEvent<
  "StockBajo",
  {
    productId: number;
    productName: string;
    currentStock: number;
    stockMin: number;
    /** How many units were just deducted */
    lastDeduction: number;
    /** Context that caused the deduction */
    reason: "venta" | "ajuste" | "merma" | "transferencia";
  }
>;

/** An electronic invoice was issued successfully (SUNAT OK). */
export type FacturaEmitidaEvent = BaseDomainEvent<
  "FacturaEmitida",
  {
    facturaId: string;
    orderId: string;
    customerDocument: string;
    customerName: string;
    documentType: "factura" | "boleta" | "nota_credito";
    total: number;
    /** XML hash from SUNAT response */
    sunatHash?: string;
    /** CDR (Constancia de Recepción) — may arrive later in a separate event */
    cdrUrl?: string;
  }
>;

/** Discriminated union of all domain events. Add new events here. */
export type DomainEvent = VentaCompletadaEvent | StockBajoEvent | FacturaEmitidaEvent;

/** Extract the payload type for a given event type. */
export type DomainEventPayload<T extends DomainEvent["type"]> = Extract<
  DomainEvent,
  { type: T }
>["payload"];

// ─── Event Bus (BullMQ-backed) ────────────────────────────────────────────────

/**
 * All domain events share a single BullMQ queue. Subscribers filter by `type`
 * inside their worker. This keeps ordering per-tenant best-effort and avoids
 * queue-explosion as we add more event types.
 */
export const DOMAIN_EVENTS_QUEUE = "domain-events";

/** Lazy-loaded BullMQ Queue instance for the domain events topic. */
type BullQueue = {
  add(name: string, data: unknown): Promise<{ id?: string }>;
};

let _domainEventsQueue: BullQueue | null = null;

function getDomainEventsQueue(): BullQueue | null {
  if (_domainEventsQueue) return _domainEventsQueue;
  const connection = getQueueConnection();
  if (!connection) return null;
  try {
    const runtimeRequire = globalThis.Function("return require")() as (
      id: string
    ) => unknown;
    const { Queue } = runtimeRequire("bullmq") as {
      Queue: new (name: string, opts: unknown) => BullQueue;
    };
    _domainEventsQueue = new Queue(DOMAIN_EVENTS_QUEUE, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 10000 },
      },
    });
    logger.info("[events] Domain events queue initialized");
    return _domainEventsQueue;
  } catch {
    logger.warn("[events] bullmq not available — domain events running in-memory only");
    return null;
  }
}

// ─── In-memory subscribers (fallback when Redis is unavailable) ───────────────

type EventHandler<T extends DomainEvent["type"]> = (
  event: Extract<DomainEvent, { type: T }>
) => Promise<void> | void;

// Erase the type parameter at the storage boundary — callers use the typed
// onDomainEvent<T> helper which narrows on the way in and out.
type AnyEventHandler = (event: DomainEvent) => Promise<void> | void;

const localSubscribers = new Map<DomainEvent["type"], Set<AnyEventHandler>>();

/**
 * Register an in-memory subscriber. Use this ONLY for lightweight reactions
 * (cache invalidation, local counters). Heavy work must live in a BullMQ
 * worker consuming the `domain-events` queue.
 */
export function onDomainEvent<T extends DomainEvent["type"]>(
  type: T,
  handler: EventHandler<T>
): () => void {
  const set = localSubscribers.get(type) ?? new Set<AnyEventHandler>();
  set.add(handler as unknown as AnyEventHandler);
  localSubscribers.set(type, set);
  return () => set.delete(handler as unknown as AnyEventHandler);
}

/**
 * Emit a domain event. Call from DB classes AFTER a successful write.
 *
 * Behavior:
 * 1. Enqueue to BullMQ for durable async processing (if Redis available).
 * 2. Fire in-memory subscribers synchronously (fire-and-forget, best-effort).
 *
 * This function never throws — events must not break the happy path of writes.
 */
export async function emitDomainEvent<TEvent extends DomainEvent>(
  partial: Omit<TEvent, "id" | "occurredAt">
): Promise<void> {
  const event = {
    ...partial,
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
  } as TEvent;

  // 1. Durable path — BullMQ
  try {
    const queue = getDomainEventsQueue();
    if (queue) {
      await queue.add(event.type, event);
    }
  } catch (err) {
    logger.error("[events] Failed to enqueue domain event", {
      type: event.type,
      error: String(err),
    });
  }

  // 2. Local path — in-memory subscribers (cache invalidation, etc.)
  const handlers = localSubscribers.get(event.type);
  if (handlers) {
    for (const handler of handlers) {
      Promise.resolve()
        .then(() => handler(event))
        .catch((err) => {
          logger.error("[events] Local subscriber failed", {
            type: event.type,
            error: String(err),
          });
        });
    }
  }
}

// ─── Typed helpers per event (optional — nicer call sites) ────────────────────

export const DomainEvents = {
  ventaCompletada(
    tenantId: string,
    payload: DomainEventPayload<"VentaCompletada">
  ): Promise<void> {
    return emitDomainEvent<VentaCompletadaEvent>({
      type: "VentaCompletada",
      tenantId,
      payload,
    });
  },

  stockBajo(tenantId: string, payload: DomainEventPayload<"StockBajo">): Promise<void> {
    return emitDomainEvent<StockBajoEvent>({
      type: "StockBajo",
      tenantId,
      payload,
    });
  },

  facturaEmitida(
    tenantId: string,
    payload: DomainEventPayload<"FacturaEmitida">
  ): Promise<void> {
    return emitDomainEvent<FacturaEmitidaEvent>({
      type: "FacturaEmitida",
      tenantId,
      payload,
    });
  },
} as const;
