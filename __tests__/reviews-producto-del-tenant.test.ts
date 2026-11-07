/**
 * __tests__/reviews-producto-del-tenant.test.ts
 *
 * Una reseña sólo puede colgar de un producto de ESTA tienda.
 *
 * El 16-10-2026 se creó la FK `Review_productId_fkey` (ON DELETE SET NULL).
 * La FK pide que el producto exista, no que sea del mismo tenant: un POST con
 * el id de un producto de otra tienda pasaba y quedaba guardado. Las tres
 * puertas que escriben `Review.productId` ahora buscan el producto con
 * `{ tenantId, id }` antes de crear, y responden 400 si no está.
 *
 * Producto ajeno e inexistente dan la MISMA respuesta: no se revela si el id
 * existe en otra tienda.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/sentry-alerts", () => ({ reportCriticalError: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn(() => true) }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getTenantIdFromRequest: vi.fn(() => TENANT) }));

const TENANT = "tenant-a";
/** Producto 7 = de esta tienda · 99 = de la tienda de al lado · 404 = no existe. */
const PRODUCTOS: Record<number, string> = { 7: TENANT, 99: "tenant-b" };

const mockGetById = vi.fn(async (tenantId: string, id: number) =>
  PRODUCTOS[id] === tenantId ? { id, tenantId, name: `Producto ${id}` } : null,
);
vi.mock("@/lib/db/products.db", () => ({ ProductsDB: { getById: mockGetById } }));

const mockAdd = vi.fn(async (r: Record<string, unknown>) => ({ ...r }));
vi.mock("@/lib/jsondb", () => ({
  ReviewsDB: { add: mockAdd, getAll: vi.fn(), getApproved: vi.fn() },
}));

const mockCreateVerified = vi.fn();
const mockCreateComment = vi.fn();
vi.mock("@/lib/db/reviews.db", () => ({
  ReviewsMarketplaceDB: {
    createVerified: mockCreateVerified,
    createComment: mockCreateComment,
    listByStore: vi.fn().mockResolvedValue([]),
    listByProduct: vi.fn().mockResolvedValue([]),
    listComments: vi.fn().mockResolvedValue([]),
    getAggregate: vi.fn().mockResolvedValue({ avg: 0, count: 0 }),
  },
}));

const TIENDA = { id: "store-a", tenantId: TENANT, name: "Tienda A" };
vi.mock("@/lib/db/marketplace.db", () => ({
  MarketplaceStoresDB: { getBySlug: vi.fn(async () => TIENDA) },
}));

vi.mock("@/lib/auth/customer-session", () => ({
  CUSTOMER_SESSION: { COOKIE_NAME: "customer-session" },
  getCustomerPayload: vi.fn(async () => ({ name: "Ana Torres" })),
}));

const { POST: postReview } = await import("@/app/api/reviews/route");
const { POST: postMarketplace } = await import("@/app/api/marketplace/reviews/route");
const { POST: postComment } = await import("@/app/api/marketplace/comments/route");

function req(url: string, body: object, cookie?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const reseña = (productId?: number) => ({
  id: "rev-1",
  name: "Ana",
  text: "Muy bueno",
  rating: 5,
  date: "2026-10-16",
  ...(productId != null && { productId }),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/reviews — el producto tiene que ser de la tienda", () => {
  it("producto de OTRA tienda → 400 y no se guarda", async () => {
    const res = await postReview(req("/api/reviews", reseña(99)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("El producto no existe en esta tienda");
    expect(mockGetById).toHaveBeenCalledWith(TENANT, 99);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("producto inexistente → 400 con el mismo mensaje", async () => {
    const res = await postReview(req("/api/reviews", reseña(404)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("El producto no existe en esta tienda");
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("producto de esta tienda → 201 y se guarda pendiente", async () => {
    const res = await postReview(req("/api/reviews", reseña(7)));
    expect(res.status).toBe(201);
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 7, status: "pending" }),
      TENANT,
    );
  });

  it("reseña de la tienda (sin producto) → 201 sin buscar producto", async () => {
    const res = await postReview(req("/api/reviews", reseña()));
    expect(res.status).toBe(201);
    expect(mockGetById).not.toHaveBeenCalled();
  });
});

describe("POST /api/marketplace/reviews — el producto tiene que ser de la tienda", () => {
  const verificada = (productId?: number) => ({
    storeSlug: "tienda-a",
    orderId: "order-1",
    name: "Ana",
    phone: "987654321",
    text: "Excelente",
    rating: 5,
    ...(productId != null && { productId }),
  });

  it("producto de OTRA tienda → 400 y no se crea", async () => {
    const res = await postMarketplace(req("/api/marketplace/reviews", verificada(99)));
    expect(res.status).toBe(400);
    expect(mockGetById).toHaveBeenCalledWith(TENANT, 99);
    expect(mockCreateVerified).not.toHaveBeenCalled();
  });

  it("producto de esta tienda → 201", async () => {
    mockCreateVerified.mockResolvedValueOnce({
      id: "rev-2", rating: 5, text: "Excelente", name: "Ana",
      verified: true, status: "pending", date: "2026-10-16",
    });
    const res = await postMarketplace(req("/api/marketplace/reviews", verificada(7)));
    expect(res.status).toBe(201);
    expect(mockCreateVerified).toHaveBeenCalledWith(expect.objectContaining({ productId: 7 }));
  });
});

describe("POST /api/marketplace/comments — el producto tiene que ser de la tienda", () => {
  const SESION = "customer-session=token";
  const comentario = (productId: number) => ({ storeSlug: "tienda-a", productId, text: "Lindo" });

  it("producto de OTRA tienda → 400 y no se crea", async () => {
    const res = await postComment(req("/api/marketplace/comments", comentario(99), SESION));
    expect(res.status).toBe(400);
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it("producto inexistente → 400", async () => {
    const res = await postComment(req("/api/marketplace/comments", comentario(404), SESION));
    expect(res.status).toBe(400);
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it("producto de esta tienda → 201", async () => {
    mockCreateComment.mockResolvedValueOnce({ id: "c-1", name: "Ana Torres", text: "Lindo", date: "2026-10-16" });
    const res = await postComment(req("/api/marketplace/comments", comentario(7), SESION));
    expect(res.status).toBe(201);
  });
});
