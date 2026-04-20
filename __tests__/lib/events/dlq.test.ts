/**
 * __tests__/lib/events/dlq.test.ts
 *
 * Vitest — Dead-Letter Queue con InMemoryDeadLetterQueue.
 * No requiere DB — 100% in-process.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryDeadLetterQueue } from "@/lib/events/dlq/in-memory-dlq";
import { EventBus } from "@/lib/events/bus";
import { EventBusWithDLQ } from "@/lib/events/bus-with-dlq";
import { createEvent } from "@/lib/events/types";
import type { DeadLetterEntry } from "@/lib/events/dlq/dlq";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

function makeOrderCreatedEvent(tenantId = TENANT_A) {
  return createEvent("OrderCreated", tenantId, {
    orderId: "ord-001",
    customerId: "cust-001",
    totalPen: 99.5,
  });
}

function makeStockLowEvent(tenantId = TENANT_A) {
  return createEvent("StockLow", tenantId, {
    productId: "prod-001",
    sku: "SKU-001",
    currentStock: 2,
    threshold: 5,
  });
}

// ─── Suite principal ──────────────────────────────────────────────────────────

describe("InMemoryDeadLetterQueue", () => {
  let dlq: InMemoryDeadLetterQueue;

  beforeEach(() => {
    dlq = new InMemoryDeadLetterQueue();
  });

  // ── Test 1 ────────────────────────────────────────────────────────────────

  it("enqueue persiste la entrada y es visible via _getAll()", async () => {
    await dlq.enqueue({
      tenantId: TENANT_A,
      event: makeOrderCreatedEvent(),
      handlerName: "onOrderCreated",
      error: "DB connection error",
    });

    const all = dlq._getAll();
    expect(all).toHaveLength(1);
    expect(all[0].tenantId).toBe(TENANT_A);
    expect(all[0].eventType).toBe("OrderCreated");
    expect(all[0].handlerName).toBe("onOrderCreated");
    expect(all[0].lastError).toBe("DB connection error");
    expect(all[0].attemptCount).toBe(1);
    expect(all[0].resolvedAt).toBeNull();
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────

  it("listUnresolved filtra por tenantId — no mezcla tenants", async () => {
    await dlq.enqueue({
      tenantId: TENANT_A,
      event: makeOrderCreatedEvent(TENANT_A),
      handlerName: "handler-a",
      error: "error-a",
    });
    await dlq.enqueue({
      tenantId: TENANT_B,
      event: makeOrderCreatedEvent(TENANT_B),
      handlerName: "handler-b",
      error: "error-b",
    });

    const resultA = await dlq.listUnresolved(TENANT_A);
    expect(resultA).toHaveLength(1);
    expect(resultA[0].tenantId).toBe(TENANT_A);

    const resultB = await dlq.listUnresolved(TENANT_B);
    expect(resultB).toHaveLength(1);
    expect(resultB[0].tenantId).toBe(TENANT_B);
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────

  it("listUnresolved filtra por eventType", async () => {
    await dlq.enqueue({
      tenantId: TENANT_A,
      event: makeOrderCreatedEvent(),
      handlerName: "onOrderCreated",
      error: "error-1",
    });
    await dlq.enqueue({
      tenantId: TENANT_A,
      event: makeStockLowEvent(),
      handlerName: "onStockLow",
      error: "error-2",
    });

    const orders = await dlq.listUnresolved(TENANT_A, { eventType: "OrderCreated" });
    expect(orders).toHaveLength(1);
    expect(orders[0].eventType).toBe("OrderCreated");

    const stock = await dlq.listUnresolved(TENANT_A, { eventType: "StockLow" });
    expect(stock).toHaveLength(1);
    expect(stock[0].eventType).toBe("StockLow");
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────

  it("markResolved — la entrada ya no aparece en listUnresolved", async () => {
    await dlq.enqueue({
      tenantId: TENANT_A,
      event: makeOrderCreatedEvent(),
      handlerName: "onOrderCreated",
      error: "transient",
    });

    const before = await dlq.listUnresolved(TENANT_A);
    expect(before).toHaveLength(1);

    await dlq.markResolved(before[0].id, "manual fix");

    const after = await dlq.listUnresolved(TENANT_A);
    expect(after).toHaveLength(0);

    // Verifica que resolvedAt se seteo
    const allEntries = dlq._getAll();
    const resolved = allEntries.find((e: DeadLetterEntry) => e.id === before[0].id);
    expect(resolved?.resolvedAt).not.toBeNull();
  });

  // ── Test 5 ────────────────────────────────────────────────────────────────

  it("retryPending incrementa attemptCount cuando el retry falla", async () => {
    await dlq.enqueue({
      tenantId: TENANT_A,
      event: makeOrderCreatedEvent(),
      handlerName: "onOrderCreated",
      error: "initial error",
    });

    // Bus que siempre falla
    const failingBus = {
      publish: vi.fn().mockRejectedValue(new Error("still broken")),
    };
    dlq.setRetryBus(failingBus);

    const result = await dlq.retryPending(TENANT_A, { maxAttempts: 5 });

    expect(result.retried).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(0);

    const entries = dlq._getAll();
    expect(entries[0].attemptCount).toBe(2);
  });

  // ── Test 6 ────────────────────────────────────────────────────────────────

  it("retryPending con maxAttempts — marca como exhausted cuando se alcanza el cap", async () => {
    await dlq.enqueue({
      tenantId: TENANT_A,
      event: makeOrderCreatedEvent(),
      handlerName: "onOrderCreated",
      error: "initial error",
    });

    // Simular que ya lleva 4 intentos (1 inicial + bump manual)
    const entries = dlq._getAll();
    // Manipular directamente para llegar al limite
    for (let i = 1; i < 3; i++) {
      dlq._getAll()[0]; // noop — solo para comentar la logica
    }
    // Enqueue con attemptCount = 4 para que en el siguiente retry llegue a 5
    dlq._clear();
    for (let attempt = 0; attempt < 3; attempt++) {
      await dlq.enqueue({
        tenantId: TENANT_A,
        event: makeOrderCreatedEvent(),
        handlerName: "onOrderCreated",
        error: `attempt ${attempt + 1}`,
      });
    }

    // Usamos maxAttempts=1 para forzar exhausted de inmediato
    // (entries[0].attemptCount=1 >= maxAttempts=1)
    const failingBus = { publish: vi.fn().mockRejectedValue(new Error("broken")) };
    dlq.setRetryBus(failingBus);

    const result = await dlq.retryPending(TENANT_A, { maxAttempts: 1 });

    expect(result.exhausted).toBe(3);
    expect(result.retried).toBe(0);

    // Todas deben estar marcadas como resueltas con nota
    const after = await dlq.listUnresolved(TENANT_A);
    expect(after).toHaveLength(0);
  });

  // ── Test 7 ────────────────────────────────────────────────────────────────

  it("retryPending con bus que tiene exito marca la entrada como resuelta", async () => {
    await dlq.enqueue({
      tenantId: TENANT_A,
      event: makeOrderCreatedEvent(),
      handlerName: "onOrderCreated",
      error: "transient",
    });

    const successBus = { publish: vi.fn().mockResolvedValue(undefined) };
    dlq.setRetryBus(successBus);

    const result = await dlq.retryPending(TENANT_A, { maxAttempts: 5 });

    expect(result.retried).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    const after = await dlq.listUnresolved(TENANT_A);
    expect(after).toHaveLength(0);
  });
});

// ─── Suite EventBusWithDLQ ────────────────────────────────────────────────────

describe("EventBusWithDLQ", () => {
  let dlq: InMemoryDeadLetterQueue;
  let bus: EventBusWithDLQ;

  beforeEach(() => {
    dlq = new InMemoryDeadLetterQueue();
    bus = new EventBusWithDLQ(new EventBus(), dlq);
    dlq.setRetryBus(bus);
  });

  // ── Test 8 ────────────────────────────────────────────────────────────────

  it("envia al DLQ cuando un handler falla", async () => {
    const failingHandler = async () => {
      throw new Error("handler exploded");
    };
    Object.defineProperty(failingHandler, "name", { value: "failingHandler" });

    bus.subscribe("OrderCreated", failingHandler);

    await bus.publish(makeOrderCreatedEvent());

    // Esperar un tick para que la Promise de enqueue resuelva
    await new Promise((r) => setTimeout(r, 0));

    const unresolved = await dlq.listUnresolved(TENANT_A);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].handlerName).toBe("failingHandler");
    expect(unresolved[0].lastError).toContain("handler exploded");
    expect(unresolved[0].eventType).toBe("OrderCreated");
  });

  // ── Test 9 ────────────────────────────────────────────────────────────────

  it("NO envia al DLQ cuando el handler tiene exito", async () => {
    const successHandler = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(successHandler, "name", { value: "successHandler" });

    bus.subscribe("OrderCreated", successHandler);

    await bus.publish(makeOrderCreatedEvent());

    await new Promise((r) => setTimeout(r, 0));

    expect(successHandler).toHaveBeenCalledOnce();

    const unresolved = await dlq.listUnresolved(TENANT_A);
    expect(unresolved).toHaveLength(0);
  });

  // ── Test 10 (bonus) ───────────────────────────────────────────────────────

  it("DLQ falla al persistir — publish no se interrumpe", async () => {
    // DLQ que siempre falla
    const brokenDlq: typeof dlq = {
      enqueue: vi.fn().mockRejectedValue(new Error("DLQ storage down")),
      listUnresolved: vi.fn().mockResolvedValue([]),
      markResolved: vi.fn().mockResolvedValue(undefined),
      retryPending: vi.fn().mockResolvedValue({ retried: 0, succeeded: 0, failed: 0, exhausted: 0 }),
      setRetryBus: vi.fn(),
      _getAll: vi.fn().mockReturnValue([]),
      _clear: vi.fn(),
    } as unknown as typeof dlq;

    const busBrokenDlq = new EventBusWithDLQ(new EventBus(), brokenDlq);

    const failingHandler = async () => {
      throw new Error("handler error");
    };
    busBrokenDlq.subscribe("OrderCreated", failingHandler);

    // No debe lanzar aunque DLQ y handler fallen
    await expect(busBrokenDlq.publish(makeOrderCreatedEvent())).resolves.toBeUndefined();
  });
});
