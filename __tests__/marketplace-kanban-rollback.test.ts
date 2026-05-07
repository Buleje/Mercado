/**
 * M6 — marketplace-kanban-rollback.test.ts
 *
 * Test de lógica pura: optimistic update + rollback en drag kanban.
 * Cuando PATCH falla → orders vuelve al estado pre-drag.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Modelo ────────────────────────────────────────────────────────────────────
interface KanbanOrder {
  id: string;
  status: string;
}

/**
 * Réplica de la lógica handleDragEnd del OrdenesTab.
 * Optimistic: mueve la orden al nuevo stage.
 * Si PATCH falla → rollback.
 */
async function handleDragEnd(
  orders: KanbanOrder[],
  orderId: string,
  toStatus: string,
  fetchFn: typeof fetch
): Promise<KanbanOrder[]> {
  const prev = orders.map((o) => ({ ...o }));

  // Optimistic update
  const optimistic = orders.map((o) =>
    o.id === orderId ? { ...o, status: toStatus } : o
  );

  const res = await fetchFn(`/api/marketplace/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: toStatus }),
  });

  if (!res.ok) {
    return prev; // rollback
  }

  return optimistic;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("handleDragEnd kanban — optimistic + rollback", () => {
  const initialOrders: KanbanOrder[] = [
    { id: "o1", status: "pendiente" },
    { id: "o2", status: "confirmado" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rollback al estado previo cuando PATCH retorna 500", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await handleDragEnd(initialOrders, "o1", "confirmado", mockFetch);

    expect(result[0].status).toBe("pendiente"); // rollback
  });

  it("aplica el estado nuevo cuando PATCH retorna ok", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await handleDragEnd(initialOrders, "o1", "confirmado", mockFetch);

    expect(result[0].status).toBe("confirmado");
  });

  it("no mueve otras órdenes durante el rollback", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await handleDragEnd(initialOrders, "o1", "preparando", mockFetch);

    expect(result[1].status).toBe("confirmado"); // o2 sin cambios
  });

  it("fetch es llamado con el orderId y toStatus correctos", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });

    await handleDragEnd(initialOrders, "o2", "preparando", mockFetch);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/marketplace/orders/o2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "preparando" }),
      })
    );
  });
});
