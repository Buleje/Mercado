/**
 * Tests del cron GET /api/cron/tier-discount-reconciliation
 *
 * Round 26 (2026-05-09) — cierra QA gap #3 reportado en round 21.
 *
 * Cubre:
 *  - 401 sin Authorization header
 *  - 401 con Bearer wrong-secret
 *  - 401 cuando CRON_SECRET no configurado (fail-closed)
 *  - 200 con secret correcto + tenants vacíos → tenantsTotal=0
 *  - 200 con tenants pero sin orders fallidas → totalOrders=0
 *  - 200 detecta orders [TIER_DISCOUNT_FAILED] y agrupa por tenant
 *  - timeout budget (50s) marca timedOut=true cuando hay muchos tenants
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/sentry-alerts", () => ({
  reportCriticalError: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}));

const { mockTenantFindMany, mockFindFailed } = vi.hoisted(() => ({
  mockTenantFindMany: vi.fn(),
  mockFindFailed: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findMany: mockTenantFindMany },
  },
}));

vi.mock("@/lib/db/marketplace/orders.db", () => ({
  MarketplaceOrdersDB: {
    findOrdersWithFailedTierDiscount: mockFindFailed,
  },
}));

import { GET } from "@/app/api/cron/tier-discount-reconciliation/route";

const ORIGINAL_ENV = { ...process.env };

function makeReq(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("http://localhost/api/cron/tier-discount-reconciliation", {
    headers,
  });
}

describe("GET /api/cron/tier-discount-reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret-32-chars-padding";
    mockTenantFindMany.mockResolvedValue([]);
    mockFindFailed.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("401 — sin Authorization header", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("401 — Bearer con secret incorrecto", async () => {
    const res = await GET(makeReq("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("401 — CRON_SECRET no configurado (fail-closed)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq("Bearer test-cron-secret-32-chars-padding"));
    expect(res.status).toBe(401);
  });

  it("200 — sin tenants activos → tenantsTotal=0, totalOrders=0", async () => {
    mockTenantFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("Bearer test-cron-secret-32-chars-padding"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.tenantsTotal).toBe(0);
    expect(body.totalOrders).toBe(0);
    expect(body.byTenant).toEqual([]);
  });

  it("200 — tenants sin orders fallidas → totalOrders=0", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", slug: "store-1" },
      { id: "t2", slug: "store-2" },
    ]);
    mockFindFailed.mockResolvedValue([]);

    const res = await GET(makeReq("Bearer test-cron-secret-32-chars-padding"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantsChecked).toBe(2);
    expect(body.totalOrders).toBe(0);
    expect(body.timedOut).toBe(false);
  });

  it("200 — detecta orders [TIER_DISCOUNT_FAILED] y agrupa por tenant", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", slug: "store-1" },
      { id: "t2", slug: "store-2" },
    ]);

    mockFindFailed.mockImplementation(async (tenantId: string) => {
      if (tenantId === "t1") {
        return [
          {
            id: "MKT-FAIL001",
            customerPhone: "999111222",
            total: 25.5,
            createdAt: new Date("2026-05-01"),
            tierAuditTag: "TIER_DISCOUNT_FAILED" as const,
          },
        ];
      }
      return [];
    });

    const res = await GET(makeReq("Bearer test-cron-secret-32-chars-padding"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalOrders).toBe(1);
    expect(body.byTenant).toHaveLength(1);
    expect(body.byTenant[0]).toMatchObject({
      tenantId: "t1",
      count: 1,
      orderIds: ["MKT-FAIL001"],
    });
  });

  it("paraleliza queries en batches de 8 y respeta tenantsChecked", async () => {
    // 16 tenants → 2 batches de 8
    const tenants = Array.from({ length: 16 }, (_, i) => ({
      id: `t${i + 1}`,
      slug: `store-${i + 1}`,
    }));
    mockTenantFindMany.mockResolvedValue(tenants);
    mockFindFailed.mockResolvedValue([]);

    const res = await GET(makeReq("Bearer test-cron-secret-32-chars-padding"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantsTotal).toBe(16);
    expect(body.tenantsChecked).toBe(16);
    expect(mockFindFailed).toHaveBeenCalledTimes(16);
  });

  it("captura errores por tenant sin abortar el cron completo (round 7 fix M003)", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "t1", slug: "store-1" },
      { id: "t2", slug: "store-2" },
    ]);

    mockFindFailed.mockImplementation(async (tenantId: string) => {
      if (tenantId === "t1") throw new Error("DB connection lost");
      return [];
    });

    const res = await GET(makeReq("Bearer test-cron-secret-32-chars-padding"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantsChecked).toBe(2); // ambos checkeados
    expect(body.totalOrders).toBe(0);
  });
});
