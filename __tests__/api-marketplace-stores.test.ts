/**
 * Tests unitarios — /api/marketplace/stores
 *
 * Cubre:
 *  - GET lista de tiendas publicadas (200)
 *  - Filtros: zone, category, search
 *  - Parámetros inválidos (400)
 *  - Error de BD (500)
 *  - Tiendas NO publicadas no aparecen
 *  - Límite máximo de resultados (100)
 *
 * Este endpoint es PÚBLICO (sin auth).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

// ── Mock: logger ──────────────────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Mock: api-error ───────────────────────────────────────────────────────────
vi.mock("@/lib/api-error", () => ({
  toErrorPayload: vi.fn((err: unknown, _traceId: string) => ({
    payload: { error: err instanceof Error ? err.message : "Internal error" },
    status:  500,
  })),
  newTraceId: vi.fn(() => "trace-test-123"),
  NotFoundError: class extends Error { constructor(m: string) { super(m); this.name = "NotFoundError"; } },
}));

// ── Mock: prisma ───────────────────────────────────────────────────────────────
// El route llama también a prisma.settings.findMany + prisma.promotion.groupBy
// para enriquecer las stores con metadata. Mockeamos ambos vacíos por defecto
// — los tests pueden override con mockImplementation si necesitan.
const { mockStoreFindMany, mockSettingsFindMany, mockPromotionGroupBy } = vi.hoisted(() => ({
  mockStoreFindMany: vi.fn(),
  mockSettingsFindMany: vi.fn().mockResolvedValue([]),
  mockPromotionGroupBy: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    store: {
      findMany: mockStoreFindMany,
    },
    settings: {
      findMany: mockSettingsFindMany,
    },
    promotion: {
      groupBy: mockPromotionGroupBy,
    },
  },
}));

import { GET } from "@/app/api/marketplace/stores/route";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const STORE_A = {
  id:          "store-1",
  slug:        "bodega-san-martin",
  name:        "Buleje",
  logo:        "/logo.png",
  category:    "Abarrotes",
  zone:        "Centro",
  rating:      4.8,
  reviewCount: 120,
  description: "La mejor bodega de Pucallpa",
  _count:      { products: 34 },
};

const STORE_B = {
  id:          "store-2",
  slug:        "minimarket-flora",
  name:        "Minimarket Flora",
  logo:        "/flora.png",
  category:    "Bebidas",
  zone:        "Yarinacocha",
  rating:      4.2,
  reviewCount: 45,
  description: "Bebidas frescas",
  _count:      { products: 12 },
};

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/marketplace/stores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Caso feliz ──────────────────────────────────────────────────────────────

  it("retorna lista de tiendas publicadas (200)", async () => {
    mockStoreFindMany.mockResolvedValue([STORE_A, STORE_B]);

    const res = await GET(makeReq("https://host/api/marketplace/stores"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.data[0].slug).toBe("bodega-san-martin");
    expect(body.data[0].trustScore).toBeGreaterThan(body.data[1].trustScore);
  });

  it("lista vacía cuando no hay tiendas publicadas (200)", async () => {
    mockStoreFindMany.mockResolvedValue([]);

    const res = await GET(makeReq("https://host/api/marketplace/stores"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  // ── Filtros ─────────────────────────────────────────────────────────────────

  it("filtra por zone — solo pasa 'zone' al where de Prisma", async () => {
    mockStoreFindMany.mockResolvedValue([STORE_A]);

    const res = await GET(makeReq("https://host/api/marketplace/stores?zone=Centro"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);

    // Verificar que Prisma recibió el filtro correcto
    const callArgs = mockStoreFindMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ isPublished: true, zone: "Centro" });
  });

  it("filtra por category", async () => {
    mockStoreFindMany.mockResolvedValue([STORE_B]);

    const res = await GET(makeReq("https://host/api/marketplace/stores?category=Bebidas"));

    expect(res.status).toBe(200);
    const callArgs = mockStoreFindMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ isPublished: true, category: "Bebidas" });
  });

  it("filtra por search — busca en name con insensitiveCase", async () => {
    mockStoreFindMany.mockResolvedValue([STORE_A]);

    const res = await GET(makeReq("https://host/api/marketplace/stores?search=San+Martín"));

    expect(res.status).toBe(200);
    const callArgs = mockStoreFindMany.mock.calls[0][0];
    expect(callArgs.where.name).toMatchObject({ contains: "San Martín", mode: "insensitive" });
  });

  it("usa el límite personalizado para rankear antes del recorte final (limit=5)", async () => {
    mockStoreFindMany.mockResolvedValue([STORE_A]);

    await GET(makeReq("https://host/api/marketplace/stores?limit=5"));

    const callArgs = mockStoreFindMany.mock.calls[0][0];
    expect(callArgs.take).toBe(10);
  });

  it("aplica límite máximo de 100 cuando se piden más", async () => {
    mockStoreFindMany.mockResolvedValue([]);

    await GET(makeReq("https://host/api/marketplace/stores?limit=9999"));

    // Prisma no debería llamarse con take > 100 (Zod lo rechaza, retorna 400)
    // Por lo tanto el mock no debería ser llamado en absoluto si hay error de validación
    // Alternativamente: la request puede rechazarse con 400
    // Verificamos que la respuesta es 400 si excede el máximo
    const res2 = await GET(makeReq("https://host/api/marketplace/stores?limit=9999"));
    expect(res2.status).toBe(400);
  });

  // ── Datos siempre isPublished:true ─────────────────────────────────────────

  it("SIEMPRE filtra con isPublished:true (seguridad)", async () => {
    mockStoreFindMany.mockResolvedValue([]);

    await GET(makeReq("https://host/api/marketplace/stores"));

    const callArgs = mockStoreFindMany.mock.calls[0][0];
    expect(callArgs.where.isPublished).toBe(true);
  });

  // ── Parámetros inválidos ─────────────────────────────────────────────────────

  it("retorna 400 si limit no es número (limit=abc)", async () => {
    // Zod coerce.number fallará con valor no numérico
    const res = await GET(makeReq("https://host/api/marketplace/stores?limit=abc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.issues).toBeDefined();
  });

  // ── Error de BD ─────────────────────────────────────────────────────────────

  it("retorna 200 con lista vacía si Prisma lanza excepción (graceful degradation)", async () => {
    mockStoreFindMany.mockRejectedValue(new Error("DB connection failed"));

    const res = await GET(makeReq("https://host/api/marketplace/stores"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  // ── Campos devueltos ────────────────────────────────────────────────────────

  it("cada tienda tiene los campos requeridos por el frontend", async () => {
    mockStoreFindMany.mockResolvedValue([STORE_A]);

    const res = await GET(makeReq("https://host/api/marketplace/stores"));
    const body = await res.json();
    const store = body.data[0];

    expect(store).toHaveProperty("id");
    expect(store).toHaveProperty("slug");
    expect(store).toHaveProperty("name");
    expect(store).toHaveProperty("logo");
    expect(store).toHaveProperty("category");
    expect(store).toHaveProperty("zone");
    expect(store).toHaveProperty("rating");
    expect(store).toHaveProperty("reviewCount");
    expect(store).toHaveProperty("productCount");
    expect(store).toHaveProperty("trustScore");
    expect(store).toHaveProperty("trustLevel");
    expect(store).toHaveProperty("trustLabel");
    expect(store).toHaveProperty("trustReason");
  });

  // ── Sin datos sensibles ─────────────────────────────────────────────────────

  it("NO expone tenantId en la respuesta pública", async () => {
    const storeConTenantId = { ...STORE_A, tenantId: "super-secret-tenant" };
    mockStoreFindMany.mockResolvedValue([storeConTenantId]);

    const res = await GET(makeReq("https://host/api/marketplace/stores"));
    const body = await res.json();
    const store = body.data[0];

    // El select de Prisma no incluye tenantId — no debe llegar al cliente
    // Si alguien accidentalmente lo incluye, este test fallará
    expect(store.tenantId).toBeUndefined();
    expect(store._count).toBeUndefined();
  });
});
