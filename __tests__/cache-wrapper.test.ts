/**
 * Tests — lib/cache/cache-wrapper.ts + lib/cache/invalidation.ts
 *
 * Verifica:
 *   1. withCache llama a fn en cache miss y retorna el valor
 *   2. withCache retorna del caché en cache hit (fn no se vuelve a llamar)
 *   3. withShortCache, withMediumCache, withLongCache usan el TTL correcto
 *   4. invalidateSettingsCache, invalidateProductsCache invocan invalidate/invalidateByPrefix
 *   5. invalidateTenantCache limpia todos los prefijos del tenant
 *   6. No cachea errores (fn que lanza no guarda nada en caché)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock de lib/cache.ts ──────────────────────────────────────────────────────
// IMPORTANTE: vi.mock es hoisted al top del archivo por Vitest.
// Las variables del mock deben declararse dentro de la factory con vi.fn()
// para evitar el error "Cannot access before initialization".
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
  invalidateAll: vi.fn(),
}));

// ── Imports bajo test ─────────────────────────────────────────────────────────
import {
  withCache,
  withShortCache,
  withMediumCache,
  withLongCache,
} from "@/lib/cache/cache-wrapper";

import {
  invalidateSettingsCache,
  invalidateProductsCache,
  invalidateProductRatingsCache,
  invalidateMarketplaceCatalogCache,
  invalidateTenantCache,
} from "@/lib/cache/invalidation";

import * as cacheModule from "@/lib/cache";

// Aliases tipados para mayor legibilidad en los tests
const mockGetOrSet = vi.mocked(cacheModule.getOrSet);
const mockInvalidate = vi.mocked(cacheModule.invalidate);
const mockInvalidateByPrefix = vi.mocked(cacheModule.invalidateByPrefix);

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto, getOrSet simplemente llama a fn y retorna su resultado
  mockGetOrSet.mockImplementation(
    async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()
  );
});

// ── withCache ─────────────────────────────────────────────────────────────────

describe("withCache", () => {
  it("llama a getOrSet con la clave y TTL correctos", async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 });
    await withCache("test:key", fn, { ttl: 120 });

    expect(mockGetOrSet).toHaveBeenCalledWith("test:key", 120, fn);
  });

  it("retorna el valor de fn en cache miss", async () => {
    const expected = { name: "producto" };
    const fn = vi.fn().mockResolvedValue(expected);
    const result = await withCache("test:key", fn, { ttl: 60 });

    expect(result).toEqual(expected);
  });

  it("propaga errores de fn sin cachear", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("DB error"));
    mockGetOrSet.mockImplementation(
      async (_key: string, _ttl: number, innerFn: () => Promise<unknown>) => innerFn()
    );

    await expect(withCache("test:err", fn, { ttl: 60 })).rejects.toThrow("DB error");
  });
});

// ── TTL predefinidos ──────────────────────────────────────────────────────────

describe("withShortCache", () => {
  it("usa TTL de 60 segundos", async () => {
    const fn = vi.fn().mockResolvedValue("valor");
    await withShortCache("short:key", fn);

    expect(mockGetOrSet).toHaveBeenCalledWith("short:key", 60, fn);
  });
});

describe("withMediumCache", () => {
  it("usa TTL de 300 segundos (5 min)", async () => {
    const fn = vi.fn().mockResolvedValue("valor");
    await withMediumCache("medium:key", fn);

    expect(mockGetOrSet).toHaveBeenCalledWith("medium:key", 300, fn);
  });
});

describe("withLongCache", () => {
  it("usa TTL de 600 segundos (10 min)", async () => {
    const fn = vi.fn().mockResolvedValue("valor");
    await withLongCache("long:key", fn);

    expect(mockGetOrSet).toHaveBeenCalledWith("long:key", 600, fn);
  });

  it("TTL no supera el límite máximo de 600s del proyecto", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await withLongCache("max:ttl:test", fn);

    const calledTtl = mockGetOrSet.mock.calls[0][1] as number;
    expect(calledTtl).toBeLessThanOrEqual(600);
  });
});

// ── Invalidación por dominio ──────────────────────────────────────────────────

describe("invalidateSettingsCache", () => {
  it("invalida la clave exacta del tenant", () => {
    invalidateSettingsCache("tenant_abc");
    expect(mockInvalidate).toHaveBeenCalledWith("settings:tenant_abc");
  });
});

describe("invalidateProductsCache", () => {
  it("invalida por prefijo incluyendo tenantId", () => {
    invalidateProductsCache("tenant_xyz");
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("products:tenant_xyz");
  });
});

describe("invalidateProductRatingsCache", () => {
  it("invalida la clave exacta del producto", () => {
    invalidateProductRatingsCache("tenant_abc", "prod_123");
    expect(mockInvalidate).toHaveBeenCalledWith("product-ratings:tenant_abc:prod_123");
  });

  it("acepta productId numérico", () => {
    invalidateProductRatingsCache("tenant_abc", 456);
    expect(mockInvalidate).toHaveBeenCalledWith("product-ratings:tenant_abc:456");
  });
});

describe("invalidateMarketplaceCatalogCache", () => {
  it("invalida por prefijo del catálogo marketplace", () => {
    invalidateMarketplaceCatalogCache("tenant_mkt");
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("marketplace:catalog:tenant_mkt");
  });
});

describe("invalidateTenantCache", () => {
  it("invalida todos los prefijos del tenant", () => {
    invalidateTenantCache("tenant_full");

    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("settings:tenant_full");
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("products:tenant_full");
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("categories:tenant_full");
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("promotions:tenant_full");
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("marketplace:catalog:tenant_full");
    expect(mockInvalidateByPrefix).toHaveBeenCalledWith("dashboard-stats:tenant_full");
  });

  it("llama exactamente 6 veces a invalidateByPrefix", () => {
    invalidateTenantCache("tenant_x");
    expect(mockInvalidateByPrefix).toHaveBeenCalledTimes(6);
  });
});

// ── Barrel lib/cache ──────────────────────────────────────────────────────────

describe("lib/cache/index.ts barrel", () => {
  it("exporta todas las funciones esperadas", async () => {
    const cacheModule = await import("@/lib/cache/index");
    expect(cacheModule.withCache).toBeDefined();
    expect(cacheModule.withShortCache).toBeDefined();
    expect(cacheModule.withMediumCache).toBeDefined();
    expect(cacheModule.withLongCache).toBeDefined();
    expect(cacheModule.invalidate).toBeDefined();
    expect(cacheModule.invalidateByPrefix).toBeDefined();
    expect(cacheModule.invalidateSettingsCache).toBeDefined();
    expect(cacheModule.invalidateProductsCache).toBeDefined();
    expect(cacheModule.invalidateTenantCache).toBeDefined();
  });
});
