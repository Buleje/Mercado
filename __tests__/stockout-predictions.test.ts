/**
 * Tests unitarios — lib/db/stockout-predictions.db.ts
 *
 * Cubre:
 *  - compute() con datos sintéticos
 *  - severidad según daysToStockout
 *  - confianza según datapoints
 *  - getByStore() con filtros
 *  - cleanup() borra solo expired
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock de Prisma
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    stockoutPrediction: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    storeProduct: {
      findMany: vi.fn(),
    },
    orderItem: {
      aggregate: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

// El cache real exporta getOrSet + invalidateByPrefix.
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidateByPrefix: vi.fn(),
  invalidate: vi.fn(),
  invalidateAll: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { StockoutPredictionsDB } from "@/lib/db/stockout-predictions.db";

describe("StockoutPredictionsDB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stockoutPrediction.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.stockoutPrediction.createMany.mockResolvedValue({ count: 1 });
  });

  describe("compute()", () => {
    it("genera prediction medium con stock 5 y avgDailyUnits 1 (≈5 días)", async () => {
      mockPrisma.storeProduct.findMany.mockResolvedValueOnce([
        { id: "sp-1", productId: 101, product: { id: 101, stock: 5 } },
      ]);
      mockPrisma.orderItem.aggregate.mockResolvedValueOnce({
        _sum: { quantity: 30 },
        _count: { _all: 12 },
      });

      const created = await StockoutPredictionsDB.compute("tenant-A", "store-1");

      expect(created).toBe(1);
      expect(mockPrisma.stockoutPrediction.createMany).toHaveBeenCalledOnce();
      const callArg = mockPrisma.stockoutPrediction.createMany.mock.calls[0][0];
      expect(callArg.data).toHaveLength(1);
      const p = callArg.data[0];
      expect(p.predictedDaysToStockout).toBeCloseTo(5, 1);
      expect(p.severity).toBe("medium");
      expect(p.confidence).toBe(0.9); // 12 datapoints
      expect(p.currentStock).toBe(5);
      expect(p.avgDailyUnits).toBeCloseTo(1, 2);
    });

    it("genera severity critical con stock 1 y avgDailyUnits 2 (0.5 días)", async () => {
      mockPrisma.storeProduct.findMany.mockResolvedValueOnce([
        { id: "sp-2", productId: 102, product: { id: 102, stock: 1 } },
      ]);
      mockPrisma.orderItem.aggregate.mockResolvedValueOnce({
        _sum: { quantity: 60 },
        _count: { _all: 20 },
      });

      await StockoutPredictionsDB.compute("tenant-A", "store-1");

      const callArg = mockPrisma.stockoutPrediction.createMany.mock.calls[0][0];
      expect(callArg.data[0].severity).toBe("critical");
    });

    it("skipea productos sin ventas (datapoints = 0)", async () => {
      mockPrisma.storeProduct.findMany.mockResolvedValueOnce([
        { id: "sp-3", productId: 103, product: { id: 103, stock: 100 } },
      ]);
      mockPrisma.orderItem.aggregate.mockResolvedValueOnce({
        _sum: { quantity: null },
        _count: { _all: 0 },
      });

      const created = await StockoutPredictionsDB.compute("tenant-A", "store-1");

      expect(created).toBe(0);
      expect(mockPrisma.stockoutPrediction.createMany).not.toHaveBeenCalled();
    });

    it("confidence escalada: 12 ventas → 0.9, 6 → 0.7, 2 → 0.5", async () => {
      mockPrisma.storeProduct.findMany.mockResolvedValueOnce([
        { id: "a", productId: 1, product: { id: 1, stock: 10 } },
        { id: "b", productId: 2, product: { id: 2, stock: 10 } },
        { id: "c", productId: 3, product: { id: 3, stock: 10 } },
      ]);
      mockPrisma.orderItem.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 30 }, _count: { _all: 12 } })
        .mockResolvedValueOnce({ _sum: { quantity: 30 }, _count: { _all: 6 } })
        .mockResolvedValueOnce({ _sum: { quantity: 30 }, _count: { _all: 2 } });

      await StockoutPredictionsDB.compute("tenant-A", "store-1");

      const data = mockPrisma.stockoutPrediction.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(3);
      expect(data[0].confidence).toBe(0.9);
      expect(data[1].confidence).toBe(0.7);
      expect(data[2].confidence).toBe(0.5);
    });

    it("borra predicciones anteriores antes de crear las nuevas", async () => {
      mockPrisma.storeProduct.findMany.mockResolvedValueOnce([]);
      await StockoutPredictionsDB.compute("tenant-A", "store-1");
      expect(mockPrisma.stockoutPrediction.deleteMany).toHaveBeenCalledWith({
        where: { tenantId: "tenant-A", storeId: "store-1" },
      });
    });
  });

  describe("getByStore()", () => {
    it("filtra por severity correctamente", async () => {
      mockPrisma.stockoutPrediction.findMany.mockResolvedValueOnce([]);
      await StockoutPredictionsDB.getByStore("tenant-A", "store-1", {
        severity: ["critical", "high"],
      });
      const call = mockPrisma.stockoutPrediction.findMany.mock.calls[0][0];
      expect(call.where.severity).toEqual({ in: ["critical", "high"] });
      expect(call.where.tenantId).toBe("tenant-A");
      expect(call.where.storeId).toBe("store-1");
    });
  });

  describe("cleanup()", () => {
    it("borra solo expired (expiresAt <= now)", async () => {
      mockPrisma.stockoutPrediction.deleteMany.mockResolvedValueOnce({ count: 7 });
      const count = await StockoutPredictionsDB.cleanup("tenant-A");
      expect(count).toBe(7);
      const call = mockPrisma.stockoutPrediction.deleteMany.mock.calls[0][0];
      expect(call.where.tenantId).toBe("tenant-A");
      expect(call.where.expiresAt).toHaveProperty("lte");
    });
  });
});
