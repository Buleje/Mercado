/**
 * __tests__/marketplace-stores-db.test.ts
 *
 * Unit tests para lib/db/marketplace/stores.db.ts — operaciones de tienda
 * en el marketplace multi-vendor.
 *
 * Cobertura crítica:
 *  - isSlugTaken: previene slug collision entre vendors (data integrity)
 *  - getBySlug: lookup público (consumido por storefront /marketplace/[slug])
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
// getOrSet pasthrough: solo ejecuta el computeFn, no cachea
const mockGetOrSet = vi.fn(async (_key: string, _ttl: number, fn: () => unknown) => fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  getOrSet: (...args: unknown[]) => mockGetOrSet(...args),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

import { MarketplaceStoresDB } from "@/lib/db/marketplace/stores.db";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MarketplaceStoresDB.isSlugTaken", () => {
  it("retorna false cuando el slug NO existe (nuevo vendor puede registrarlo)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await MarketplaceStoresDB.isSlugTaken("mi-tienda-nueva");
    expect(result).toBe(false);
  });

  it("retorna true cuando el slug existe Y no se excluye ningún ID", async () => {
    mockFindUnique.mockResolvedValue({ id: "store-existing-1" });
    const result = await MarketplaceStoresDB.isSlugTaken("pizza-pucallpa");
    expect(result).toBe(true);
  });

  it("retorna false si el slug pertenece al MISMO store que se está actualizando", async () => {
    mockFindUnique.mockResolvedValue({ id: "store-abc" });
    const result = await MarketplaceStoresDB.isSlugTaken("pizza-pucallpa", "store-abc");
    expect(result).toBe(false);
  });

  it("retorna true si el slug pertenece a OTRO store que el excluido", async () => {
    mockFindUnique.mockResolvedValue({ id: "store-otro" });
    const result = await MarketplaceStoresDB.isSlugTaken("pizza-pucallpa", "store-abc");
    expect(result).toBe(true);
  });

  it("query WHERE usa slug directo (índice unique en schema)", async () => {
    mockFindUnique.mockResolvedValue(null);
    await MarketplaceStoresDB.isSlugTaken("test-slug");
    expect(mockFindUnique.mock.calls[0][0].where).toEqual({ slug: "test-slug" });
  });

  it("query SELECT solo trae id (mínimo necesario, no leak de data)", async () => {
    mockFindUnique.mockResolvedValue(null);
    await MarketplaceStoresDB.isSlugTaken("test-slug");
    expect(mockFindUnique.mock.calls[0][0].select).toEqual({ id: true });
  });
});

describe("MarketplaceStoresDB.getBySlug", () => {
  it("retorna null si el slug no existe (404 storefront)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await MarketplaceStoresDB.getBySlug("inexistente");
    expect(result).toBeNull();
  });

  it("usa getOrSet con TTL 300s + cache key prefijado", async () => {
    mockFindUnique.mockResolvedValue(null);
    await MarketplaceStoresDB.getBySlug("test-slug");
    expect(mockGetOrSet).toHaveBeenCalledTimes(1);
    expect(mockGetOrSet.mock.calls[0][0]).toBe("marketplace:stores:slug:test-slug");
    expect(mockGetOrSet.mock.calls[0][1]).toBe(300);
  });
});
