/**
 * reviews-fraud.test.ts
 *
 * Cobertura: POST /api/marketplace/stores/[slug]/reviews
 * Validaciones anti-fraude: orderId requerido, orden existente, tenant scope,
 * estado válido, review duplicada.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown) => ({
    error: String(err),
  })),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/url-allowlist", () => ({
  isAllowedImageUrl: vi.fn(() => true),
}));

// ── Mocks Prisma ──────────────────────────────────────────────────────────────

const {
  mockOrderFindFirst,
  mockReviewFindFirst,
  mockReviewCreate,
  mockStoreUpdate,
} = vi.hoisted(() => ({
  mockOrderFindFirst:  vi.fn(),
  mockReviewFindFirst: vi.fn(),
  mockReviewCreate:    vi.fn(),
  mockStoreUpdate:     vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order:  { findFirst: mockOrderFindFirst },
    review: { findFirst: mockReviewFindFirst, create: mockReviewCreate },
    store:  { update: mockStoreUpdate },
  },
}));

const { mockGetBySlug } = vi.hoisted(() => ({
  mockGetBySlug: vi.fn(),
}));

vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB: {
    getBySlug: mockGetBySlug,
  },
}));

vi.mock("@/lib/cache", () => ({
  getOrSet:          vi.fn((_k: string, _t: number, fn: () => unknown) => fn()),
  invalidateByPrefix: vi.fn(),
}));

import { POST } from "@/app/api/marketplace/stores/[slug]/reviews/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORE = {
  id: "store-1", tenantId: "tenant-1", name: "Bodega Luis",
  slug: "bodega-luis", isPublished: true, commission: 5,
  rating: 4.0, reviewCount: 10,
};

const VALID_BODY = {
  reviewerName:  "Pedro",
  rating:        5,
  comment:       "Excelente servicio, recomendado!",
  customerPhone: "999111222",
  orderId:       "order-123",
  imageUrls:     [],
};

const VALID_ORDER = { id: "order-123" };

const REVIEW_CREATED = {
  id:     "review-1",
  name:   "Pedro",
  rating: 5,
  text:   "Excelente servicio, recomendado!",
  date:   new Date("2026-05-07"),
  photosJson: null,
};

function makeReq(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/marketplace/stores/bodega-luis/reviews", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/marketplace/stores/[slug]/reviews — validación anti-fraude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBySlug.mockResolvedValue(STORE);
    mockOrderFindFirst.mockResolvedValue(VALID_ORDER);
    mockReviewFindFirst.mockResolvedValue(null);
    mockReviewCreate.mockResolvedValue(REVIEW_CREATED);
    mockStoreUpdate.mockResolvedValue({});
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("orden válida + customerPhone match → 201 con status aprobado", async () => {
    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.rating).toBe(5);
  });

  // ── Zod validation ────────────────────────────────────────────────────────

  it("sin orderId → 400 (Zod safeParse falla)", async () => {
    const { orderId: _, ...noOrder } = VALID_BODY;

    const res = await POST(makeReq(noOrder), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("sin reviewerName → 400", async () => {
    const { reviewerName: _, ...noName } = VALID_BODY;

    const res = await POST(makeReq(noName), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(400);
  });

  it("rating fuera de rango (0) → 400", async () => {
    const res = await POST(makeReq({ ...VALID_BODY, rating: 0 }), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(400);
  });

  // ── Order verification ────────────────────────────────────────────────────

  it("orderId no existe en DB → 403 'Solo clientes con compra'", async () => {
    mockOrderFindFirst.mockResolvedValue(null);

    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/compra/i);
  });

  it("orden de otro tenant (tenantId diferente) → 403", async () => {
    // El mock de getBySlug retorna store con tenantId=tenant-1,
    // pero order.findFirst busca con tenantId=tenant-1 y no encuentra nada
    // (simulado retornando null — el where filtra por tenantId del store)
    mockOrderFindFirst.mockResolvedValue(null);

    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(403);
  });

  it("order.findFirst recibe tenantId del store en el where", async () => {
    mockOrderFindFirst.mockResolvedValue(VALID_ORDER);

    await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    const callArg = mockOrderFindFirst.mock.calls[0][0];
    expect(callArg.where).toMatchObject({
      tenantId:      "tenant-1",
      id:            "order-123",
      customerPhone: "999111222",
    });
  });

  it("orden con status 'pendiente' → 403 (no entregada/confirmada)", async () => {
    // order.findFirst con status:{in:["entregado","confirmado"]} retorna null
    mockOrderFindFirst.mockResolvedValue(null);

    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(403);
  });

  it("order.findFirst filtra status: {in: ['entregado', 'confirmado']}", async () => {
    mockOrderFindFirst.mockResolvedValue(VALID_ORDER);

    await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    const callArg = mockOrderFindFirst.mock.calls[0][0];
    expect(callArg.where.status).toEqual({ in: ["entregado", "confirmado"] });
  });

  // ── Duplicate check ───────────────────────────────────────────────────────

  it("review duplicada (mismo orderId+phone) → 409", async () => {
    mockReviewFindFirst.mockResolvedValue({ id: "existing-review" });

    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/reseñaste/i);
  });

  // ── Store not found ───────────────────────────────────────────────────────

  it("slug no encontrado → 404", async () => {
    mockGetBySlug.mockResolvedValue(null);

    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "no-existe" }),
    });

    expect(res.status).toBe(404);
  });

  // ── Rating calculation (server-side) ─────────────────────────────────────

  it("review válida → store.update recalcula rating y reviewCount server-side", async () => {
    await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(mockStoreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "store-1" },
        data:  expect.objectContaining({
          reviewCount: 11, // 10 + 1
          rating:      expect.any(Number),
        }),
      })
    );
  });
});
