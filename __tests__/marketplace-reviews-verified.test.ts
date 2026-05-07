/**
 * M4 — marketplace-reviews-verified.test.ts
 *
 * POST /api/marketplace/reviews rechaza review fraudulenta:
 * cuando orderId no pertenece al phone del reviewer → 422.
 *
 * La verificación la hace ReviewsMarketplaceDB.createVerified()
 * que lanza Error("El teléfono del review no coincide con el del pedido X")
 * → el route lo captura y responde 422.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/sentry-alerts", () => ({
  reportCriticalError: vi.fn(),
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(() => true), // feature ON en tests
}));

const mockGetBySlug = vi.fn();
const mockCreateVerified = vi.fn();

vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB: {
    getBySlug: mockGetBySlug,
  },
}));

vi.mock("@/lib/db/reviews.db", () => ({
  ReviewsMarketplaceDB: {
    createVerified: mockCreateVerified,
    listByStore: vi.fn().mockResolvedValue([]),
    listByProduct: vi.fn().mockResolvedValue([]),
    getAggregate: vi.fn().mockResolvedValue({ avg: 0, count: 0 }),
  },
}));

const { POST } = await import("@/app/api/marketplace/reviews/route");

const VALID_STORE = { id: "store-1", tenantId: "tenant-a", name: "Tienda A" };

function makeReviewReq(overrides: object = {}) {
  return new NextRequest("http://localhost/api/marketplace/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeSlug: "tienda-a",
      orderId: "order-xyz",
      name: "Ana Torres",
      phone: "987654321",
      text: "Excelente servicio",
      rating: 5,
      ...overrides,
    }),
  });
}

describe("POST /api/marketplace/reviews — verificación de orden", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBySlug.mockResolvedValue(VALID_STORE);
  });

  it("retorna 422 cuando el phone no coincide con el orderId (review fraudulenta)", async () => {
    mockCreateVerified.mockRejectedValueOnce(
      new Error("El teléfono del review no coincide con el del pedido order-xyz")
    );

    const res = await POST(makeReviewReq({ phone: "999999999" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("retorna 422 cuando la orden no existe", async () => {
    mockCreateVerified.mockRejectedValueOnce(
      new Error("Order order-inexistente no existe o fue eliminado")
    );

    const res = await POST(makeReviewReq({ orderId: "order-inexistente" }));
    expect(res.status).toBe(422);
  });

  it("retorna 201 cuando la review es legítima (phone + orderId coinciden)", async () => {
    mockCreateVerified.mockResolvedValueOnce({
      id: "rev-1",
      rating: 5,
      text: "Excelente servicio",
      name: "Ana Torres",
      verified: true,
      status: "pending",
      date: new Date().toISOString(),
    });

    const res = await POST(makeReviewReq());
    expect(res.status).toBe(201);
  });
});
