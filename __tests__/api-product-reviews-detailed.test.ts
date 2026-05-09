/**
 * Tests unitarios — /api/marketplace/products/[id]/reviews-detailed
 *
 * Modelo real: prisma.review (no productReview)
 * Campo texto: "text" (no "comment")
 * customerPhone requerido para POST
 * GET no requiere auth, usa x-tenant-id header
 * Summary: { avgRating, avgQuality, avgPrice, avgDelivery, totalReviews, ratingDistribution }
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

// ── Mock: cache — passthrough para no depender de estado ──────────────────────
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

// ── Mock: prisma ──────────────────────────────────────────────────────────────
const {
  mockReviewFindMany,
  mockReviewAggregate,
  mockReviewGroupBy,
  mockReviewCreate,
  mockOrderFindFirst,
  mockProductFindFirst,
} = vi.hoisted(() => ({
  mockReviewFindMany: vi.fn(),
  mockReviewAggregate: vi.fn(),
  mockReviewGroupBy: vi.fn(),
  mockReviewCreate: vi.fn(),
  mockOrderFindFirst: vi.fn(),
  mockProductFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: {
      findMany: mockReviewFindMany,
      aggregate: mockReviewAggregate,
      groupBy: mockReviewGroupBy,
      create: mockReviewCreate,
    },
    order: {
      findFirst: mockOrderFindFirst,
    },
    // Round 13: handler hace product.findFirst para resolver tenantId del producto.
    product: {
      findFirst: mockProductFindFirst,
    },
  },
}));

// HOTFIX-A3 (2026-04-29): el endpoint ahora exige customer-session firmada.
// Mockeamos getCustomerPayload para devolver un customerId valido — el phone
// del review viene del JWT, no del body.
const { mockGetCustomerPayload } = vi.hoisted(() => ({
  mockGetCustomerPayload: vi.fn(),
}));
vi.mock("@/lib/auth/customer-session", () => ({
  getCustomerPayload: mockGetCustomerPayload,
  CUSTOMER_SESSION: { COOKIE_NAME: "buleje-customer-sess" },
}));

import { GET, POST } from "@/app/api/marketplace/products/[id]/reviews-detailed/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REVIEW_5 = {
  id: "rev-1", name: "María García", text: "Excelente",
  rating: 5, qualityRating: 5, priceRating: 4, deliveryRating: 5,
  photosJson: null, verified: true, helpfulCount: 0,
  adminReply: null, adminReplyDate: null,
  date: new Date("2026-01-10"),
};
const REVIEW_4 = { ...REVIEW_5, id: "rev-2", name: "Juan", rating: 4, qualityRating: 4, priceRating: 4, deliveryRating: 4, verified: false };
const REVIEW_3 = { ...REVIEW_5, id: "rev-3", name: "Ana", rating: 3, qualityRating: null, priceRating: null, deliveryRating: null, verified: false };

const DEFAULT_AGG = {
  _avg: { rating: 4, qualityRating: 4.5, priceRating: 4, deliveryRating: 4.5 },
  _count: { rating: 3 },
};
const DEFAULT_DIST = [
  { rating: 5, _count: { rating: 1 } },
  { rating: 4, _count: { rating: 1 } },
  { rating: 3, _count: { rating: 1 } },
];

function makeParams(id = "42") {
  return { params: Promise.resolve({ id }) };
}

function makeGetReq(qs = "", tenantId = "test-tenant") {
  return new NextRequest(`https://host/api/marketplace/products/42/reviews-detailed${qs}`, {
    headers: { "x-tenant-id": tenantId },
  });
}

function makePostReq(body: unknown, withSession = true) {
  // HOTFIX-A3: cookie de customer-session presente por default. Cuando
  // se quiere probar el rechazo 401 sin sesion, pasar withSession=false.
  return new NextRequest("https://host/api/marketplace/products/42/reviews-detailed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": "test-tenant",
      ...(withSession ? { cookie: "buleje-customer-sess=fake-token" } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID_POST = {
  text: "Muy buen producto",
  rating: 5,
  qualityRating: 4,
  customerName: "María",
};

// ── Tests GET ─────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/products/[id]/reviews-detailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReviewAggregate.mockResolvedValue(DEFAULT_AGG);
    mockReviewGroupBy.mockResolvedValue(DEFAULT_DIST);
    // Round 13: producto siempre existe con tenantId="test-tenant".
    mockProductFindFirst.mockResolvedValue({ tenantId: "test-tenant" });
  });

  it("retorna reviews + summary con promedios (200)", async () => {
    mockReviewFindMany.mockResolvedValue([REVIEW_5, REVIEW_4, REVIEW_3]);
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(3);
    expect(body.summary).toBeDefined();
    expect(body.summary.avgRating).toBeGreaterThan(0);
    expect(body.summary.totalReviews).toBe(3);
  });

  it("GET con 0 reviews → data vacío + summary con avgs en 0", async () => {
    mockReviewFindMany.mockResolvedValue([]);
    mockReviewAggregate.mockResolvedValue({
      _avg: { rating: null, qualityRating: null, priceRating: null, deliveryRating: null },
      _count: { rating: 0 },
    });
    mockReviewGroupBy.mockResolvedValue([]);
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.summary.avgRating).toBe(0);
    expect(body.summary.totalReviews).toBe(0);
    expect(body.summary.ratingDistribution[1]).toBe(0);
  });

  it("paginación cursor: nextCursor presente si hay más resultados", async () => {
    // limit=2 → getOrSet devuelve limit+1=3 items
    mockReviewFindMany.mockResolvedValue([REVIEW_5, REVIEW_4, REVIEW_3]);
    const res = await GET(makeGetReq("?limit=2"), makeParams());
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe(REVIEW_4.id);
  });

  it("nextCursor es undefined cuando caben todos los resultados en el límite", async () => {
    mockReviewFindMany.mockResolvedValue([REVIEW_5, REVIEW_4]);
    const res = await GET(makeGetReq("?limit=20"), makeParams());
    const body = await res.json();
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeUndefined();
  });

  it("ratingDistribution calculada: 5→1, 4→1, 3→1, 1→0, 2→0", async () => {
    mockReviewFindMany.mockResolvedValue([REVIEW_5, REVIEW_4, REVIEW_3]);
    const res = await GET(makeGetReq(), makeParams());
    const { ratingDistribution } = (await res.json()).summary;
    expect(ratingDistribution[5]).toBe(1);
    expect(ratingDistribution[4]).toBe(1);
    expect(ratingDistribution[3]).toBe(1);
    expect(ratingDistribution[2]).toBe(0);
    expect(ratingDistribution[1]).toBe(0);
  });

  it("avgQuality usa el valor del aggregate (null → 0)", async () => {
    mockReviewFindMany.mockResolvedValue([REVIEW_5]);
    mockReviewAggregate.mockResolvedValue({
      _avg: { rating: 5, qualityRating: null, priceRating: null, deliveryRating: null },
      _count: { rating: 1 },
    });
    mockReviewGroupBy.mockResolvedValue([{ rating: 5, _count: { rating: 1 } }]);
    const res = await GET(makeGetReq(), makeParams());
    const { avgQuality } = (await res.json()).summary;
    expect(avgQuality).toBe(0);
  });

  it("dates en reviews se devuelven como ISO string", async () => {
    mockReviewFindMany.mockResolvedValue([REVIEW_5]);
    const res = await GET(makeGetReq(), makeParams());
    const body = await res.json();
    expect(typeof body.data[0].date).toBe("string");
    expect(body.data[0].date).toContain("2026-01-10");
  });

  it("retorna 400 si limit excede 50", async () => {
    const res = await GET(makeGetReq("?limit=999"), makeParams());
    expect(res.status).toBe(400);
  });
});

// ── Tests POST ────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/products/[id]/reviews-detailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // HOTFIX-A3: customer-session valida por default → customerId="999888777".
    mockGetCustomerPayload.mockResolvedValue({
      customerId: "999888777",
      email: "maria@test.com",
      name: "María",
      tenantId: "test-tenant",
      provider: "email",
    });
    mockReviewCreate.mockResolvedValue({
      id: "rev-new", name: "María", text: "Muy buen producto",
      rating: 5, qualityRating: 4, priceRating: null, deliveryRating: null,
      verified: true, status: "pending", date: new Date("2026-01-15"),
    });
  });

  it("POST review con qualityRating válido → 201", async () => {
    mockOrderFindFirst.mockResolvedValue({ id: "ord-1" });
    const res = await POST(makePostReq(VALID_POST), makeParams());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("rev-new");
  });

  it("POST con qualityRating=6 → 400", async () => {
    const res = await POST(makePostReq({ ...VALID_POST, qualityRating: 6 }), makeParams());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("POST con qualityRating=0 → 400 (mínimo es 1)", async () => {
    const res = await POST(makePostReq({ ...VALID_POST, qualityRating: 0 }), makeParams());
    expect(res.status).toBe(400);
  });

  it("HOTFIX-A3: POST sin customer-session → 401", async () => {
    // Sin cookie → handler rechaza antes del schema parse.
    const res = await POST(makePostReq(VALID_POST, false), makeParams());
    expect(res.status).toBe(401);
  });

  it("HOTFIX-A3: customer-session inválida → 401", async () => {
    mockGetCustomerPayload.mockResolvedValueOnce(null);
    const res = await POST(makePostReq(VALID_POST), makeParams());
    expect(res.status).toBe(401);
  });

  it("customer con orden previa → verified=true en el create", async () => {
    mockOrderFindFirst.mockResolvedValue({ id: "ord-1" }); // tiene orden
    await POST(makePostReq(VALID_POST), makeParams());
    expect(mockReviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verified: true }) })
    );
  });

  it("customer sin orden previa → verified=false en el create", async () => {
    mockOrderFindFirst.mockResolvedValue(null); // sin orden
    await POST(makePostReq(VALID_POST), makeParams());
    expect(mockReviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ verified: false }) })
    );
  });

  it("multi-tenant: usa x-tenant-id del header para crear la review", async () => {
    mockOrderFindFirst.mockResolvedValue(null);
    await POST(makePostReq(VALID_POST), makeParams());
    expect(mockReviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: "test-tenant" }) })
    );
  });

  it("HOTFIX-A3: el phone del Review viene del JWT (no del body)", async () => {
    mockOrderFindFirst.mockResolvedValue(null);
    // VALID_POST ya NO trae customerPhone. El handler debe usar el customerId del JWT.
    await POST(makePostReq(VALID_POST), makeParams());
    expect(mockReviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: "999888777" }) })
    );
  });
});
