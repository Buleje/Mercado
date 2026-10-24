/**
 * Tests unitarios — lib/db/sales-anomalies.db.ts
 *
 * Cubre:
 *  - detect() crea anomalía drop con caída ≥20%
 *  - detect() crea anomalía spike con subida ≥20%
 *  - detect() NO crea anomalía con delta <20%
 *  - getRecent() filtra por severity y direction
 *  - markNotified() bulk update
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    salesAnomaly: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    order: { aggregate: vi.fn() },
    orderItem: { aggregate: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: vi.fn(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  invalidateByPrefix: vi.fn(),
  invalidate: vi.fn(),
  invalidateAll: vi.fn(),
}));

import { SalesAnomaliesDB } from "@/lib/db/sales-anomalies.db";

describe("SalesAnomaliesDB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.salesAnomaly.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.salesAnomaly.updateMany.mockResolvedValue({ count: 0 });
  });

  function mockDayStats(
    target: { revenue: number; orders: number; units: number },
    comparison: { revenue: number; orders: number; units: number },
  ) {
    // detect() llama aggregateStoreStats() 2 veces (target + comparison),
    // y cada vez hace 2 prismas (order.aggregate + orderItem.aggregate).
    mockPrisma.order.aggregate
      .mockResolvedValueOnce({
        _sum: { total: target.revenue },
        _count: { _all: target.orders },
      })
      .mockResolvedValueOnce({
        _sum: { total: comparison.revenue },
        _count: { _all: comparison.orders },
      });
    mockPrisma.orderItem.aggregate
      .mockResolvedValueOnce({ _sum: { quantity: target.units } })
      .mockResolvedValueOnce({ _sum: { quantity: comparison.units } });
  }

  describe("detect()", () => {
    it("crea anomalía drop cuando revenue cae 33% (1000 vs 1500)", async () => {
      mockDayStats(
        { revenue: 1000, orders: 10, units: 50 },
        { revenue: 1500, orders: 12, units: 60 },
      );

      const created = await SalesAnomaliesDB.detect("tenant-A", "store-1");

      expect(created).toBeGreaterThanOrEqual(1);
      const data = mockPrisma.salesAnomaly.createMany.mock.calls[0][0].data;
      const revenueAnomaly = data.find((a: { metric: string }) => a.metric === "revenue");
      expect(revenueAnomaly).toBeDefined();
      expect(revenueAnomaly.direction).toBe("drop");
      expect(revenueAnomaly.severity).toBe("medium"); // |delta| ≈ 33 → medium
      expect(revenueAnomaly.expected).toBe(1500);
      expect(revenueAnomaly.actual).toBe(1000);
    });

    it("crea anomalía spike cuando revenue sube 50% (1500 vs 1000)", async () => {
      mockDayStats(
        { revenue: 1500, orders: 15, units: 75 },
        { revenue: 1000, orders: 10, units: 50 },
      );

      await SalesAnomaliesDB.detect("tenant-A", "store-1");

      const data = mockPrisma.salesAnomaly.createMany.mock.calls[0][0].data;
      const revenueAnomaly = data.find((a: { metric: string }) => a.metric === "revenue");
      expect(revenueAnomaly.direction).toBe("spike");
      expect(revenueAnomaly.severity).toBe("high"); // |delta| = 50 → high
    });

    it("NO crea anomalía cuando delta <20% en todas las métricas", async () => {
      mockDayStats(
        { revenue: 1100, orders: 11, units: 55 },
        { revenue: 1000, orders: 10, units: 50 },
      );

      const created = await SalesAnomaliesDB.detect("tenant-A", "store-1");

      expect(created).toBe(0);
      expect(mockPrisma.salesAnomaly.createMany).not.toHaveBeenCalled();
    });

    it("severity critical cuando |delta| > 60", async () => {
      mockDayStats(
        { revenue: 100, orders: 1, units: 5 },
        { revenue: 1000, orders: 10, units: 50 },
      );

      await SalesAnomaliesDB.detect("tenant-A", "store-1");

      const data = mockPrisma.salesAnomaly.createMany.mock.calls[0][0].data;
      const revenueAnomaly = data.find((a: { metric: string }) => a.metric === "revenue");
      expect(revenueAnomaly.severity).toBe("critical"); // -90% → critical
    });
  });

  describe("getRecent()", () => {
    it("filtra por severity y direction correctamente", async () => {
      mockPrisma.salesAnomaly.findMany.mockResolvedValueOnce([]);
      await SalesAnomaliesDB.getRecent("tenant-A", "store-1", {
        severity: ["critical", "high"],
        direction: "drop",
      });
      const call = mockPrisma.salesAnomaly.findMany.mock.calls[0][0];
      expect(call.where.severity).toEqual({ in: ["critical", "high"] });
      expect(call.where.direction).toBe("drop");
      expect(call.where.tenantId).toBe("tenant-A");
      expect(call.where.storeId).toBe("store-1");
    });
  });

  describe("markNotified()", () => {
    it("bulk update setea notifiedAt", async () => {
      mockPrisma.salesAnomaly.updateMany.mockResolvedValueOnce({ count: 3 });
      const count = await SalesAnomaliesDB.markNotified("tenant-A", ["a1", "a2", "a3"]);
      expect(count).toBe(3);
      const call = mockPrisma.salesAnomaly.updateMany.mock.calls[0][0];
      expect(call.where.id).toEqual({ in: ["a1", "a2", "a3"] });
      expect(call.data.notifiedAt).toBeInstanceOf(Date);
    });

    it("retorna 0 cuando lista vacía sin tocar Prisma", async () => {
      const count = await SalesAnomaliesDB.markNotified("tenant-A", []);
      expect(count).toBe(0);
      expect(mockPrisma.salesAnomaly.updateMany).not.toHaveBeenCalled();
    });
  });
});
