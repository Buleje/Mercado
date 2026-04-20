/**
 * lib/event-sourcing/in-memory-store.ts
 *
 * In-process EventStore implementation for unit tests and local dev.
 * NOT suitable for multi-process production use (no persistence).
 *
 * Thread safety: JavaScript is single-threaded, but async race conditions
 * are handled by the synchronous version-check pattern inside append().
 */

import { randomUUID } from "node:crypto";
import type { EventStore } from "./store";
import type {
  EventLogEntry,
  NewEventEntry,
  AggregateSnapshot,
  EventReducer,
  ListByTenantOptions,
} from "./types";
import {
  NewEventEntrySchema,
  ListByTenantOptionsSchema,
  OptimisticConcurrencyError,
} from "./types";

export class InMemoryEventStore implements EventStore {
  /** All events in insertion order */
  private readonly _log: EventLogEntry[] = [];

  // ── append ──────────────────────────────────────────────────────────────────

  async append(tenantId: string, entry: NewEventEntry): Promise<EventLogEntry> {
    const parsed = NewEventEntrySchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(
        `[InMemoryEventStore.append] Invalid entry: ${parsed.error.message}`,
      );
    }

    const { aggregateId, expectedVersion } = parsed.data;

    // Find the current max version for this aggregate (tenant-scoped)
    const currentVersion = this._currentVersion(tenantId, aggregateId);

    if (currentVersion !== expectedVersion) {
      throw new OptimisticConcurrencyError(
        aggregateId,
        expectedVersion,
        currentVersion,
      );
    }

    const record: EventLogEntry = {
      id: randomUUID(),
      tenantId,
      aggregateType: parsed.data.aggregateType,
      aggregateId,
      eventType: parsed.data.eventType,
      payload: parsed.data.payload,
      version: expectedVersion + 1,
      occurredAt: new Date(),
      actorId: parsed.data.actorId ?? null,
    };

    this._log.push(record);
    return record;
  }

  // ── loadAggregate ────────────────────────────────────────────────────────────

  async loadAggregate<TState>(
    tenantId: string,
    aggregateType: NewEventEntry["aggregateType"],
    aggregateId: string,
    reducer: EventReducer<TState>,
    initial: TState,
  ): Promise<AggregateSnapshot<TState>> {
    const events = this._log.filter(
      (e) =>
        e.tenantId === tenantId &&
        e.aggregateType === aggregateType &&
        e.aggregateId === aggregateId,
    );

    // Sort by version ASC (log is append-only but defensive sort is cheap)
    events.sort((a, b) => a.version - b.version);

    // Deep-clone initial to guarantee immutability of the caller's seed
    let state: TState = structuredClone(initial);
    for (const event of events) {
      state = reducer(state, event);
    }

    return {
      aggregateId,
      aggregateType,
      version: events.length > 0 ? events[events.length - 1].version : 0,
      state,
      events,
    };
  }

  // ── listByTenant ─────────────────────────────────────────────────────────────

  async listByTenant(
    tenantId: string,
    opts?: Partial<ListByTenantOptions>,
  ): Promise<EventLogEntry[]> {
    const parsed = ListByTenantOptionsSchema.safeParse(opts ?? {});
    if (!parsed.success) {
      throw new Error(
        `[InMemoryEventStore.listByTenant] Invalid opts: ${parsed.error.message}`,
      );
    }

    const { aggregateType, eventType, since, limit, offset } = parsed.data;

    const results = this._log.filter((e) => {
      if (e.tenantId !== tenantId) return false;
      if (aggregateType && e.aggregateType !== aggregateType) return false;
      if (eventType && e.eventType !== eventType) return false;
      if (since && e.occurredAt < since) return false;
      return true;
    });

    // Order: occurredAt ASC, version ASC
    results.sort((a, b) => {
      const dt = a.occurredAt.getTime() - b.occurredAt.getTime();
      return dt !== 0 ? dt : a.version - b.version;
    });

    return results.slice(offset, offset + limit);
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  /** Returns the current max version for (tenantId, aggregateId), or 0 */
  private _currentVersion(tenantId: string, aggregateId: string): number {
    let max = 0;
    for (const e of this._log) {
      if (e.tenantId === tenantId && e.aggregateId === aggregateId) {
        if (e.version > max) max = e.version;
      }
    }
    return max;
  }

  /** Test helper — reset all state */
  _reset(): void {
    this._log.length = 0;
  }

  /** Test helper — raw snapshot of all entries */
  _all(): EventLogEntry[] {
    return [...this._log];
  }
}
