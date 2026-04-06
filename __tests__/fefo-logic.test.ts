/**
 * __tests__/fefo-logic.test.ts
 *
 * Unit tests for the FEFO (First Expired, First Out) logic in
 * lib/db/inventory.db.ts — InventoryMovementsDB.decrementFEFO.
 *
 * The function is mocked at the Prisma layer so we can exercise
 * the batch-selection and quantity-deduction logic without a real DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// inventory.db.ts has "server-only" guard — mock it
vi.mock("server-only", () => ({}));

// ── Prisma mock ───────────────────────────────────────────────────────────────

const {
  mockProductFindUnique,
  mockProductUpdate,
  mockInventoryMovementCreate,
  mockBatchFindMany,
  mockBatchUpdate,
  mockBatchFindFirst,
} = vi.hoisted(() => ({
  mockProductFindUnique: vi.fn(),
  mockProductUpdate: vi.fn(),
  mockInventoryMovementCreate: vi.fn(),
  mockBatchFindMany: vi.fn(),
  mockBatchUpdate: vi.fn(),
  mockBatchFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  // Definimos el objeto y lo referenciamos a sí mismo para que $transaction
  // pase el mismo prismaMock como `tx`, reusando los mocks ya configurados.
  const prismaMock = {
    product: {
      findUnique: mockProductFindUnique,
      update: mockProductUpdate,
    },
    inventoryMovement: {
      findMany: vi.fn().mockResolvedValue([]),
      create: mockInventoryMovementCreate,
    },
    batch: {
      findMany: mockBatchFindMany,
      update: mockBatchUpdate,
      findFirst: mockBatchFindFirst,
    },
    // decrementFEFO usa prisma.$transaction(async (tx) => { ... }) — el tx
    // expone tx.batch.findMany y tx.batch.update. Pasamos prismaMock para
    // que reuse los mocks de batch del bloque de arriba.
    $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => {
      return callback(prismaMock);
    }),
  };
  return { prisma: prismaMock };
});

import { InventoryMovementsDB } from "@/lib/db/inventory.db";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBatch(id: string, quantity: number, expiryDate: Date) {
  return { id, productId: 1, quantity, expiryDate };
}

function makeMovement(productId: number, quantity: number) {
  return {
    id: "mov-001",
    productId,
    type: "venta_online",
    quantity,
    previousStock: 100,
    newStock: 100 - quantity,
    createdAt: new Date(),
  };
}

// ── decrementFEFO ─────────────────────────────────────────────────────────────

describe("InventoryMovementsDB.decrementFEFO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: product has stock = 100
    mockProductFindUnique.mockResolvedValue({ id: 1, stock: 100 });
    mockProductUpdate.mockResolvedValue({ id: 1, stock: 90 });
    mockInventoryMovementCreate.mockImplementation(async ({ data }) =>
      makeMovement(data.productId, data.quantity)
    );
    mockBatchUpdate.mockResolvedValue({});
    mockBatchFindFirst.mockResolvedValue(null); // no batches for refreshProductExpiresAt
  });

  it("deducts from a single batch when quantity fits entirely", async () => {
    mockBatchFindMany.mockResolvedValue([
      makeBatch("batch-A", 20, new Date("2026-03-01")),
    ]);

    await InventoryMovementsDB.decrementFEFO(1, 10);

    expect(mockBatchUpdate).toHaveBeenCalledWith({
      where: { id: "batch-A" },
      data: { quantity: 10 }, // 20 - 10
    });
  });

  it("deducts from first batch entirely then moves to second (FEFO order)", async () => {
    mockBatchFindMany.mockResolvedValue([
      makeBatch("batch-A", 5, new Date("2026-02-01")),  // earliest — deducted first
      makeBatch("batch-B", 20, new Date("2026-06-01")), // second
    ]);

    await InventoryMovementsDB.decrementFEFO(1, 8); // need 8, first batch has 5

    // batch-A exhausted: 5 - 5 = 0
    expect(mockBatchUpdate).toHaveBeenCalledWith({
      where: { id: "batch-A" },
      data: { quantity: 0 },
    });
    // batch-B deducted by remainder: 20 - 3 = 17
    expect(mockBatchUpdate).toHaveBeenCalledWith({
      where: { id: "batch-B" },
      data: { quantity: 17 },
    });
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
  });

  it("stops deducting once remaining reaches 0", async () => {
    mockBatchFindMany.mockResolvedValue([
      makeBatch("batch-A", 50, new Date("2026-01-01")),
      makeBatch("batch-B", 50, new Date("2026-12-01")),
    ]);

    await InventoryMovementsDB.decrementFEFO(1, 10);

    // Only batch-A should be updated (10 <= 50, no remainder)
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith({
      where: { id: "batch-A" },
      data: { quantity: 40 }, // 50 - 10
    });
  });

  it("does not update batches when no batches exist", async () => {
    mockBatchFindMany.mockResolvedValue([]);

    await InventoryMovementsDB.decrementFEFO(1, 5);

    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("always calls record() to decrement Product.stock globally", async () => {
    mockBatchFindMany.mockResolvedValue([]);

    await InventoryMovementsDB.decrementFEFO(1, 5);

    expect(mockInventoryMovementCreate).toHaveBeenCalledTimes(1);
    const call = mockInventoryMovementCreate.mock.calls[0][0];
    expect(call.data.productId).toBe(1);
    expect(call.data.quantity).toBe(5);
  });

  it("uses 'venta_online' as default movement type", async () => {
    mockBatchFindMany.mockResolvedValue([]);
    await InventoryMovementsDB.decrementFEFO(1, 3);
    const call = mockInventoryMovementCreate.mock.calls[0][0];
    expect(call.data.type).toBe("venta_online");
  });

  it("accepts custom type parameter", async () => {
    mockBatchFindMany.mockResolvedValue([]);
    await InventoryMovementsDB.decrementFEFO(1, 3, undefined, "venta");
    const call = mockInventoryMovementCreate.mock.calls[0][0];
    expect(call.data.type).toBe("venta");
  });

  it("propagates reference to the movement record", async () => {
    mockBatchFindMany.mockResolvedValue([]);
    await InventoryMovementsDB.decrementFEFO(1, 2, "REF-001");
    const call = mockInventoryMovementCreate.mock.calls[0][0];
    expect(call.data.reference).toBe("REF-001");
  });

  it("handles quantity larger than all batches combined (partial deduction)", async () => {
    mockBatchFindMany.mockResolvedValue([
      makeBatch("batch-A", 3, new Date("2026-01-01")),
      makeBatch("batch-B", 4, new Date("2026-06-01")),
    ]);

    // Want 20 but only 7 available in batches — should exhaust both
    await InventoryMovementsDB.decrementFEFO(1, 20);

    expect(mockBatchUpdate).toHaveBeenCalledWith({ where: { id: "batch-A" }, data: { quantity: 0 } });
    expect(mockBatchUpdate).toHaveBeenCalledWith({ where: { id: "batch-B" }, data: { quantity: 0 } });
  });
});
