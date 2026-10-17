/**
 * Tests: SponsoredBoostsDB (C5)
 * Cubre: create con ownership check, recordImpression decrementa budget, expireOld.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { mockStoreFindFirst, mockBoostFindFirst, mockCreate, mockUpdate, mockUpdateMany, mockFindMany } = vi.hoisted(() => ({
  mockStoreFindFirst: vi.fn(),
  mockBoostFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store: { findFirst: mockStoreFindFirst },
    sponsoredBoost: {
      create: mockCreate,
      update: mockUpdate,
      updateMany: mockUpdateMany,
      findFirst: mockBoostFindFirst,
      findMany: mockFindMany,
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  invalidateByPrefix: vi.fn().mockResolvedValue(undefined),
}));

import { SponsoredBoostsDB } from "@/lib/db/sponsored-boosts.db";
import { ForbiddenError, NotFoundError } from "@/lib/api-error";

const TENANT = "main";

function fakeBoostRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "boost-1",
    tenantId: TENANT,
    storeId: "store-1",
    productId: 1,
    bidAmount: 10,
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
    status: "active",
    impressionsCount: 0,
    clicksCount: 0,
    conversionsCount: 0,
    totalSpentPen: 0,
    maxBudgetPen: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("SponsoredBoostsDB.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza ForbiddenError si la store no pertenece al tenant", async () => {
    mockStoreFindFirst.mockResolvedValueOnce(null);

    await expect(
      SponsoredBoostsDB.create(TENANT, {
        storeId: "store-otro",
        productId: 1,
        bidAmount: 10,
        startDate: new Date(),
        endDate: new Date(),
        maxBudgetPen: 100,
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("crea boost cuando la store pertenece al tenant", async () => {
    mockStoreFindFirst.mockResolvedValueOnce({ id: "store-1" });
    mockCreate.mockResolvedValueOnce(fakeBoostRow());

    const result = await SponsoredBoostsDB.create(TENANT, {
      storeId: "store-1",
      productId: 1,
      bidAmount: 10,
      startDate: new Date(),
      endDate: new Date(),
      maxBudgetPen: 100,
    });

    expect(result.id).toBe("boost-1");
    expect(result.status).toBe("active");
    expect(result.bidAmount).toBe(10);
    expect(result.totalSpentPen).toBe(0);
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});

describe("SponsoredBoostsDB.pause / resume / cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pause: lanza NotFoundError si el boost no existe", async () => {
    mockBoostFindFirst.mockResolvedValueOnce(null);
    await expect(SponsoredBoostsDB.pause(TENANT, "boost-x")).rejects.toThrow(NotFoundError);
  });

  it("pause: lanza ForbiddenError si el boost no está activo", async () => {
    mockBoostFindFirst.mockResolvedValueOnce(fakeBoostRow({ status: "paused" }));
    await expect(SponsoredBoostsDB.pause(TENANT, "boost-1")).rejects.toThrow(ForbiddenError);
  });

  it("pause: actualiza a paused cuando está activo", async () => {
    mockBoostFindFirst.mockResolvedValueOnce(fakeBoostRow({ status: "active" }));
    mockUpdate.mockResolvedValueOnce(fakeBoostRow({ status: "paused" }));

    const result = await SponsoredBoostsDB.pause(TENANT, "boost-1");
    expect(result.status).toBe("paused");
  });

  it("resume: actualiza a active cuando está pausado", async () => {
    mockBoostFindFirst.mockResolvedValueOnce(fakeBoostRow({ status: "paused" }));
    mockUpdate.mockResolvedValueOnce(fakeBoostRow({ status: "active" }));

    const result = await SponsoredBoostsDB.resume(TENANT, "boost-1");
    expect(result.status).toBe("active");
  });
});

describe("SponsoredBoostsDB.recordImpression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no hace nada si el boost no existe o no está activo", async () => {
    mockBoostFindFirst.mockResolvedValueOnce(null);
    await SponsoredBoostsDB.recordImpression(TENANT, "boost-inexistente");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("incrementa impressionsCount y cobra CPM (bidAmount/1000)", async () => {
    mockBoostFindFirst.mockResolvedValueOnce({
      bidAmount: 10,
      totalSpentPen: 0,
      maxBudgetPen: 100,
    });
    mockUpdate.mockResolvedValueOnce({});

    await SponsoredBoostsDB.recordImpression(TENANT, "boost-1");

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.impressionsCount).toEqual({ increment: 1 });
    // CPM: 10/1000 = 0.01
    expect(Number(updateData.totalSpentPen)).toBeCloseTo(0.01);
  });

  it("marca como exhausted cuando totalSpentPen >= maxBudgetPen", async () => {
    mockBoostFindFirst.mockResolvedValueOnce({
      bidAmount: 10,
      totalSpentPen: 99.99,
      maxBudgetPen: 100,
    });
    mockUpdate.mockResolvedValueOnce({});

    await SponsoredBoostsDB.recordImpression(TENANT, "boost-1");

    const updateData = mockUpdate.mock.calls[0][0].data;
    // 99.99 + 0.01 = 100 >= 100 → exhausted
    expect(updateData.status).toBe("exhausted");
  });

  it("NO marca exhausted cuando hay budget disponible", async () => {
    mockBoostFindFirst.mockResolvedValueOnce({
      bidAmount: 10,
      totalSpentPen: 5,
      maxBudgetPen: 100,
    });
    mockUpdate.mockResolvedValueOnce({});

    await SponsoredBoostsDB.recordImpression(TENANT, "boost-1");

    const updateData = mockUpdate.mock.calls[0][0].data;
    expect(updateData.status).toBeUndefined();
  });
});

describe("SponsoredBoostsDB.expireOld", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("actualiza boosts vencidos a status expired y devuelve el count", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 3 });

    const count = await SponsoredBoostsDB.expireOld(TENANT);

    expect(count).toBe(3);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          status: { in: ["active", "paused"] },
        }),
        data: { status: "expired" },
      }),
    );
  });

  it("devuelve 0 si no hay boosts vencidos", async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const count = await SponsoredBoostsDB.expireOld(TENANT);

    expect(count).toBe(0);
  });
});
