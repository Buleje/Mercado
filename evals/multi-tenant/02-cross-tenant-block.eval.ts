/**
 * Eval: Cannot access other tenant's data.
 * Contract test: verifies that cross-tenant access is blocked.
 * Business rule: getById returns null if tenantId does not match, preventing oracle attacks.
 */
import { describe, it, expect } from "vitest";

type Order = { id: string; tenantId: string; total: number };

class MockOrderStore {
  private orders: Order[] = [
    { id: "ord-001", tenantId: "bodega-sm", total: 50 },
    { id: "ord-002", tenantId: "bodega-sm", total: 75 },
    { id: "ord-003", tenantId: "tienda-xyz", total: 120 },
  ];

  getById(tenantId: string, orderId: string): Order | null {
    const order = this.orders.find(
      (o) => o.id === orderId && o.tenantId === tenantId,
    );
    return order ?? null;
  }
}

describe("Multi-Tenant > Cross-Tenant Access Block", () => {
  const store = new MockOrderStore();

  it("should return order for matching tenant", () => {
    const order = store.getById("bodega-sm", "ord-001");
    expect(order).not.toBeNull();
    expect(order!.total).toBe(50);
  });

  it("should return null for wrong tenant (cross-tenant)", () => {
    const order = store.getById("tienda-xyz", "ord-001");
    expect(order).toBeNull();
  });

  it("should return null for non-existent order", () => {
    const order = store.getById("bodega-sm", "ord-999");
    expect(order).toBeNull();
  });

  it("should not distinguish between non-existent and wrong-tenant", () => {
    const crossTenant = store.getById("tienda-xyz", "ord-001");
    const nonExistent = store.getById("bodega-sm", "ord-999");
    expect(crossTenant).toEqual(nonExistent);
  });
});
