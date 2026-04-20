/**
 * lib/event-sourcing/store.ts
 *
 * EventStore interface — the only public contract callers depend on.
 * Two implementations:
 *   - InMemoryStore  (in-memory-store.ts) — tests and local dev
 *   - PrismaStore    (prisma-store.ts)    — production, pending DB migration
 *
 * All methods enforce:
 *  - tenantId as FIRST parameter (multi-tenant isolation)
 *  - safeParse() validation on inputs
 *  - Optimistic concurrency via expectedVersion
 */

import type {
  EventLogEntry,
  NewEventEntry,
  AggregateSnapshot,
  EventReducer,
  ListByTenantOptions,
} from "./types";

export interface EventStore {
  /**
   * Append a new event to the log.
   *
   * Enforces sequential versioning:
   *  - Reads the current max version for (aggregateId)
   *  - If current max != entry.expectedVersion → throws OptimisticConcurrencyError
   *  - Otherwise writes at version expectedVersion + 1
   *
   * @param tenantId   Tenant scope — FIRST param always
   * @param entry      Validated NewEventEntry (use NewEventEntrySchema.safeParse)
   * @returns          The persisted EventLogEntry with assigned id and version
   */
  append(tenantId: string, entry: NewEventEntry): Promise<EventLogEntry>;

  /**
   * Replay all events for an aggregate through a reducer to produce a snapshot.
   *
   * @param tenantId       Tenant scope
   * @param aggregateType  "order" | "payment" | "stock"
   * @param aggregateId    ID of the aggregate root
   * @param reducer        Pure (state, event) => state function
   * @param initial        Seed state — NOT mutated
   * @returns              AggregateSnapshot with current state + version
   */
  loadAggregate<TState>(
    tenantId: string,
    aggregateType: NewEventEntry["aggregateType"],
    aggregateId: string,
    reducer: EventReducer<TState>,
    initial: TState,
  ): Promise<AggregateSnapshot<TState>>;

  /**
   * List events for a tenant with optional filters.
   * Results ordered by occurredAt ASC, then version ASC.
   *
   * @param tenantId   Tenant scope — FIRST param always
   * @param opts       Filter / pagination options
   */
  listByTenant(
    tenantId: string,
    opts?: Partial<ListByTenantOptions>,
  ): Promise<EventLogEntry[]>;
}
