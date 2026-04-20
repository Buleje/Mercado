/**
 * __tests__/lib/events/bus.test.ts
 *
 * Vitest tests for lib/events/bus.ts + types.ts
 *
 * Coverage:
 * 1.  publish with no subscribers does not throw
 * 2.  1 subscriber receives its event
 * 3.  N subscribers all receive the same event
 * 4.  Error in 1 handler does NOT block other handlers (Promise.allSettled)
 * 5.  unsubscribe stops receiving events
 * 6.  Events of type X do NOT reach handlers of type Y
 * 7.  Dead-letter queue captures failed handler entries
 * 8.  DLQ entry has correct shape (event, handlerName, error, failedAt)
 * 9.  drainDLQ clears the queue
 * 10. createEvent builds a valid event with correct occurredAt
 * 11. createEvent via DomainEventSchema.safeParse rejects invalid payload
 * 12. Bus does not throw when transport.publish itself throws
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger to suppress output in test runs
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock activity-logger (used by on-payment-settled handler)
vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

// Mock cache (used by on-order-created and on-payment-settled handlers)
vi.mock("@/lib/cache", () => ({
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

import { EventBus } from "@/lib/events/bus";
import { InMemoryTransport } from "@/lib/events/adapter";
import { createEvent, DomainEventSchema } from "@/lib/events/types";
import type { DomainEvent, OrderCreatedEvent, PaymentSettledEvent, StockLowEvent } from "@/lib/events/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOrderCreated(orderId = "ord_1"): OrderCreatedEvent {
  return createEvent("OrderCreated", "main", {
    orderId,
    customerId: "cust_99",
    totalPen: 120.5,
  });
}

function makePaymentSettled(): PaymentSettledEvent {
  return createEvent("PaymentSettled", "main", {
    orderId: "ord_1",
    provider: "mercadopago",
    externalId: "ext_abc",
    amountPen: 120.5,
  });
}

function makeStockLow(): StockLowEvent {
  return createEvent("StockLow", "main", {
    productId: "prod_42",
    sku: "ARR-5KG",
    currentStock: 2,
    threshold: 5,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EventBus", () => {
  let bus: EventBus;
  let transport: InMemoryTransport;

  beforeEach(() => {
    transport = new InMemoryTransport();
    bus = new EventBus(transport);
  });

  // 1
  it("publish with no subscribers does not throw", async () => {
    await expect(bus.publish(makeOrderCreated())).resolves.toBeUndefined();
  });

  // 2
  it("1 subscriber receives its event", async () => {
    const handler = vi.fn(async (_evt: OrderCreatedEvent) => {});
    bus.subscribe("OrderCreated", handler);

    const evt = makeOrderCreated("ord_single");
    await bus.publish(evt);

    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0][0] as OrderCreatedEvent).payload.orderId).toBe("ord_single");
  });

  // 3
  it("N subscribers all receive the same event", async () => {
    const h1 = vi.fn(async (_evt: OrderCreatedEvent) => {});
    const h2 = vi.fn(async (_evt: OrderCreatedEvent) => {});
    const h3 = vi.fn(async (_evt: OrderCreatedEvent) => {});

    bus.subscribe("OrderCreated", h1);
    bus.subscribe("OrderCreated", h2);
    bus.subscribe("OrderCreated", h3);

    await bus.publish(makeOrderCreated("ord_multi"));

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(h3).toHaveBeenCalledTimes(1);

    // All three received the exact same event
    const received = [
      h1.mock.calls[0][0] as OrderCreatedEvent,
      h2.mock.calls[0][0] as OrderCreatedEvent,
      h3.mock.calls[0][0] as OrderCreatedEvent,
    ];
    for (const r of received) {
      expect(r.payload.orderId).toBe("ord_multi");
    }
  });

  // 4
  it("error in 1 handler does NOT block other handlers", async () => {
    const good1 = vi.fn(async (_evt: OrderCreatedEvent) => {});
    const bad = vi.fn(async (_evt: OrderCreatedEvent) => { throw new Error("boom"); });
    const good2 = vi.fn(async (_evt: OrderCreatedEvent) => {});

    bus.subscribe("OrderCreated", good1);
    bus.subscribe("OrderCreated", bad);
    bus.subscribe("OrderCreated", good2);

    // publish must not throw even though one handler rejects
    await expect(bus.publish(makeOrderCreated())).resolves.toBeUndefined();

    expect(good1).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good2).toHaveBeenCalledTimes(1);
  });

  // 5
  it("unsubscribe stops receiving future events", async () => {
    const handler = vi.fn(async (_evt: OrderCreatedEvent) => {});
    const unsub = bus.subscribe("OrderCreated", handler);

    await bus.publish(makeOrderCreated("first"));
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();

    await bus.publish(makeOrderCreated("second"));
    expect(handler).toHaveBeenCalledTimes(1); // still 1 — not called again
  });

  // 6
  it("events of type X do NOT reach handlers of type Y", async () => {
    const orderHandler = vi.fn(async (_evt: OrderCreatedEvent) => {});
    const stockHandler = vi.fn(async (_evt: StockLowEvent) => {});

    bus.subscribe("OrderCreated", orderHandler);
    bus.subscribe("StockLow", stockHandler);

    await bus.publish(makeStockLow());

    expect(stockHandler).toHaveBeenCalledTimes(1);
    expect(orderHandler).not.toHaveBeenCalled();
  });

  // 7
  it("dead-letter queue captures failed handler entries", async () => {
    const bad = vi.fn(async (_evt: PaymentSettledEvent) => { throw new Error("network error"); });
    bus.subscribe("PaymentSettled", bad);

    await bus.publish(makePaymentSettled());

    const dlq = bus.getDLQ();
    expect(dlq).toHaveLength(1);
  });

  // 8
  it("DLQ entry has correct shape", async () => {
    const bad = async function myBadHandler(_evt: PaymentSettledEvent) {
      throw new Error("handler crashed");
    };
    bus.subscribe("PaymentSettled", bad);

    const evt = makePaymentSettled();
    await bus.publish(evt);

    const dlq = bus.getDLQ();
    expect(dlq).toHaveLength(1);

    const entry = dlq[0];
    expect(entry.event.type).toBe("PaymentSettled");
    expect(entry.error).toContain("handler crashed");
    expect(entry.handlerName).toBe("myBadHandler");
    expect(new Date(entry.failedAt).toString()).not.toBe("Invalid Date");
  });

  // 9
  it("drainDLQ clears the queue and returns entries", async () => {
    const bad = vi.fn(async (_evt: StockLowEvent) => { throw new Error("fail"); });
    bus.subscribe("StockLow", bad);
    await bus.publish(makeStockLow());

    expect(bus.getDLQ()).toHaveLength(1);

    const drained = bus.drainDLQ();
    expect(drained).toHaveLength(1);
    expect(bus.getDLQ()).toHaveLength(0);
  });

  // 10
  it("bus does not throw when transport publish itself throws", async () => {
    const brokenTransport: InMemoryTransport = new InMemoryTransport();
    vi.spyOn(brokenTransport, "publish").mockRejectedValue(new Error("transport down"));
    const brokenBus = new EventBus(brokenTransport);

    await expect(brokenBus.publish(makeOrderCreated())).resolves.toBeUndefined();
  });

  // 11
  it("multiple subscribe+unsubscribe cycles work correctly", async () => {
    const handler = vi.fn(async (_evt: OrderCreatedEvent) => {});

    const unsub1 = bus.subscribe("OrderCreated", handler);
    await bus.publish(makeOrderCreated("a"));
    expect(handler).toHaveBeenCalledTimes(1);

    unsub1();
    await bus.publish(makeOrderCreated("b"));
    expect(handler).toHaveBeenCalledTimes(1); // unsubscribed

    const unsub2 = bus.subscribe("OrderCreated", handler);
    await bus.publish(makeOrderCreated("c"));
    expect(handler).toHaveBeenCalledTimes(2); // re-subscribed

    unsub2();
  });
});

// ─── createEvent ──────────────────────────────────────────────────────────────

describe("createEvent", () => {
  // 10 (continued)
  it("builds a valid event with correct occurredAt", () => {
    const before = new Date().toISOString();
    const evt = createEvent("OrderCreated", "store_1", {
      orderId: "ord_x",
      customerId: "cust_x",
      totalPen: 50,
    });
    const after = new Date().toISOString();

    expect(evt.type).toBe("OrderCreated");
    expect(evt.tenantId).toBe("store_1");
    expect(evt.occurredAt >= before).toBe(true);
    expect(evt.occurredAt <= after).toBe(true);
    expect(evt.payload.orderId).toBe("ord_x");
  });

  it("throws when payload is invalid (Zod guard)", () => {
    expect(() =>
      // @ts-expect-error intentionally wrong payload
      createEvent("OrderCreated", "main", { orderId: 123, customerId: "" }),
    ).toThrow();
  });
});

// ─── DomainEventSchema.safeParse ─────────────────────────────────────────────

describe("DomainEventSchema.safeParse", () => {
  // 11
  it("accepts a valid PaymentSettled event", () => {
    const raw = {
      type: "PaymentSettled",
      tenantId: "main",
      occurredAt: new Date().toISOString(),
      payload: {
        orderId: "ord_1",
        provider: "culqi",
        externalId: "EXT_001",
        amountPen: 99.9,
      },
    };
    const result = DomainEventSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("rejects event with unknown provider", () => {
    const raw = {
      type: "PaymentSettled",
      tenantId: "main",
      occurredAt: new Date().toISOString(),
      payload: {
        orderId: "ord_1",
        provider: "paypal", // not in enum
        externalId: "EXT_001",
        amountPen: 99.9,
      },
    };
    const result = DomainEventSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects event with missing tenantId", () => {
    const raw = {
      type: "OrderCreated",
      occurredAt: new Date().toISOString(),
      payload: { orderId: "ord_1", customerId: "cust_1", totalPen: 10 },
    };
    const result = DomainEventSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects event with negative amountPen", () => {
    const raw = {
      type: "PaymentSettled",
      tenantId: "main",
      occurredAt: new Date().toISOString(),
      payload: {
        orderId: "ord_1",
        provider: "mercadopago",
        externalId: "EXT_001",
        amountPen: -5,
      },
    };
    const result = DomainEventSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});
