/**
 * lib/event-sourcing/types.ts
 *
 * Core Zod schemas and TypeScript types for the event sourcing layer.
 *
 * Design:
 *  - EventLogEntry  — a single immutable record persisted in DomainEventLog
 *  - NewEventEntry  — input shape for append() before version/id assignment
 *  - AggregateSnapshot<TState> — state rebuilt by replaying N events
 *
 * Rules:
 *  - All validation via safeParse() — never .parse()
 *  - tenantId is always present for multi-tenant isolation
 *  - payload is unknown at the base level; each reducer owns its cast
 */

import { z } from "zod";

// ── Aggregate types ────────────────────────────────────────────────────────────

export const AGGREGATE_TYPES = ["order", "payment", "stock"] as const;
export type AggregateType = (typeof AGGREGATE_TYPES)[number];

// ── EventLogEntry — persisted record ──────────────────────────────────────────

export const EventLogEntrySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  aggregateType: z.enum(AGGREGATE_TYPES),
  aggregateId: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
  occurredAt: z.date(),
  actorId: z.string().nullable().optional(),
});

export type EventLogEntry = z.infer<typeof EventLogEntrySchema>;

// ── NewEventEntry — input to append() ─────────────────────────────────────────

export const NewEventEntrySchema = z.object({
  tenantId: z.string().min(1),
  aggregateType: z.enum(AGGREGATE_TYPES),
  aggregateId: z.string().min(1),
  eventType: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  actorId: z.string().optional(),
  // expectedVersion: the caller declares what version the aggregate is at
  // BEFORE this event. The store appends at expectedVersion + 1.
  // Pass 0 when creating a new aggregate.
  expectedVersion: z.number().int().nonnegative(),
});

export type NewEventEntry = z.infer<typeof NewEventEntrySchema>;

// ── AggregateSnapshot ─────────────────────────────────────────────────────────

/**
 * The result of replaying all events for an aggregate via a reducer.
 *
 * @template TState  The domain state shape (e.g. OrderState, StockState)
 */
export interface AggregateSnapshot<TState> {
  aggregateId: string;
  aggregateType: AggregateType;
  version: number;       // version of the last applied event (0 = no events)
  state: TState;         // current reconstructed state
  events: EventLogEntry[]; // ordered event log used to build this snapshot
}

// ── Reducer type ──────────────────────────────────────────────────────────────

/**
 * Pure function: (currentState, event) => nextState
 * Must not mutate state — return a new object each time.
 */
export type EventReducer<TState> = (
  state: TState,
  event: EventLogEntry,
) => TState;

// ── ListByTenantOptions ───────────────────────────────────────────────────────

export const ListByTenantOptionsSchema = z.object({
  aggregateType: z.enum(AGGREGATE_TYPES).optional(),
  eventType: z.string().optional(),
  since: z.date().optional(),
  limit: z.number().int().positive().max(500).default(100),
  offset: z.number().int().nonnegative().default(0),
});

export type ListByTenantOptions = z.infer<typeof ListByTenantOptionsSchema>;

// ── Concurrency error ─────────────────────────────────────────────────────────

export class OptimisticConcurrencyError extends Error {
  constructor(
    public readonly aggregateId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `[EventStore] Concurrency conflict on aggregate "${aggregateId}": ` +
        `expected version ${expectedVersion}, actual ${actualVersion}.`,
    );
    this.name = "OptimisticConcurrencyError";
  }
}
