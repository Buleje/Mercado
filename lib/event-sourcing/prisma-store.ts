/**
 * lib/event-sourcing/prisma-store.ts
 *
 * Production EventStore backed by Prisma + Supabase PostgreSQL.
 *
 * STATUS: pending schema migration 20260420_add_domain_event_log
 *
 * Optimistic concurrency is enforced at two levels:
 *  1. Application-level check inside a Prisma $transaction
 *  2. DB-level: @@unique([aggregateId, version]) → Prisma throws P2002 on race
 *
 * Usage (after migration is applied and types are generated):
 *
 *   import { PrismaEventStore } from "@/lib/event-sourcing/prisma-store";
 *   import { prisma } from "@/lib/prisma";
 *   export const eventStore = new PrismaEventStore(prisma);
 */

import "server-only";
import { prisma } from "@/lib/prisma";
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

// Alias to a permissive type — DomainEventLog is not in the generated client yet.
// Remove once migration 20260420_add_domain_event_log has been applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClientPending = typeof prisma & Record<string, any>;

export class PrismaEventStore implements EventStore {
  private readonly db: PrismaClientPending;

  constructor(db: typeof prisma) {
    this.db = db as PrismaClientPending;
  }

  // ── append ──────────────────────────────────────────────────────────────────

  async append(tenantId: string, entry: NewEventEntry): Promise<EventLogEntry> {
    const parsed = NewEventEntrySchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(
        `[PrismaEventStore.append] Invalid entry: ${parsed.error.message}`,
      );
    }

    const { aggregateId, expectedVersion } = parsed.data;

    // Use a transaction to atomically check + insert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = await this.db.$transaction(async (tx: any) => {
      // Read current max version
      const existing = await tx.domainEventLog.findFirst({
        where: { tenantId, aggregateId },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      const currentVersion: number = existing?.version ?? 0;

      if (currentVersion !== expectedVersion) {
        throw new OptimisticConcurrencyError(
          aggregateId,
          expectedVersion,
          currentVersion,
        );
      }

      return tx.domainEventLog.create({
        data: {
          tenantId,
          aggregateType: parsed.data.aggregateType,
          aggregateId,
          eventType: parsed.data.eventType,
          payload: parsed.data.payload,
          version: expectedVersion + 1,
          actorId: parsed.data.actorId ?? null,
        },
      });
    });

    return this._toEntry(record);
  }

  // ── loadAggregate ────────────────────────────────────────────────────────────

  async loadAggregate<TState>(
    tenantId: string,
    aggregateType: NewEventEntry["aggregateType"],
    aggregateId: string,
    reducer: EventReducer<TState>,
    initial: TState,
  ): Promise<AggregateSnapshot<TState>> {
    const rows = await this.db.domainEventLog.findMany({
      where: { tenantId, aggregateType, aggregateId },
      orderBy: { version: "asc" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events: EventLogEntry[] = rows.map((r: any) => this._toEntry(r));

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
        `[PrismaEventStore.listByTenant] Invalid opts: ${parsed.error.message}`,
      );
    }

    const { aggregateType, eventType, since, limit, offset } = parsed.data;

    const rows = await this.db.domainEventLog.findMany({
      where: {
        tenantId,
        ...(aggregateType ? { aggregateType } : {}),
        ...(eventType ? { eventType } : {}),
        ...(since ? { occurredAt: { gte: since } } : {}),
      },
      orderBy: [{ occurredAt: "asc" }, { version: "asc" }],
      skip: offset,
      take: limit,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows.map((r: any) => this._toEntry(r));
  }

  // ── private helpers ──────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _toEntry(row: any): EventLogEntry {
    return {
      id: row.id,
      tenantId: row.tenantId,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      eventType: row.eventType,
      payload: row.payload as Record<string, unknown>,
      version: row.version,
      occurredAt: row.occurredAt,
      actorId: row.actorId ?? null,
    };
  }
}
