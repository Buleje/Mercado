/**
 * products-db-tenant-isolation.test.ts
 *
 * Locks down ProductsDB methods that previously accepted only `id` and were
 * vulnerable to cross-tenant IDOR (a tenant-A admin could read/update/delete
 * tenant-B products by guessing product ids). Each method now requires
 * `tenantId` as the first parameter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    product: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    priceHistory: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    bundle: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn((arr) => Promise.all(arr)),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("server-only", () => ({}));

import { ProductsDB, BundlesDB, PriceHistoryDB } from "@/lib/db/products.db";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

beforeEach(() => {
  Object.values(mockPrisma.product).forEach((fn: unknown) => (fn as ReturnType<typeof vi.fn>).mockReset?.());
  Object.values(mockPrisma.priceHistory).forEach((fn: unknown) => (fn as ReturnType<typeof vi.fn>).mockReset?.());
  Object.values(mockPrisma.bundle).forEach((fn: unknown) => (fn as ReturnType<typeof vi.fn>).mockReset?.());
  mockPrisma.$executeRaw.mockReset();
});

describe("ProductsDB.getById — cross-tenant guard", () => {
  it("returns the product when tenantId matches", async () => {
    mockPrisma.product.findFirst.mockResolvedValueOnce({
      id: 5, tenantId: TENANT_A, name: "Cocoa", category: "snacks",
      price: { toString: () => "10" }, costPrice: null, image: "x", description: null,
      unit: "u", badge: null, barcode: null, stock: null, stockMin: null, stockMax: null, active: true,
    });
    const product = await ProductsDB.getById(TENANT_A, 5);
    expect(product?.id).toBe(5);
    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 5, tenantId: TENANT_A, deletedAt: null },
    });
  });

  it("returns null when the row belongs to a different tenant", async () => {
    mockPrisma.product.findFirst.mockResolvedValueOnce(null);
    const product = await ProductsDB.getById(TENANT_A, 5);
    expect(product).toBeNull();
  });

  /**
   * El borrado de productos es SOFT. Hasta 2026-08-11 este método no filtraba
   * `deletedAt`, así que `DELETE /api/products/<id>` devolvía 200, el producto
   * salía de la lista y un GET por id lo seguía trayendo con `active: true`.
   * Lo consultan por id el recomendador, el agente de pricing y el asistente
   * IA: todos podían operar sobre mercadería dada de baja.
   */
  it("no devuelve un producto dado de baja", async () => {
    await ProductsDB.getById(TENANT_A, 5);
    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ deletedAt: null }),
    });
  });

  it("getByIdIncluyendoBorrados sí los trae, para mirar hacia atrás", async () => {
    await ProductsDB.getByIdIncluyendoBorrados(TENANT_A, 5);
    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 5, tenantId: TENANT_A },
    });
  });
});

describe("ProductsDB.delete — soft-delete tenant guard", () => {
  it("invokes $executeRaw with id AND tenantId interpolated", async () => {
    mockPrisma.$executeRaw.mockResolvedValueOnce(undefined);
    await ProductsDB.delete(TENANT_A, 5);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledOnce();
    // Prisma tagged-template values land as the 2nd+ args.
    const callArgs = mockPrisma.$executeRaw.mock.calls[0] as unknown[];
    const params = callArgs.slice(1);
    expect(params).toEqual([5, TENANT_A]);
  });
});

describe("ProductsDB.hardDelete — uses deleteMany with tenant guard", () => {
  it("filters by tenantId so a wrong tenant simply matches zero rows", async () => {
    mockPrisma.product.deleteMany.mockResolvedValueOnce({ count: 0 });
    await ProductsDB.hardDelete(TENANT_A, 5);
    expect(mockPrisma.product.deleteMany).toHaveBeenCalledWith({
      where: { id: 5, tenantId: TENANT_A },
    });
  });
});

describe("ProductsDB.bulkDelete — scoped to tenant", () => {
  it("includes tenantId in updateMany where", async () => {
    mockPrisma.product.updateMany.mockResolvedValueOnce({ count: 2 });
    const result = await ProductsDB.bulkDelete(TENANT_A, [1, 2, 3]);
    expect(result).toBe(2);
    expect(mockPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2, 3] }, tenantId: TENANT_A, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("returns 0 when ids is empty without hitting the DB", async () => {
    const result = await ProductsDB.bulkDelete(TENANT_A, []);
    expect(result).toBe(0);
    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
  });
});

describe("ProductsDB.upsert — pre-check denies cross-tenant overwrite", () => {
  const mkProduct = (id: number, tenantId: string) => ({
    id, name: "x", category: "y", price: 1, image: "i", unit: "u",
    badge: undefined, barcode: undefined, stock: undefined,
    stockMin: undefined, stockMax: undefined, active: true, tenantId,
  });

  it("throws when an existing product belongs to a different tenant", async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({ tenantId: TENANT_B });
    await expect(ProductsDB.upsert(mkProduct(7, TENANT_A))).rejects.toThrow(/cross-tenant/i);
    expect(mockPrisma.product.upsert).not.toHaveBeenCalled();
  });

  it("proceeds when the existing product is owned by the same tenant", async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({ tenantId: TENANT_A });
    mockPrisma.product.upsert.mockResolvedValueOnce({
      id: 7, tenantId: TENANT_A, name: "x", category: "y",
      price: { toString: () => "1" }, costPrice: null, image: "i", description: null,
      unit: "u", badge: null, barcode: null, stock: null, stockMin: null, stockMax: null, active: true,
    });
    const out = await ProductsDB.upsert(mkProduct(7, TENANT_A));
    expect(out.id).toBe(7);
    expect(mockPrisma.product.upsert).toHaveBeenCalled();
  });
});

describe("BundlesDB tenant guards", () => {
  it("getActive scopes to tenant", async () => {
    mockPrisma.bundle.findMany.mockResolvedValueOnce([]);
    await BundlesDB.getActive(TENANT_A);
    expect(mockPrisma.bundle.findMany).toHaveBeenCalledWith({
      where: { active: true, tenantId: TENANT_A },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("update returns null when no row matches the tenantId", async () => {
    mockPrisma.bundle.updateMany.mockResolvedValueOnce({ count: 0 });
    const out = await BundlesDB.update(TENANT_A, "bundle-1", { name: "x" });
    expect(out).toBeNull();
    expect(mockPrisma.bundle.findFirst).not.toHaveBeenCalled();
  });

  it("delete uses deleteMany with tenant filter", async () => {
    mockPrisma.bundle.deleteMany.mockResolvedValueOnce({ count: 1 });
    await BundlesDB.delete(TENANT_A, "bundle-1");
    expect(mockPrisma.bundle.deleteMany).toHaveBeenCalledWith({
      where: { id: "bundle-1", tenantId: TENANT_A },
    });
  });
});

describe("PriceHistoryDB tenant guards", () => {
  it("getByProduct filters by tenantId", async () => {
    mockPrisma.priceHistory.findMany.mockResolvedValueOnce([]);
    await PriceHistoryDB.getByProduct(TENANT_A, 99);
    expect(mockPrisma.priceHistory.findMany).toHaveBeenCalledWith({
      where: { productId: 99, tenantId: TENANT_A },
      orderBy: { changedAt: "desc" },
    });
  });

  it("getAll scopes to tenant and applies the limit", async () => {
    mockPrisma.priceHistory.findMany.mockResolvedValueOnce([]);
    await PriceHistoryDB.getAll(TENANT_A, 50);
    expect(mockPrisma.priceHistory.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A },
      orderBy: { changedAt: "desc" },
      take: 50,
    });
  });
});
