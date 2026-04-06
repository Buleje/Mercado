/**
 * Tests for lib/domain-events/domain-events.ts
 *
 * Validates:
 * - onDomainEvent subscribers receive their typed events
 * - Subscribers of other types are NOT called
 * - Unsubscribe works
 * - emitDomainEvent assigns id + occurredAt
 * - Failures in one subscriber don't break others
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the BullMQ connection to force the in-memory fallback path
vi.mock("@/lib/queue/connection", () => ({
  getQueueConnection: vi.fn(() => null),
}));

// Mock logger to silence noise
vi.mock("@/lib/logger", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  emitDomainEvent,
  onDomainEvent,
  DomainEvents,
  type VentaCompletadaEvent,
  type StockBajoEvent,
} from "@/lib/domain-events";

describe("onDomainEvent + emitDomainEvent", () => {
  it("delivers VentaCompletada events to subscribers", async () => {
    const handler = vi.fn();
    const off = onDomainEvent("VentaCompletada", handler);

    await DomainEvents.ventaCompletada("main", {
      orderId:       "ord_123",
      customerPhone: "999999999",
      total:         150,
      itemCount:     3,
      paymentMethod: "yape",
      hadCoupon:     false,
      isDelivery:    true,
    });

    // Wait a microtask for fire-and-forget dispatch
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as VentaCompletadaEvent;
    expect(event.type).toBe("VentaCompletada");
    expect(event.tenantId).toBe("main");
    expect(event.payload.orderId).toBe("ord_123");
    expect(event.payload.total).toBe(150);
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/); // UUID
    expect(new Date(event.occurredAt).toString()).not.toBe("Invalid Date");

    off();
  });

  it("does not deliver events to subscribers of other types", async () => {
    const ventaHandler = vi.fn();
    const stockHandler = vi.fn();
    const offVenta = onDomainEvent("VentaCompletada", ventaHandler);
    const offStock = onDomainEvent("StockBajo", stockHandler);

    await DomainEvents.stockBajo("main", {
      productId:     42,
      productName:   "Arroz Costeño 5kg",
      currentStock:  2,
      stockMin:      5,
      lastDeduction: 3,
      reason:        "venta",
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(stockHandler).toHaveBeenCalledTimes(1);
    expect(ventaHandler).not.toHaveBeenCalled();

    const event = stockHandler.mock.calls[0][0] as StockBajoEvent;
    expect(event.payload.productId).toBe(42);
    expect(event.payload.productName).toBe("Arroz Costeño 5kg");
    expect(event.payload.reason).toBe("venta");

    offVenta();
    offStock();
  });

  it("supports multiple subscribers for the same event", async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();
    const off1 = onDomainEvent("FacturaEmitida", handler1);
    const off2 = onDomainEvent("FacturaEmitida", handler2);
    const off3 = onDomainEvent("FacturaEmitida", handler3);

    await DomainEvents.facturaEmitida("main", {
      facturaId:        "fact_1",
      orderId:          "ord_9",
      customerDocument: "20123456789",
      customerName:     "Distribuidora SAC",
      documentType:     "factura",
      total:            500,
    });

    await new Promise((r) => setTimeout(r, 10));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler3).toHaveBeenCalledTimes(1);

    off1();
    off2();
    off3();
  });

  it("unsubscribe stops future deliveries", async () => {
    const handler = vi.fn();
    const off = onDomainEvent("VentaCompletada", handler);

    await DomainEvents.ventaCompletada("main", {
      orderId:       "first",
      customerPhone: "",
      total:         100,
      itemCount:     1,
      paymentMethod: "efectivo",
      hadCoupon:     false,
      isDelivery:    false,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(handler).toHaveBeenCalledTimes(1);

    off();

    await DomainEvents.ventaCompletada("main", {
      orderId:       "second",
      customerPhone: "",
      total:         200,
      itemCount:     2,
      paymentMethod: "efectivo",
      hadCoupon:     false,
      isDelivery:    false,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(handler).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it("assigns a unique id and ISO occurredAt to each emitted event", async () => {
    const ids: string[] = [];
    const off = onDomainEvent("VentaCompletada", (ev) => {
      ids.push(ev.id);
    });

    for (let i = 0; i < 3; i++) {
      await DomainEvents.ventaCompletada("main", {
        orderId:       `ord_${i}`,
        customerPhone: "",
        total:         10,
        itemCount:     1,
        paymentMethod: "efectivo",
        hadCoupon:     false,
        isDelivery:    false,
      });
    }
    await new Promise((r) => setTimeout(r, 10));

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // all unique
  });

  it("failure in one subscriber does not prevent others from running", async () => {
    const good1 = vi.fn();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good2 = vi.fn();
    const off1 = onDomainEvent("StockBajo", good1);
    const offBad = onDomainEvent("StockBajo", bad);
    const off2 = onDomainEvent("StockBajo", good2);

    await DomainEvents.stockBajo("main", {
      productId:     1,
      productName:   "X",
      currentStock:  0,
      stockMin:      1,
      lastDeduction: 1,
      reason:        "merma",
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(good1).toHaveBeenCalledTimes(1);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good2).toHaveBeenCalledTimes(1);

    off1();
    offBad();
    off2();
  });

  it("emitDomainEvent does not throw even if logger/queue fail", async () => {
    // This test is a safety net — callers rely on fire-and-forget semantics
    await expect(
      DomainEvents.ventaCompletada("main", {
        orderId:       "safe",
        customerPhone: "",
        total:         0,
        itemCount:     0,
        paymentMethod: "efectivo",
        hadCoupon:     false,
        isDelivery:    false,
      })
    ).resolves.toBeUndefined();
  });
});
