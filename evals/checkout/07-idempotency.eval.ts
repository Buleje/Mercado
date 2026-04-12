/**
 * Eval: Double-click prevention via idempotency key.
 * Business rule: Order.idempotencyKey is unique. Duplicate submissions
 * with the same key must be rejected (409 Conflict).
 */
import { describe, it, expect } from "vitest";

type OrderRecord = { id: string; idempotencyKey: string | null };

class OrderStore {
  private orders: OrderRecord[] = [];

  create(id: string, idempotencyKey: string | null): { ok: boolean; status: number } {
    if (idempotencyKey) {
      const existing = this.orders.find((o) => o.idempotencyKey === idempotencyKey);
      if (existing) return { ok: false, status: 409 };
    }
    this.orders.push({ id, idempotencyKey });
    return { ok: true, status: 201 };
  }
}

describe("Checkout > Idempotency Key", () => {
  it("should create order with unique key", () => {
    const store = new OrderStore();
    const result = store.create("ord-001", "idem-abc");
    expect(result).toEqual({ ok: true, status: 201 });
  });

  it("should reject duplicate idempotency key", () => {
    const store = new OrderStore();
    store.create("ord-001", "idem-abc");
    const result = store.create("ord-002", "idem-abc");
    expect(result).toEqual({ ok: false, status: 409 });
  });

  it("should allow different keys for different orders", () => {
    const store = new OrderStore();
    store.create("ord-001", "idem-abc");
    const result = store.create("ord-002", "idem-def");
    expect(result).toEqual({ ok: true, status: 201 });
  });

  it("should allow orders without idempotency key", () => {
    const store = new OrderStore();
    store.create("ord-001", null);
    const result = store.create("ord-002", null);
    expect(result).toEqual({ ok: true, status: 201 });
  });
});
