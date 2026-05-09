/**
 * Tests unitarios — /api/marketplace/recommendations/[productId]
 *
 * Cubre:
 *  - GET con productId válido → 200 con array de productos
 *  - productId no numérico → 400
 *  - productId negativo → 400
 *  - limit fuera de rango (>20) → 400
 *  - Resuelve tenantId del header x-tenant-id
 *  - Responde con array vacío si no hay co-ocurrencias (no 404)
 *  - Parámetro limit personalizado es respetado
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock de Prisma (handler usa await import("@/lib/prisma") dinámico) ─────────
const { mockProductFindFirst } = vi.hoisted(() => ({
  mockProductFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findFirst: mockProductFindFirst },
  },
}));

// ── Mock del algoritmo de recomendaciones ─────────────────────────────────────
const { mockGetRelatedProducts } = vi.hoisted(() => ({
  mockGetRelatedProducts: vi.fn(),
}));

vi.mock("@/lib/recommendations/product-similarity", () => ({
  getRelatedProducts: mockGetRelatedProducts,
}));

import { GET } from "@/app/api/marketplace/recommendations/[productId]/route";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const RELATED_PRODUCTS = [
  { productId: 10, name: "Aceite Vegetal", price: 8.0, image: "/aceite.png", score: 5 },
  { productId: 20, name: "Azúcar Blanca",  price: 3.5, image: null,          score: 3 },
];

function makeRequest(
  productId: string,
  options: { tenantId?: string; limit?: string } = {},
) {
  const url = new URL(
    `http://localhost/api/marketplace/recommendations/${productId}${
      options.limit ? `?limit=${options.limit}` : ""
    }`,
  );
  const headers: Record<string, string> = {};
  if (options.tenantId) headers["x-tenant-id"] = options.tenantId;

  return new NextRequest(url, { headers });
}

async function callRoute(req: NextRequest, productId: string) {
  return GET(req, { params: Promise.resolve({ productId }) });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/recommendations/[productId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // El handler hace prisma.product.findFirst para resolver tenantId del producto.
    // Default: producto pertenece al tenant del header (mockable por test).
    mockProductFindFirst.mockResolvedValue({ tenantId: "bodega-test" });
  });

  it("retorna 200 con los productos relacionados para un productId válido", async () => {
    mockGetRelatedProducts.mockResolvedValueOnce(RELATED_PRODUCTS);

    const req = makeRequest("1", { tenantId: "bodega-test" });
    const res = await callRoute(req, "1");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.products).toHaveLength(2);
    expect(body.products[0].productId).toBe(10);
    expect(body.products[0].score).toBe(5);
  });

  it("retorna 400 cuando productId no es numérico", async () => {
    const req = makeRequest("abc");
    const res = await callRoute(req, "abc");

    expect(res.status).toBe(400);
    expect(mockGetRelatedProducts).not.toHaveBeenCalled();
  });

  it("retorna 400 cuando productId es 0 o negativo", async () => {
    const reqCero    = makeRequest("0");
    const reqNeg     = makeRequest("-5");

    const resCero = await callRoute(reqCero, "0");
    const resNeg  = await callRoute(reqNeg, "-5");

    expect(resCero.status).toBe(400);
    expect(resNeg.status).toBe(400);
  });

  it("retorna 400 cuando limit > 20", async () => {
    const req = makeRequest("1", { limit: "99" });
    const res = await callRoute(req, "1");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues).toBeDefined();
  });

  it("deriva tenantId del producto (audit AI 2026-05-06: NO del header, evita cache cross-tenant)", async () => {
    mockProductFindFirst.mockResolvedValueOnce({ tenantId: "mi-bodega" });
    mockGetRelatedProducts.mockResolvedValueOnce([]);

    const req = makeRequest("5", { tenantId: "header-fake" });
    await callRoute(req, "5");

    // El tenantId viene del producto en DB, NO del header (header se ignora).
    expect(mockGetRelatedProducts).toHaveBeenCalledWith("mi-bodega", 5, 5);
  });

  it("retorna products vacío cuando el producto no existe (productOwner null)", async () => {
    mockProductFindFirst.mockResolvedValueOnce(null);

    const req = makeRequest("3");
    const res = await callRoute(req, "3");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.products).toEqual([]);
    // No llama al algoritmo si el producto no existe
    expect(mockGetRelatedProducts).not.toHaveBeenCalled();
  });

  it("retorna 200 con array vacío cuando no hay co-ocurrencias (no lanza 404)", async () => {
    mockGetRelatedProducts.mockResolvedValueOnce([]);

    const req = makeRequest("99", { tenantId: "otro-tenant" });
    const res = await callRoute(req, "99");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.products).toEqual([]);
  });

  it("respeta el parámetro limit cuando se pasa como query string", async () => {
    mockProductFindFirst.mockResolvedValueOnce({ tenantId: "t1" });
    mockGetRelatedProducts.mockResolvedValueOnce(RELATED_PRODUCTS);

    const req = makeRequest("1", { tenantId: "t1", limit: "3" });
    await callRoute(req, "1");

    expect(mockGetRelatedProducts).toHaveBeenCalledWith("t1", 1, 3);
  });
});
