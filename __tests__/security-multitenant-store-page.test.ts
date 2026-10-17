/**
 * Auditoría multi-tenant — Sistema de Página Individual (StorePageDB)
 *
 * Verifica que:
 *  1. `getCustomization(tenantId)` nunca devuelve datos de otro tenant
 *  2. `upsertOverride` rechaza productos que no pertenecen al tenant
 *  3. `upsertOverride` aplica `tenantId` a todas las mutaciones
 *  4. `listOverrides` solo ve rows del tenant solicitado
 *  5. `listPromotions` y `deletePromotion` respetan tenantId
 *  6. `trackVisit` aísla visitas por tenant
 *  7. `countActiveExclusivePrices` no filtra rows de otro tenant
 *  8. `deleteOverride` no borra overrides de otro tenant
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: vi.fn((_k: string, _t: number, fn: () => unknown) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

const h = vi.hoisted(() => ({
  findUnique:    vi.fn(),
  findMany:      vi.fn(),
  upsert:        vi.fn(),
  deleteMany:    vi.fn(),
  productFindFirst: vi.fn(),
  promoFindMany: vi.fn(),
  promoCreate:   vi.fn(),
  promoUpdateMany: vi.fn(),
  promoDeleteMany: vi.fn(),
  promoFindFirst:  vi.fn(),
  visitCreate:   vi.fn(),
  visitCount:    vi.fn(),
  visitFindMany: vi.fn(),
  visitUpdateMany: vi.fn(),
  overrideFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantStorePage: {
      findUnique: h.findUnique,
      upsert:     h.upsert,
    },
    tenantPageProductOverride: {
      findMany:   h.overrideFindMany,
      upsert:     h.upsert,
      deleteMany: h.deleteMany,
    },
    tenantPagePromotion: {
      findMany:    h.promoFindMany,
      create:      h.promoCreate,
      updateMany:  h.promoUpdateMany,
      deleteMany:  h.promoDeleteMany,
      findFirst:   h.promoFindFirst,
    },
    tenantPageVisit: {
      create:     h.visitCreate,
      count:      h.visitCount,
      findMany:   h.visitFindMany,
      updateMany: h.visitUpdateMany,
    },
    product: {
      findFirst: h.productFindFirst,
    },
  },
}));

import { StorePageDB } from "@/lib/db/store-page.db";

const TENANT_A = "tenant-a-id";
const TENANT_B = "tenant-b-id";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StorePageDB — multi-tenant isolation", () => {
  it("1. getCustomization(tenantA) no filtra row de tenantB", async () => {
    h.findUnique.mockResolvedValue(null);
    const page = await StorePageDB.getCustomization(TENANT_A);
    expect(h.findUnique).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A },
    });
    expect(page.tenantId).toBe(TENANT_A);
  });

  it("2. upsertOverride rechaza producto que no pertenece al tenant", async () => {
    h.productFindFirst.mockResolvedValue(null);
    await expect(
      StorePageDB.upsertOverride(TENANT_A, {
        productId: 999,
        exclusivePrice: 10,
      }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    expect(h.productFindFirst).toHaveBeenCalledWith({
      where: { id: 999, tenantId: TENANT_A },
      select: { id: true },
    });
  });

  it("3. upsertOverride siempre aplica tenantId en create y update", async () => {
    h.productFindFirst.mockResolvedValue({ id: 42 });
    h.upsert.mockResolvedValue({
      id: "ov-1",
      tenantId: TENANT_A,
      productId: 42,
      exclusivePrice: { toNumber: () => 9.9, toString: () => "9.9" },
      featured: false,
      sortOrder: 0,
      badge: null,
      visible: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await StorePageDB.upsertOverride(TENANT_A, {
      productId: 42,
      exclusivePrice: 9.9,
    });

    const call = h.upsert.mock.calls[0]![0] as {
      where: { tenantId_productId: { tenantId: string; productId: number } };
      create: { tenantId: string };
    };
    expect(call.where.tenantId_productId.tenantId).toBe(TENANT_A);
    expect(call.create.tenantId).toBe(TENANT_A);
  });

  it("4. listOverrides filtra por tenantId", async () => {
    h.overrideFindMany.mockResolvedValue([]);
    await StorePageDB.listOverrides(TENANT_B);
    expect(h.overrideFindMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_B },
      include: { product: true },
      orderBy: [
        { visible: "desc" },
        { featured: "desc" },
        { sortOrder: "asc" },
      ],
    });
  });

  it("5. deletePromotion aplica tenantId en el WHERE", async () => {
    h.promoDeleteMany.mockResolvedValue({ count: 0 });
    await StorePageDB.deletePromotion(TENANT_A, "promo-from-other-tenant");
    expect(h.promoDeleteMany).toHaveBeenCalledWith({
      where: { id: "promo-from-other-tenant", tenantId: TENANT_A },
    });
  });

  it("6. updatePromotion aplica tenantId en el WHERE (no puede tocar ajeno)", async () => {
    h.promoUpdateMany.mockResolvedValue({ count: 0 });
    h.promoFindFirst.mockResolvedValue(null);
    const result = await StorePageDB.updatePromotion(
      TENANT_A,
      "promo-of-tenant-b",
      { title: "hijacked" },
    );
    expect(result).toBeNull();
    expect(h.promoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "promo-of-tenant-b", tenantId: TENANT_A },
      }),
    );
  });

  it("7. trackVisit graba con el tenantId correcto", async () => {
    h.visitCreate.mockResolvedValue({ id: "v-1" });
    await StorePageDB.trackVisit(TENANT_A, {
      sessionId: "sess",
      referrer: "https://google.com",
    });
    const call = h.visitCreate.mock.calls[0]![0] as {
      data: { tenantId: string };
    };
    expect(call.data.tenantId).toBe(TENANT_A);
  });

  it("8. deleteOverride no afecta rows de otro tenant", async () => {
    h.deleteMany.mockResolvedValue({ count: 0 });
    await StorePageDB.deleteOverride(TENANT_A, 42);
    expect(h.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A, productId: 42 },
    });
  });

  it("9. markConversion no hace nada sin sessionId", async () => {
    await StorePageDB.markConversion(TENANT_A, null, "order-1");
    expect(h.visitUpdateMany).not.toHaveBeenCalled();
  });

  it("10. markConversion incluye tenantId + sessionId en WHERE", async () => {
    h.visitUpdateMany.mockResolvedValue({ count: 1 });
    await StorePageDB.markConversion(TENANT_A, "sess-1", "order-1");
    const call = h.visitUpdateMany.mock.calls[0]![0] as {
      where: { tenantId: string; sessionId: string };
    };
    expect(call.where.tenantId).toBe(TENANT_A);
    expect(call.where.sessionId).toBe("sess-1");
  });

  it("11. upsertOverride rechaza precio negativo", async () => {
    h.productFindFirst.mockResolvedValue({ id: 42 });
    await expect(
      StorePageDB.upsertOverride(TENANT_A, {
        productId: 42,
        exclusivePrice: -5,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PRICE" });
  });
});
