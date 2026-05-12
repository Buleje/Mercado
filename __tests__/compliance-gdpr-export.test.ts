/**
 * __tests__/compliance-gdpr-export.test.ts
 *
 * Unit tests para lib/compliance/gdpr-export.ts — Ley 29733 PE / GDPR-equivalent
 * tenant data export. Cumplimiento legal Art. 18-20 (derecho de acceso).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTenantFindFirst = vi.fn();
const mockSettingsFindFirst = vi.fn();
const mockProductFindMany = vi.fn();
const mockCustomerFindMany = vi.fn();
const mockOrderFindMany = vi.fn();
const mockLoyaltyFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findFirst: (...a: unknown[]) => mockTenantFindFirst(...a) },
    settings: { findFirst: (...a: unknown[]) => mockSettingsFindFirst(...a) },
    product: { findMany: (...a: unknown[]) => mockProductFindMany(...a) },
    customer: { findMany: (...a: unknown[]) => mockCustomerFindMany(...a) },
    order: { findMany: (...a: unknown[]) => mockOrderFindMany(...a) },
    loyaltyTransaction: { findMany: (...a: unknown[]) => mockLoyaltyFindMany(...a) },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildTenantExport } from "@/lib/compliance/gdpr-export";

beforeEach(() => {
  vi.clearAllMocks();
  // Default mocks return empty/null
  mockTenantFindFirst.mockResolvedValue(null);
  mockSettingsFindFirst.mockResolvedValue(null);
  mockProductFindMany.mockResolvedValue([]);
  mockCustomerFindMany.mockResolvedValue([]);
  mockOrderFindMany.mockResolvedValue([]);
  mockLoyaltyFindMany.mockResolvedValue([]);
});

describe("buildTenantExport — estructura base", () => {
  it("retorna estructura TenantDataExport completa", async () => {
    const result = await buildTenantExport("tenant-1", "admin@buleje.pe");
    expect(result).toHaveProperty("tenantId", "tenant-1");
    expect(result).toHaveProperty("exportedAt");
    expect(result).toHaveProperty("requestedBy", "admin@buleje.pe");
    expect(result).toHaveProperty("scope", "full");
    expect(result).toHaveProperty("data");
  });

  it("exportedAt es ISO 8601 timestamp", async () => {
    const result = await buildTenantExport("tenant-1", "admin");
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("scope default 'full' cuando no se pasa", async () => {
    const result = await buildTenantExport("tenant-1", "admin");
    expect(result.scope).toBe("full");
  });

  it("scope 'minimal' respetado cuando se pasa", async () => {
    const result = await buildTenantExport("tenant-1", "admin", "minimal");
    expect(result.scope).toBe("minimal");
  });
});

describe("buildTenantExport — scope 'full' incluye TODOS los datos", () => {
  it("hace 6 queries en Promise.all (zero N+1)", async () => {
    await buildTenantExport("tenant-1", "admin", "full");
    expect(mockTenantFindFirst).toHaveBeenCalledTimes(1);
    expect(mockSettingsFindFirst).toHaveBeenCalledTimes(1);
    expect(mockProductFindMany).toHaveBeenCalledTimes(1);
    expect(mockCustomerFindMany).toHaveBeenCalledTimes(1);
    expect(mockOrderFindMany).toHaveBeenCalledTimes(1);
    expect(mockLoyaltyFindMany).toHaveBeenCalledTimes(1);
  });

  it("incluye customers, orders, loyalty en data", async () => {
    mockCustomerFindMany.mockResolvedValue([{ id: "c1", phone: "994" }]);
    mockOrderFindMany.mockResolvedValue([{ id: "o1", total: 50 }]);
    mockLoyaltyFindMany.mockResolvedValue([{ id: "l1", points: 100 }]);

    const result = await buildTenantExport("tenant-1", "admin", "full");
    const data = result.data as Record<string, unknown>;
    expect(data.customers).toEqual([{ id: "c1", phone: "994" }]);
    expect(data.orders).toEqual([{ id: "o1", total: 50 }]);
    expect(data.loyalty).toEqual([{ id: "l1", points: 100 }]);
  });

  it("orders incluye items relacionados", async () => {
    await buildTenantExport("tenant-1", "admin", "full");
    expect(mockOrderFindMany.mock.calls[0][0].include).toEqual({ items: true });
  });

  it("orders limitado a 5000 (anti-OOM tenants masivos)", async () => {
    await buildTenantExport("tenant-1", "admin", "full");
    expect(mockOrderFindMany.mock.calls[0][0].take).toBe(5000);
  });

  it("loyalty limitado a 5000 (anti-OOM)", async () => {
    await buildTenantExport("tenant-1", "admin", "full");
    expect(mockLoyaltyFindMany.mock.calls[0][0].take).toBe(5000);
  });
});

describe("buildTenantExport — scope 'minimal' NO incluye PII", () => {
  it("NO consulta customers (PII protegida)", async () => {
    await buildTenantExport("tenant-1", "admin", "minimal");
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
  });

  it("NO consulta orders (transactional)", async () => {
    await buildTenantExport("tenant-1", "admin", "minimal");
    expect(mockOrderFindMany).not.toHaveBeenCalled();
  });

  it("NO consulta loyalty (PII)", async () => {
    await buildTenantExport("tenant-1", "admin", "minimal");
    expect(mockLoyaltyFindMany).not.toHaveBeenCalled();
  });

  it("SÍ consulta tenant + settings + products (no PII)", async () => {
    await buildTenantExport("tenant-1", "admin", "minimal");
    expect(mockTenantFindFirst).toHaveBeenCalledTimes(1);
    expect(mockSettingsFindFirst).toHaveBeenCalledTimes(1);
    expect(mockProductFindMany).toHaveBeenCalledTimes(1);
  });

  it("customers/orders/loyalty en data quedan vacíos []", async () => {
    const result = await buildTenantExport("tenant-1", "admin", "minimal");
    const data = result.data as Record<string, unknown>;
    expect(data.customers).toEqual([]);
    expect(data.orders).toEqual([]);
    expect(data.loyalty).toEqual([]);
  });
});

describe("buildTenantExport — multi-tenant isolation", () => {
  it("tenant.findFirst usa OR [id, slug] (flexibilidad lookup)", async () => {
    await buildTenantExport("tenant-1", "admin");
    expect(mockTenantFindFirst.mock.calls[0][0].where).toEqual({
      OR: [{ id: "tenant-1" }, { slug: "tenant-1" }],
    });
  });

  it("settings/products/customers/orders/loyalty TODOS scopean por tenantId", async () => {
    await buildTenantExport("tenant-A", "admin", "full");
    expect(mockSettingsFindFirst.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A" });
    expect(mockProductFindMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A" });
    expect(mockCustomerFindMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A" });
    expect(mockOrderFindMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A" });
    expect(mockLoyaltyFindMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant-A" });
  });
});

describe("buildTenantExport — counts metadata", () => {
  it("incluye counts.products en data", async () => {
    mockProductFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const result = await buildTenantExport("tenant-1", "admin");
    const data = result.data as { counts: { products: number } };
    expect(data.counts.products).toBe(3);
  });

  it("incluye counts.customers + counts.orders", async () => {
    mockCustomerFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    mockOrderFindMany.mockResolvedValue([{ id: "o1" }]);
    const result = await buildTenantExport("tenant-1", "admin");
    const data = result.data as { counts: { customers: number; orders: number } };
    expect(data.counts.customers).toBe(2);
    expect(data.counts.orders).toBe(1);
  });

  it("counts NO falla si scope minimal (customers/orders []=0)", async () => {
    mockProductFindMany.mockResolvedValue([{ id: 1 }]);
    const result = await buildTenantExport("tenant-1", "admin", "minimal");
    const data = result.data as { counts: { products: number; customers: number; orders: number } };
    expect(data.counts.products).toBe(1);
    expect(data.counts.customers).toBe(0);
    expect(data.counts.orders).toBe(0);
  });
});

describe("buildTenantExport — error handling", () => {
  it("retorna export con data.error si Prisma falla", async () => {
    mockTenantFindFirst.mockRejectedValue(new Error("DB connection lost"));
    const result = await buildTenantExport("tenant-1", "admin");
    expect(result.data).toEqual({ error: "export failed" });
    expect(result.tenantId).toBe("tenant-1");
    expect(result.requestedBy).toBe("admin");
  });

  it("graceful fail: NO throw incluso si DB no responde", async () => {
    mockProductFindMany.mockRejectedValue(new Error("Timeout"));
    await expect(
      buildTenantExport("tenant-1", "admin"),
    ).resolves.toBeDefined();
  });
});
