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

const { mockGetBySlug, mockVerifyOrderForReview, mockHasReviewForOrder, mockAddVerifiedStoreReview, mockGetByStore } = vi.hoisted(() => ({
  mockGetBySlug:              vi.fn(),
  mockVerifyOrderForReview:   vi.fn(),
  mockHasReviewForOrder:      vi.fn(),
  mockAddVerifiedStoreReview: vi.fn(),
  mockGetByStore:             vi.fn(),
}));

vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB: {
    getBySlug: mockGetBySlug,
  },
}));

// Audit 2026-05-19: endpoint migrado a MarketplaceReviewsDB (importado desde
// path interno, NO desde el aggregator marketplace.db).
vi.mock("@/lib/db/marketplace/reviews.db", () => ({
  MarketplaceReviewsDB: {
    verifyOrderForReview:   mockVerifyOrderForReview,
    hasReviewForOrder:      mockHasReviewForOrder,
    addVerifiedStoreReview: mockAddVerifiedStoreReview,
    getByStore:             mockGetByStore,
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
    // Audit 2026-05-19: defaults para MarketplaceReviewsDB.
    mockVerifyOrderForReview.mockResolvedValue(true);
    mockHasReviewForOrder.mockResolvedValue(false);
    mockAddVerifiedStoreReview.mockResolvedValue({
      review: REVIEW_CREATED,
      storeRating: 4.2,
      storeReviewCount: 11,
    });
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
    mockVerifyOrderForReview.mockResolvedValue(false);

    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/compra/i);
  });

  it("orden de otro tenant (tenantId diferente) → 403", async () => {
    // Audit 2026-05-19: el filtro por tenantId vive en verifyOrderForReview.
    // Simulamos que devuelve false (orden no pertenece al tenant del store).
    mockVerifyOrderForReview.mockResolvedValue(false);

    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(403);
  });

  it("verifyOrderForReview recibe (tenantId, orderId, phone) del store", async () => {
    await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(mockVerifyOrderForReview).toHaveBeenCalledWith(
      "tenant-1",
      "order-123",
      "999111222",
    );
  });

  it("orden con status 'pendiente' → 403 (no entregada/confirmada)", async () => {
    // verifyOrderForReview encapsula el filtro status:{in:["entregado","confirmado"]}.
    mockVerifyOrderForReview.mockResolvedValue(false);

    const res = await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(res.status).toBe(403);
  });

  it("verifyOrderForReview es la única gate de validación de orden", async () => {
    // Audit 2026-05-19: el filtro status:{in:["entregado","confirmado"]} vive
    // ahora en MarketplaceReviewsDB.verifyOrderForReview, no en el endpoint.
    await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(mockVerifyOrderForReview).toHaveBeenCalledTimes(1);
  });

  // ── Duplicate check ───────────────────────────────────────────────────────

  it("review duplicada (mismo orderId+phone) → 409", async () => {
    mockHasReviewForOrder.mockResolvedValue(true);

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

  it("review válida → addVerifiedStoreReview recalcula rating y reviewCount server-side", async () => {
    // Audit 2026-05-19: el recompute de rating/reviewCount vive ahora dentro de
    // MarketplaceReviewsDB.addVerifiedStoreReview (atomic create + store update).
    await POST(makeReq(VALID_BODY), {
      params: Promise.resolve({ slug: "bodega-luis" }),
    });

    expect(mockAddVerifiedStoreReview).toHaveBeenCalledWith(
      expect.objectContaining({
        store: expect.objectContaining({
          id:          "store-1",
          tenantId:    "tenant-1",
          rating:      4.0,
          reviewCount: 10,
        }),
        rating:        5,
        customerPhone: "999111222",
        orderId:       "order-123",
      })
    );
  });
});
