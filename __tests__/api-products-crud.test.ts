/**
 * __tests__/api-products-crud.test.ts
 *
 * Unit tests for GET /api/products and POST /api/products.
 * Focuses on: auth guards, Zod validation, DB interaction, error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/sse-emitter", () => ({
  emitAdminSSE: vi.fn(),
}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
  tryAdmin: vi.fn(async () => null), // anonymous by default — storefront flow
}));

// Products API uses @/lib/jsondb — ProductsDB
// FIX 2026-06: el alta usa ProductsDB.create() (id autoincrement global), no
// upsert() — ver app/api/v1/products/route.ts. Mantenemos upsert mockeado por
// si otra ruta lo usa, pero el POST asierta create.
const { mockProductsGetAll, mockProductsUpsert, mockProductsCreate } = vi.hoisted(() => ({
  mockProductsGetAll: vi.fn(),
  mockProductsUpsert: vi.fn(),
  mockProductsCreate: vi.fn(),
}));

vi.mock("@/lib/jsondb", () => ({
  ProductsDB: {
    getAll: mockProductsGetAll,
    upsert: mockProductsUpsert,
    create: mockProductsCreate,
  },
  CustomersDB: { getAll: vi.fn(), upsert: vi.fn() },
  OrdersDB: { getAll: vi.fn(), add: vi.fn(), getPage: vi.fn(), getAllFiltered: vi.fn(), getByCustomerPhone: vi.fn() },
  CouponsDB: { getByCode: vi.fn(), redeem: vi.fn(), add: vi.fn() },
  PromotionsDB: { getAll: vi.fn() },
  normalizePhone: vi.fn((p: string) => p),
}));

// Prisma mock — for plan check and tenant lookup in POST
const { mockTenantFindFirst, mockProductCount } = vi.hoisted(() => ({
  mockTenantFindFirst: vi.fn(),
  mockProductCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findFirst: mockTenantFindFirst },
    product: { count: mockProductCount },
    activityLog: { create: vi.fn(async () => {}) },
  },
}));

vi.mock("@/lib/tenant", () => ({
  prismaForTenant: vi.fn(() => ({
    product: { count: mockProductCount },
  })),
}));

// ── Import handler AFTER mocks ────────────────────────────────────────────────

import { GET, POST } from "@/app/api/products/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_AUTH = { tenantId: "main", role: "admin", username: "testadmin" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const PRODUCT = {
  id: 1,
  name: "Arroz 1kg",
  category: "Granos",
  price: 5.5,
  unit: "kg",
  active: true,
  image: "",
};

const VALID_CREATE_BODY = {
  name: "Azúcar 1kg",
  category: "Endulzantes",
  price: 3.5,
  unit: "kg",
};

function makeGet(qs = ""): NextRequest {
  return new NextRequest(`https://host/api/products${qs}`, { method: "GET" });
}

function makePost(body: unknown): NextRequest {
  return new NextRequest("https://host/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── GET /api/products ─────────────────────────────────────────────────────────

describe("GET /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProductsGetAll.mockResolvedValue([PRODUCT]);
  });

  it("returns 200 with products list (public endpoint, no auth needed)", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toBe("Arroz 1kg");
  });

  it("includes X-Total-Count header", async () => {
    const res = await GET(makeGet());
    expect(res.headers.get("X-Total-Count")).toBe("1");
  });

  it("returns empty array when no products exist", async () => {
    mockProductsGetAll.mockResolvedValue([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
    expect(res.headers.get("X-Total-Count")).toBe("0");
  });

  it("filters by category when ?category= is provided", async () => {
    mockProductsGetAll.mockResolvedValue([
      PRODUCT,
      { ...PRODUCT, id: 2, name: "Aceite", category: "Aceites" },
    ]);
    const res = await GET(makeGet("?category=Granos"));
    const body = await res.json();
    expect(body.every((p: { category: string }) => p.category === "Granos")).toBe(true);
  });

  it("returns 503 when DB throws", async () => {
    mockProductsGetAll.mockRejectedValue(new Error("DB error"));
    const res = await GET(makeGet());
    expect(res.status).toBe(503);
  });

  it("applies pagination when ?limit=1 is set", async () => {
    mockProductsGetAll.mockResolvedValue([PRODUCT, { ...PRODUCT, id: 2, name: "Azúcar" }]);
    const res = await GET(makeGet("?limit=1&page=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(res.headers.get("X-Page")).toBe("1");
    expect(res.headers.get("X-Limit")).toBe("1");
  });
});

// ── POST /api/products ────────────────────────────────────────────────────────

describe("POST /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_AUTH);
    mockTenantFindFirst.mockResolvedValue({ plan: "pro" });
    mockProductCount.mockResolvedValue(10); // below pro limit of 500
    mockProductsGetAll.mockResolvedValue([PRODUCT]);
    mockProductsUpsert.mockResolvedValue({ ...VALID_CREATE_BODY, id: 2, active: true, image: "" });
    mockProductsCreate.mockResolvedValue({ ...VALID_CREATE_BODY, id: 2, active: true, image: "" });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makePost(VALID_CREATE_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 200 with the created product on valid body", async () => {
    const res = await POST(makePost(VALID_CREATE_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Azúcar 1kg");
  });

  it("returns 400 when name is missing", async () => {
    const { name: _omit, ...noName } = VALID_CREATE_BODY;
    const res = await POST(makePost(noName));
    expect(res.status).toBe(400);
  });

  it("returns 400 when price is negative", async () => {
    const res = await POST(makePost({ ...VALID_CREATE_BODY, price: -1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when price is zero", async () => {
    const res = await POST(makePost({ ...VALID_CREATE_BODY, price: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when category is empty string", async () => {
    const res = await POST(makePost({ ...VALID_CREATE_BODY, category: "" }));
    expect(res.status).toBe(400);
  });

  it("calls ProductsDB.create with provided product data", async () => {
    await POST(makePost(VALID_CREATE_BODY));
    expect(mockProductsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Azúcar 1kg", category: "Endulzantes", price: 3.5 })
    );
  });

  it("returns 402 when plan product limit is reached", async () => {
    mockTenantFindFirst.mockResolvedValue({ plan: "free" });
    mockProductCount.mockResolvedValue(50); // free limit = 50, withinLimit(50, 50) = false
    const res = await POST(makePost(VALID_CREATE_BODY));
    expect(res.status).toBe(402);
  });
});
