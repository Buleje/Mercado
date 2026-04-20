/**
 * __tests__/lib/event-sourcing/event-store.test.ts
 *
 * Vitest suite for InMemoryEventStore + orderReducer.
 * Covers all 10 required scenarios.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEventStore } from "@/lib/event-sourcing/in-memory-store";
import { OptimisticConcurrencyError } from "@/lib/event-sourcing/types";
import type { NewEventEntry } from "@/lib/event-sourcing/types";
import {
  orderReducer,
  INITIAL_ORDER_STATE,
  type OrderState,
} from "@/lib/event-sourcing/reducers/order-reducer";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT = "tenant-abc";
const OTHER_TENANT = "tenant-xyz";

function makeOrderCreatedEntry(
  aggregateId: string,
  expectedVersion: number,
  actorId?: string,
): NewEventEntry {
  return {
    tenantId: TENANT,
    aggregateType: "order",
    aggregateId,
    eventType: "OrderCreated",
    payload: {
      orderId: aggregateId,
      customerId: "cust-1",
      totalPen: 150.0,
    },
    expectedVersion,
    actorId,
  };
}

function makeOrderCancelledEntry(
  aggregateId: string,
  expectedVersion: number,
): NewEventEntry {
  return {
    tenantId: TENANT,
    aggregateType: "order",
    aggregateId,
    eventType: "OrderCancelled",
    payload: { reason: "customer request" },
    expectedVersion,
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("InMemoryEventStore", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  // 1. append assigns sequential version starting at 1
  it("append assigns version = expectedVersion + 1 (first event = version 1)", async () => {
    const entry = makeOrderCreatedEntry("order-1", 0);
    const result = await store.append(TENANT, entry);

    expect(result.version).toBe(1);
    expect(result.aggregateId).toBe("order-1");
    expect(result.tenantId).toBe(TENANT);
    expect(result.id).toBeTruthy();
    expect(result.occurredAt).toBeInstanceOf(Date);
  });

  // 2. sequential appends produce monotonically increasing versions
  it("three sequential appends produce versions 1, 2, 3", async () => {
    const first = await store.append(TENANT, makeOrderCreatedEntry("order-2", 0));
    const second = await store.append(TENANT, {
      tenantId: TENANT,
      aggregateType: "order",
      aggregateId: "order-2",
      eventType: "OrderPaid",
      payload: { paymentRef: "pay-001" },
      expectedVersion: 1,
    });
    const third = await store.append(TENANT, makeOrderCancelledEntry("order-2", 2));

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(third.version).toBe(3);
  });

  // 3. concurrent append with wrong expectedVersion → OptimisticConcurrencyError
  it("append with stale expectedVersion throws OptimisticConcurrencyError", async () => {
    await store.append(TENANT, makeOrderCreatedEntry("order-3", 0));

    // Both "concurrent" callers think version is 0 — second one must fail
    await expect(
      store.append(TENANT, makeOrderCreatedEntry("order-3", 0)),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);
  });

  // 4. OptimisticConcurrencyError carries expected/actual version metadata
  it("OptimisticConcurrencyError carries correct aggregateId + versions", async () => {
    await store.append(TENANT, makeOrderCreatedEntry("order-4", 0));

    const caught = await store
      .append(TENANT, makeOrderCreatedEntry("order-4", 0))
      .catch((e: unknown) => e);

    expect(caught).toBeInstanceOf(OptimisticConcurrencyError);
    const err = caught as OptimisticConcurrencyError;
    expect(err.aggregateId).toBe("order-4");
    expect(err.expectedVersion).toBe(0);
    expect(err.actualVersion).toBe(1);
  });

  // 5. loadAggregate reconstructs state correctly with orderReducer
  it("loadAggregate replays OrderCreated → produces correct OrderState", async () => {
    await store.append(TENANT, makeOrderCreatedEntry("order-5", 0, "user-1"));

    const snapshot = await store.loadAggregate(
      TENANT,
      "order",
      "order-5",
      orderReducer,
      INITIAL_ORDER_STATE,
    );

    expect(snapshot.version).toBe(1);
    expect(snapshot.state.status).toBe("pending");
    expect(snapshot.state.orderId).toBe("order-5");
    expect(snapshot.state.customerId).toBe("cust-1");
    expect(snapshot.state.totalPen).toBe(150.0);
  });

  // 6. orderReducer: OrderCreated → OrderCancelled produces "cancelled" state
  it("orderReducer: OrderCreated then OrderCancelled → status = cancelled", async () => {
    await store.append(TENANT, makeOrderCreatedEntry("order-6", 0));
    await store.append(TENANT, makeOrderCancelledEntry("order-6", 1));

    const snapshot = await store.loadAggregate(
      TENANT,
      "order",
      "order-6",
      orderReducer,
      INITIAL_ORDER_STATE,
    );

    expect(snapshot.version).toBe(2);
    expect(snapshot.state.status).toBe("cancelled");
    expect(snapshot.state.cancelReason).toBe("customer request");
    expect(snapshot.events).toHaveLength(2);
  });

  // 7. listByTenant filters strictly by tenantId
  it("listByTenant returns only events for the requested tenant", async () => {
    await store.append(TENANT, makeOrderCreatedEntry("order-t1", 0));
    // Append under a different tenant
    await store.append(OTHER_TENANT, {
      tenantId: OTHER_TENANT,
      aggregateType: "order",
      aggregateId: "order-other",
      eventType: "OrderCreated",
      payload: { orderId: "order-other", customerId: "c2", totalPen: 0 },
      expectedVersion: 0,
    });

    const results = await store.listByTenant(TENANT);
    expect(results).toHaveLength(1);
    expect(results[0].tenantId).toBe(TENANT);
  });

  // 8. listByTenant with aggregateType filter
  it("listByTenant filters by aggregateType", async () => {
    await store.append(TENANT, makeOrderCreatedEntry("order-ft", 0));
    await store.append(TENANT, {
      tenantId: TENANT,
      aggregateType: "stock",
      aggregateId: "stock-1",
      eventType: "StockReserved",
      payload: { productId: "p1", qty: 3 },
      expectedVersion: 0,
    });

    const orders = await store.listByTenant(TENANT, { aggregateType: "order" });
    const stocks = await store.listByTenant(TENANT, { aggregateType: "stock" });

    expect(orders).toHaveLength(1);
    expect(stocks).toHaveLength(1);
    expect(orders[0].aggregateType).toBe("order");
    expect(stocks[0].aggregateType).toBe("stock");
  });

  // 9. Immutability: loadAggregate does NOT mutate the initial state seed
  it("loadAggregate does not mutate the initial state seed", async () => {
    await store.append(TENANT, makeOrderCreatedEntry("order-imm", 0));

    const seed: OrderState = { ...INITIAL_ORDER_STATE };
    await store.loadAggregate(TENANT, "order", "order-imm", orderReducer, seed);

    expect(seed.status).toBe("draft"); // unchanged
    expect(seed.orderId).toBe("");     // unchanged
  });

  // 10. loadAggregate on unknown aggregate returns initial state + version 0
  it("loadAggregate on non-existent aggregate returns seed state at version 0", async () => {
    const snapshot = await store.loadAggregate(
      TENANT,
      "order",
      "order-ghost",
      orderReducer,
      INITIAL_ORDER_STATE,
    );

    expect(snapshot.version).toBe(0);
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.state).toEqual(INITIAL_ORDER_STATE);
  });

  // 11. append rejects invalid entry (Zod validation)
  it("append throws on invalid entry (missing aggregateId)", async () => {
    await expect(
      // @ts-expect-error intentionally bad input for test
      store.append(TENANT, { tenantId: TENANT }),
    ).rejects.toThrow();
  });

  // 12. listByTenant respects limit + offset pagination
  it("listByTenant limit + offset pagination works", async () => {
    // Append 5 events to the same aggregate
    for (let i = 0; i < 5; i++) {
      await store.append(TENANT, {
        tenantId: TENANT,
        aggregateType: "order",
        aggregateId: "order-pg",
        eventType: i === 0 ? "OrderCreated" : "OrderPaid",
        payload: { orderId: "order-pg", customerId: "c1", totalPen: i * 10, paymentRef: `ref-${i}` },
        expectedVersion: i,
      });
    }

    const page1 = await store.listByTenant(TENANT, { limit: 2, offset: 0 });
    const page2 = await store.listByTenant(TENANT, { limit: 2, offset: 2 });
    const page3 = await store.listByTenant(TENANT, { limit: 2, offset: 4 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page3).toHaveLength(1);
  });
});

// ── orderReducer unit tests ───────────────────────────────────────────────────

describe("orderReducer (unit)", () => {
  it("unknown event type returns state unchanged", () => {
    const event = {
      id: "e1",
      tenantId: TENANT,
      aggregateType: "order" as const,
      aggregateId: "o1",
      eventType: "SomeUnknownEvent",
      payload: {},
      version: 1,
      occurredAt: new Date(),
      actorId: null,
    };

    const result = orderReducer(INITIAL_ORDER_STATE, event);
    expect(result).toEqual(INITIAL_ORDER_STATE);
  });

  it("OrderItemAdded appends item to items array", () => {
    const created = orderReducer(INITIAL_ORDER_STATE, {
      id: "e1",
      tenantId: TENANT,
      aggregateType: "order" as const,
      aggregateId: "o1",
      eventType: "OrderCreated",
      payload: { orderId: "o1", customerId: "c1", totalPen: 50 },
      version: 1,
      occurredAt: new Date(),
      actorId: null,
    });

    const withItem = orderReducer(created, {
      id: "e2",
      tenantId: TENANT,
      aggregateType: "order" as const,
      aggregateId: "o1",
      eventType: "OrderItemAdded",
      payload: {
        item: { productId: "p1", name: "Arroz", quantity: 2, unitPricePen: 25 },
      },
      version: 2,
      occurredAt: new Date(),
      actorId: null,
    });

    expect(withItem.items).toHaveLength(1);
    expect(withItem.items[0].productId).toBe("p1");
  });

  it("OrderItemRemoved removes item by productId", () => {
    const state: OrderState = {
      ...INITIAL_ORDER_STATE,
      status: "pending",
      items: [
        { productId: "p1", name: "Arroz", quantity: 2, unitPricePen: 25 },
        { productId: "p2", name: "Azucar", quantity: 1, unitPricePen: 10 },
      ],
    };

    const result = orderReducer(state, {
      id: "e3",
      tenantId: TENANT,
      aggregateType: "order" as const,
      aggregateId: "o1",
      eventType: "OrderItemRemoved",
      payload: { productId: "p1" },
      version: 3,
      occurredAt: new Date(),
      actorId: null,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].productId).toBe("p2");
  });
});
