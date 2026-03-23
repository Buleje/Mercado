/**
 * API /api/mermas – unit tests
 * Covers: auth, validación Zod, shape de respuesta, tenantId, error handling,
 *         rate limiting, filtros GET, campos opcionales POST
 *
 * La ruta usa:
 *  - requireAdmin (lib/require-admin)
 *  - applyRateLimit (lib/rate-limit)
 *  - MermasDB.getAll / MermasDB.create (lib/db → lib/db/mermas.db.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

// ── Mock requireAdmin ─────────────────────────────────────────────────────────

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

// ── Mock applyRateLimit (por defecto sin limite) ───────────────────────────────

const { mockApplyRateLimit } = vi.hoisted(() => ({
  mockApplyRateLimit: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: mockApplyRateLimit }));

// ── Mock MermasDB ─────────────────────────────────────────────────────────────

const { mockGetAll, mockCreate } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockCreate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  MermasDB: {
    getAll: mockGetAll,
    create: mockCreate,
  },
}));

import { GET, POST } from "@/app/api/mermas/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AUTH_ADMIN = { tenantId: "main", role: "admin", username: "admin1" };
const AUTH_ALMACENERO = { tenantId: "tenant-abc", role: "almacenero", username: "almacen1" };
const AUTH_CAJERO = { tenantId: "main", role: "cajero", username: "cajero1" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const MERMA_MOCK = {
  id: "mov-001",
  productId: 5,
  productName: "Leche Gloria",
  quantity: 3,
  previousStock: 20,
  newStock: 17,
  lossType: "expiry" as const,
  notes: "lote vencido",
  warehouseId: "wh-01",
  registeredBy: "Juan",
  tenantId: "main",
  createdAt: "2026-03-20T10:00:00.000Z",
};

const PAGE_MOCK = {
  data: [MERMA_MOCK],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

const EMPTY_PAGE = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };

function makeGet(params = ""): NextRequest {
  return new NextRequest(`https://host/api/mermas${params}`, { method: "GET" });
}

function makePost(body: unknown): NextRequest {
  return new NextRequest("https://host/api/mermas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── GET /api/mermas ───────────────────────────────────────────────────────────

describe("GET /api/mermas", () => {
  beforeEach(() => vi.clearAllMocks());

  // 1. Sin auth → 401
  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  // 2. Con auth → 200 + objeto paginado
  it("returns 200 with paginated result when authenticated as admin", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetAll.mockResolvedValue(PAGE_MOCK);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.total).toBe(1);
  });

  // 3. Cajero también puede acceder
  it("returns 200 for cajero role", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_CAJERO);
    mockGetAll.mockResolvedValue(EMPTY_PAGE);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
  });

  // 4. Almacenero puede acceder
  it("returns 200 for almacenero role", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ALMACENERO);
    mockGetAll.mockResolvedValue(EMPTY_PAGE);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
  });

  // 5. getAll es llamado con tenantId correcto
  it("calls MermasDB.getAll with tenantId from auth", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetAll.mockResolvedValue(PAGE_MOCK);
    await GET(makeGet());
    expect(mockGetAll).toHaveBeenCalledTimes(1);
    expect(mockGetAll).toHaveBeenCalledWith("main", expect.any(Object));
  });

  // 6. Aislamiento multi-tenant: usa tenantId del almacenero
  it("calls MermasDB.getAll with almacenero tenantId", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ALMACENERO);
    mockGetAll.mockResolvedValue(EMPTY_PAGE);
    await GET(makeGet());
    expect(mockGetAll).toHaveBeenCalledWith("tenant-abc", expect.any(Object));
  });

  // 7. Sin mermas → data array vacío
  it("returns empty data array when no mermas exist", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetAll.mockResolvedValue(EMPTY_PAGE);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  // 8. Filtros de fecha se pasan a getAll
  it("passes dateFrom/dateTo query params to MermasDB.getAll", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetAll.mockResolvedValue(EMPTY_PAGE);
    await GET(makeGet("?from=2026-01-01T00:00:00.000Z&to=2026-03-31T23:59:59.000Z"));
    const filters = mockGetAll.mock.calls[0][1];
    expect(filters.from).toBe("2026-01-01T00:00:00.000Z");
    expect(filters.to).toBe("2026-03-31T23:59:59.000Z");
  });

  // 9. DB falla → 500
  it("returns 500 when MermasDB.getAll throws", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockGetAll.mockRejectedValue(new Error("Prisma connection failed"));
    const res = await GET(makeGet());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 10. Parámetros inválidos → 400
  it("returns 400 for invalid query params", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    // page no puede ser 0
    const res = await GET(makeGet("?page=0"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

// ── POST /api/mermas ──────────────────────────────────────────────────────────

describe("POST /api/mermas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyRateLimit.mockReturnValue(null);
  });

  const VALID_BODY = {
    productId: 5,
    quantity: 3,
    lossType: "expiry",
    notes: "lote expirado",
    registeredBy: "Juan",
  };

  // 11. Sin auth → 401
  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(401);
  });

  // 12. Datos válidos → 201 con merma creada
  it("returns 201 with created merma when data is valid", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockCreate.mockResolvedValue(MERMA_MOCK);
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("lossType");
  });

  // 13. Sin productId → 400
  it("returns 400 when productId is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await POST(makePost({ quantity: 3, lossType: "expiry" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 14. Sin quantity → 400
  it("returns 400 when quantity is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await POST(makePost({ productId: 5, lossType: "expiry" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 15. lossType inválido → 400 con issues
  it("returns 400 when lossType is not a valid enum value", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await POST(makePost({ productId: 5, quantity: 2, lossType: "causa-invalida" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(Array.isArray(body.issues)).toBe(true);
  });

  // 16. quantity <= 0 → 400
  it("returns 400 when quantity is zero or negative", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await POST(makePost({ productId: 5, quantity: 0, lossType: "theft" }));
    expect(res.status).toBe(400);
  });

  // 17. MermasDB.create llamado con tenantId y datos correctos
  it("calls MermasDB.create with tenantId and parsed body", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockCreate.mockResolvedValue(MERMA_MOCK);
    await POST(makePost(VALID_BODY));
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [tenantId, input] = mockCreate.mock.calls[0];
    expect(tenantId).toBe("main");
    expect(input.productId).toBe(5);
    expect(input.quantity).toBe(3);
    expect(input.lossType).toBe("expiry");
  });

  // 18. Error en MermasDB.create → 500
  it("returns 500 when MermasDB.create throws", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockCreate.mockRejectedValue(new Error("DB connection failed"));
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // 19. Rate limit activo → retorna la respuesta del rate limiter
  it("returns rate limit response when rate limit is exceeded", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const rlResponse = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    mockApplyRateLimit.mockReturnValue(rlResponse);
    const res = await POST(makePost(VALID_BODY));
    expect(res.status).toBe(429);
  });

  // 20. Body inválido (no JSON) → 400
  it("returns 400 when request body is not valid JSON", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const req = new NextRequest("https://host/api/mermas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json }",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
