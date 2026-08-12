/**
 * M1 — marketplace-orders-tenant-isolation.test.ts
 *
 * Verifica que GET /api/marketplace/orders scope tenantId + source=marketplace.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown) => ({
    payload: { error: String(err) },
    status: 500,
  })),
  newTraceId: vi.fn(() => "trace-test"),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  cacheStore: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppNotificationWithRetry: vi.fn().mockResolvedValue(undefined),
  sendWhatsAppQueued: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/push-sender", () => ({
  sendPushToPhone: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/create-notification", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({
    tenantId: "tenant-a",
    username: "qa",
    role: "admin",
  })),
}));

const mockOrderFindMany = vi.fn();
const mockOrderFindFirst = vi.fn();
const mockOrderUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: {
      findMany: mockOrderFindMany,
      findFirst: mockOrderFindFirst,
      update: mockOrderUpdate,
    },
  },
}));

// MarketplaceOrdersDB puede usarse también — mock completo
vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceOrdersDB: {
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({}),
  },
  MarketplaceStoresDB: {
    getBySlug: vi.fn(),
  },
}));

const { GET } = await import("@/app/api/marketplace/orders/route");

describe("GET /api/marketplace/orders — tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrderFindMany.mockResolvedValue([]);
  });

  it("where incluye tenantId: auth.tenantId", async () => {
    const req = new NextRequest("http://localhost/api/marketplace/orders");
    await GET(req);

    expect(mockOrderFindMany).toHaveBeenCalledOnce();
    const { where } = mockOrderFindMany.mock.calls[0][0];
    expect(where).toMatchObject({ tenantId: "tenant-a" });
  });

  it("where incluye source: 'marketplace'", async () => {
    const req = new NextRequest("http://localhost/api/marketplace/orders");
    await GET(req);

    const { where } = mockOrderFindMany.mock.calls[0][0];
    expect(where).toMatchObject({ source: "marketplace" });
  });

  it("no filtra datos de otros tenants (tenant-b no aparece en where)", async () => {
    const req = new NextRequest("http://localhost/api/marketplace/orders");
    await GET(req);

    const { where } = mockOrderFindMany.mock.calls[0][0];
    expect(where.tenantId).not.toBe("tenant-b");
  });
});
