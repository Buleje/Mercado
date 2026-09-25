/**
 * Tests unitarios — /api/marketplace/products/[id]/badges
 *
 * Usa prisma directo (no DB class):
 *   - prisma.product.findFirst → { id, stock }
 *   - prisma.storeProduct.findFirst → { store: { rating, zone } }
 *   - prisma.orderItem.groupBy → top sellers
 *   - prisma.review.aggregate → avgRating
 *   - prisma.product.aggregate → _max.id (para badge "new")
 *
 * Badge "new": proxy por ID — producto en top 10% más reciente (id >= maxId * 0.9)
 * Badge "low-stock": stock < 5
 * Badge "best-seller": productId en top 5 de orderItem.groupBy
 * Cache: solo sin lat/lng
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown, _traceId: string) => ({
    payload: { error: err instanceof Error ? err.message : "Internal error" },
    status: 500,
  })),
  newTraceId: vi.fn(() => "trace-test-123"),
}));

const { mockGetOrSet } = vi.hoisted(() => ({ mockGetOrSet: vi.fn() }));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: mockGetOrSet,
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

const {
  mockProductFindFirst,
  mockStoreProductFindFirst,
  mockOrderItemGroupBy,
  mockReviewAggregate,
  mockProductAggregate,
} = vi.hoisted(() => ({
  mockProductFindFirst: vi.fn(),
  mockStoreProductFindFirst: vi.fn(),
  mockOrderItemGroupBy: vi.fn(),
  mockReviewAggregate: vi.fn(),
  mockProductAggregate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findFirst: mockProductFindFirst,
      aggregate: mockProductAggregate,
    },
    storeProduct: {
      findFirst: mockStoreProductFindFirst,
    },
    orderItem: {
      groupBy: mockOrderItemGroupBy,
    },
    review: {
      aggregate: mockReviewAggregate,
    },
  },
}));

import { GET } from "@/app/api/marketplace/products/[id]/badges/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeParams(id = "42") {
  return { params: Promise.resolve({ id }) };
}

function makeGetReq(id = "42", qs = "", tenantId = "test-tenant") {
  return new NextRequest(`https://host/api/marketplace/products/${id}/badges${qs}`, {
    headers: { "x-tenant-id": tenantId },
  });
}

// Defaults para mocks que no interesan en cada test específico
function setupDefaultMocks(overrides: {
  stock?: number | null;
  storeRating?: number;
  topSellers?: { productId: number; _sum: { quantity: number | null } }[];
  maxId?: number;
  productId?: number;
  tenantId?: string;
} = {}) {
  const productId = overrides.productId ?? 42;
  // Round 13: handler primero hace findFirst para resolver productOwner.tenantId,
  // luego dentro de computeBadges hace otro findFirst con stock real. Ambos calls
  // van al mismo mock. Devolvemos un objeto con AMBOS shapes para satisfacer ambos.
  mockProductFindFirst.mockResolvedValue({
    id: productId,
    stock: overrides.stock ?? 20,
    tenantId: overrides.tenantId ?? "test-tenant",
  });
  mockStoreProductFindFirst.mockResolvedValue({
    store: { rating: overrides.storeRating ?? 4.0, zone: null },
  });
  mockOrderItemGroupBy.mockResolvedValue(overrides.topSellers ?? []);
  mockReviewAggregate.mockResolvedValue({ _avg: { rating: 4.0 } });
  mockProductAggregate.mockResolvedValue({ _max: { id: overrides.maxId ?? 100 } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/products/[id]/badges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Por defecto: getOrSet ejecuta el fn real (sin cache hit)
    mockGetOrSet.mockImplementation(
      async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()
    );
  });

  it("stock=3 → incluye badge 'low-stock' con details.lowStock=3", async () => {
    setupDefaultMocks({ stock: 3, maxId: 100 });
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.badges).toContain("low-stock");
    expect(body.details.lowStock).toBe(3);
  });

  it("stock=10 → NO incluye badge 'low-stock'", async () => {
    setupDefaultMocks({ stock: 10 });
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(body.badges).not.toContain("low-stock");
  });

  it("producto en top 5 ventas → incluye badge 'best-seller'", async () => {
    setupDefaultMocks({
      stock: 10,
      topSellers: [
        { productId: 42, _sum: { quantity: 50 } },
        { productId: 7, _sum: { quantity: 30 } },
      ],
    });
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(body.badges).toContain("best-seller");
  });

  it("producto sin ventas → NO incluye badge 'best-seller'", async () => {
    setupDefaultMocks({ stock: 10, topSellers: [] });
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(body.badges).not.toContain("best-seller");
  });

  it("producto con id=95, maxId=100 → incluye badge 'new' (id >= maxId*0.9)", async () => {
    setupDefaultMocks({ stock: 10, maxId: 100, productId: 95 });
    // id=95 >= 100*0.9=90 → badge "new"
    const res = await GET(makeGetReq("95"), makeParams("95"));
    const body = await res.json();
    expect(body.badges).toContain("new");
  });

  it("producto con id=50, maxId=100 → NO incluye badge 'new' (id < maxId*0.9)", async () => {
    setupDefaultMocks({ stock: 10, maxId: 100, productId: 50 });
    // id=50 < 100*0.9=90 → no badge "new"
    const res = await GET(makeGetReq("50"), makeParams("50"));
    const body = await res.json();
    expect(body.badges).not.toContain("new");
  });

  it("cache hit: getOrSet se invoca con la clave que incluye productId y tenantId", async () => {
    setupDefaultMocks({ stock: 10 });
    await GET(makeGetReq(), makeParams());
    expect(mockGetOrSet).toHaveBeenCalledWith(
      expect.stringContaining("42"),
      300,
      expect.any(Function)
    );
    expect(mockGetOrSet).toHaveBeenCalledWith(
      expect.stringContaining("test-tenant"),
      300,
      expect.any(Function)
    );
  });

  it("con lat/lng en query → NO usa cache (se llama computeBadges directo)", async () => {
    setupDefaultMocks({ stock: 10 });
    const res = await GET(makeGetReq("42", "?lat=-8.37&lng=-74.55"), makeParams());
    expect(res.status).toBe(200);
    // Con lat/lng, el handler NO llama a getOrSet
    expect(mockGetOrSet).not.toHaveBeenCalled();
  });

  it("multi-tenant: tenantId derivado del producto (audit AI 2026-05-06: NO header)", async () => {
    // Handler: 1er findFirst lee tenantId del producto (NO usa header).
    // 2do findFirst (dentro de computeBadges) usa el tenantId derivado.
    setupDefaultMocks({ stock: 10, tenantId: "bodega-xyz" });
    await GET(makeGetReq("42", "", "header-fake"), makeParams());
    // El 2do call (computeBadges) debe usar tenantId="bodega-xyz" del producto,
    // NO "header-fake" del request.
    expect(mockProductFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "bodega-xyz" }) })
    );
  });
});
