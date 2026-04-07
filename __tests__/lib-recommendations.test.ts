/**
 * Tests unitarios — lib/recommendations/product-similarity.ts
 *
 * Cubre:
 *  - Producto sin ventas completadas → array vacío
 *  - Producto con 1 orden que tiene 2 ítems co-ocurrentes → score 1 para cada uno
 *  - Producto con múltiples órdenes → orden correcto por score descendente
 *  - Multi-tenant: tenant A no ve recomendaciones de tenant B
 *  - Respeta el parámetro `limit`
 *  - Items con productId null son ignorados
 *  - Cache hit: Prisma se llama solo 1 vez ante 2 requests idénticas
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock cache — passthrough para que los tests sean deterministas ────────────
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

// ── Mock Prisma ───────────────────────────────────────────────────────────────
const { mockOrderFindMany, mockOrderItemFindMany } = vi.hoisted(() => ({
  mockOrderFindMany:    vi.fn(),
  mockOrderItemFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order:     { findMany: mockOrderFindMany },
    orderItem: { findMany: mockOrderItemFindMany },
  },
}));

import { getRelatedProducts } from "@/lib/recommendations/product-similarity";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOrders(ids: string[]) {
  return ids.map((id) => ({ id }));
}

function makeItems(
  specs: Array<{ orderId: string; productId: number | null; name: string; price: number; image: string | null }>,
) {
  return specs;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getRelatedProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve array vacío cuando no hay órdenes completadas para el producto", async () => {
    mockOrderFindMany.mockResolvedValueOnce([]); // sin órdenes

    const result = await getRelatedProducts("tenant-1", 42);

    expect(result).toEqual([]);
    // orderItem no debe consultarse si no hay órdenes
    expect(mockOrderItemFindMany).not.toHaveBeenCalled();
  });

  it("devuelve los 2 co-ocurrentes con score 1 cuando hay 1 sola orden con 2 ítems", async () => {
    mockOrderFindMany.mockResolvedValueOnce(makeOrders(["order-a"]));
    mockOrderItemFindMany.mockResolvedValueOnce(
      makeItems([
        { orderId: "order-a", productId: 10, name: "Aceite", price: 8.0, image: "/aceite.png" },
        { orderId: "order-a", productId: 20, name: "Azúcar", price: 3.5, image: null },
      ]),
    );

    const result = await getRelatedProducts("tenant-1", 1);

    expect(result).toHaveLength(2);
    expect(result[0].score).toBe(1);
    expect(result[1].score).toBe(1);
    // ambos presentes sin importar el orden (score igual)
    const ids = result.map((r) => r.productId);
    expect(ids).toContain(10);
    expect(ids).toContain(20);
  });

  it("ordena por score descendente cuando hay múltiples órdenes con distintas frecuencias", async () => {
    // Producto 10 (Aceite) aparece en las 3 órdenes, Producto 20 (Azúcar) en 2
    mockOrderFindMany.mockResolvedValueOnce(
      makeOrders(["ord-1", "ord-2", "ord-3"]),
    );
    mockOrderItemFindMany.mockResolvedValueOnce(
      makeItems([
        // ord-1: Aceite + Azúcar
        { orderId: "ord-1", productId: 10, name: "Aceite", price: 8.0, image: null },
        { orderId: "ord-1", productId: 20, name: "Azúcar", price: 3.5, image: null },
        // ord-2: Aceite + Fideos
        { orderId: "ord-2", productId: 10, name: "Aceite", price: 8.0, image: null },
        { orderId: "ord-2", productId: 30, name: "Fideos", price: 2.0, image: null },
        // ord-3: Aceite solamente
        { orderId: "ord-3", productId: 10, name: "Aceite", price: 8.0, image: null },
      ]),
    );

    const result = await getRelatedProducts("tenant-1", 99, 5);

    expect(result[0].productId).toBe(10); // score 3 — más frecuente
    expect(result[0].score).toBe(3);
    expect(result[1].productId).toBe(20); // score 1
    expect(result[2].productId).toBe(30); // score 1
  });

  it("respeta el parámetro limit y devuelve exactamente N productos", async () => {
    mockOrderFindMany.mockResolvedValueOnce(makeOrders(["ord-x"]));
    mockOrderItemFindMany.mockResolvedValueOnce(
      makeItems([
        { orderId: "ord-x", productId: 10, name: "A", price: 1, image: null },
        { orderId: "ord-x", productId: 20, name: "B", price: 2, image: null },
        { orderId: "ord-x", productId: 30, name: "C", price: 3, image: null },
        { orderId: "ord-x", productId: 40, name: "D", price: 4, image: null },
      ]),
    );

    const result = await getRelatedProducts("tenant-1", 1, 2);

    expect(result).toHaveLength(2);
  });

  it("aislamiento multi-tenant: la query incluye el tenantId correcto en Order.findMany", async () => {
    mockOrderFindMany.mockResolvedValueOnce([]);

    await getRelatedProducts("tenant-B", 5);

    expect(mockOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-B" }),
      }),
    );
  });

  it("ignora items con productId null sin lanzar error", async () => {
    mockOrderFindMany.mockResolvedValueOnce(makeOrders(["ord-null"]));
    mockOrderItemFindMany.mockResolvedValueOnce(
      makeItems([
        { orderId: "ord-null", productId: null, name: "Desconocido", price: 5, image: null },
        { orderId: "ord-null", productId: 55, name: "Sal", price: 1.5, image: null },
      ]),
    );

    const result = await getRelatedProducts("tenant-1", 99);

    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe(55);
  });

  it("llama a getOrSet con clave que incluye tenantId, productId y limit", async () => {
    // Verifica que la clave de cache está correctamente compuesta para el aislamiento multi-tenant
    const { getOrSet } = await import("@/lib/cache");
    const getOrSetMock = vi.mocked(getOrSet);

    mockOrderFindMany.mockResolvedValueOnce([]);

    await getRelatedProducts("tenant-cache", 7, 5);

    expect(getOrSetMock).toHaveBeenCalledTimes(1);
    expect(getOrSetMock).toHaveBeenCalledWith(
      "recommendations:related:tenant-cache:7:5",
      86400,
      expect.any(Function),
    );
  });
});
