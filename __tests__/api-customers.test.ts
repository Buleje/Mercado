/**
 * __tests__/api-customers.test.ts
 *
 * Unit tests for GET /api/customers and POST /api/customers.
 * Covers: RBAC (admin-only), Zod validation, pagination, search, error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  invalidate: vi.fn(),
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
}));

const { mockApplyRateLimit } = vi.hoisted(() => ({
  mockApplyRateLimit: vi.fn(() => null as null | ReturnType<typeof NextResponse.json>),
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: mockApplyRateLimit,
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

const { mockCustomersGetAll, mockAltaSinPisar, mockNormalizePhone } = vi.hoisted(() => ({
  mockCustomersGetAll: vi.fn(),
  mockAltaSinPisar: vi.fn(),
  mockNormalizePhone: vi.fn((p: string) => p),
}));

vi.mock("@/lib/jsondb", () => ({
  CustomersDB: {
    getAll: mockCustomersGetAll,
    // GET usa la variante con la deuda real de fiados (09-10); el contrato de la lista es el mismo.
    getAllConDeuda: mockCustomersGetAll,
    altaSinPisar: mockAltaSinPisar,
  },
  normalizePhone: mockNormalizePhone,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLog: { create: vi.fn(async () => {}) },
  },
}));

vi.mock("@/lib/tenant", () => ({
  prismaForTenant: () => ({
    customer: { update: vi.fn(async () => ({})) },
    activityLog: { create: vi.fn(async () => ({})) },
  }),
}));

// ── Import handler AFTER mocks ────────────────────────────────────────────────

import { GET, POST } from "@/app/api/customers/route";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ADMIN_AUTH = { tenantId: "main", role: "admin", username: "testadmin" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

const CUSTOMER = {
  phone: "987654321",
  name: "Juan Pérez",
  location: "Jr. Lima 100",
  reference: "Frente al parque",
  loyaltyPoints: 0,
  loyaltyTier: "Nuevo",
  totalSpent: 0,
};

const VALID_POST_BODY = {
  phone: "987654321",
  name: "María García",
  location: "Av. San Martín 200",
};

function makeGet(qs = ""): NextRequest {
  return new NextRequest(`https://host/api/customers${qs}`, { method: "GET" });
}

function makePost(body: unknown): NextRequest {
  return new NextRequest("https://host/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── GET /api/customers ────────────────────────────────────────────────────────

describe("GET /api/customers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_AUTH);
    mockCustomersGetAll.mockResolvedValue([CUSTOMER]);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns 200 with customer list for admin", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].phone).toBe("987654321");
  });

  it("includes X-Total-Count header", async () => {
    const res = await GET(makeGet());
    expect(res.headers.get("X-Total-Count")).toBe("1");
  });

  it("returns empty array when no customers exist", async () => {
    mockCustomersGetAll.mockResolvedValue([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);
  });

  it("filters by name search query", async () => {
    mockCustomersGetAll.mockResolvedValue([
      CUSTOMER,
      { ...CUSTOMER, phone: "912000000", name: "Ana Torres" },
    ]);
    const res = await GET(makeGet("?q=ana"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Ana Torres");
  });

  it("filters by phone search query", async () => {
    mockCustomersGetAll.mockResolvedValue([
      CUSTOMER,
      { ...CUSTOMER, phone: "912000000", name: "Ana Torres" },
    ]);
    const res = await GET(makeGet("?q=9876"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].phone).toBe("987654321");
  });

  it("applies offset pagination with ?limit=1&page=1", async () => {
    mockCustomersGetAll.mockResolvedValue([CUSTOMER, { ...CUSTOMER, phone: "912000001" }]);
    const res = await GET(makeGet("?limit=1&page=1"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(res.headers.get("X-Page")).toBe("1");
    expect(res.headers.get("X-Limit")).toBe("1");
  });

  it("returns 503 when DB throws", async () => {
    mockCustomersGetAll.mockRejectedValue(new Error("DB crash"));
    const res = await GET(makeGet());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Database error");
  });

  it("returns 429 when rate limited", async () => {
    mockApplyRateLimit.mockReturnValueOnce(
      NextResponse.json({ error: "rate limited" }, { status: 429 })
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
  });
});

// ── POST /api/customers ───────────────────────────────────────────────────────

describe("POST /api/customers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(ADMIN_AUTH);
    mockApplyRateLimit.mockReturnValue(null);
    mockAltaSinPisar.mockResolvedValue({ estado: "creado", cliente: { ...CUSTOMER, name: "María García" } });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makePost(VALID_POST_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 200 with created customer on valid body", async () => {
    const res = await POST(makePost(VALID_POST_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("María García");
  });

  it("returns 400 when phone is missing", async () => {
    const { phone: _omit, ...noPhone } = VALID_POST_BODY;
    const res = await POST(makePost(noPhone));
    expect(res.status).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    const { name: _omit, ...noName } = VALID_POST_BODY;
    const res = await POST(makePost(noName));
    expect(res.status).toBe(400);
  });

  it("returns 400 when phone is too short (< 6 chars)", async () => {
    const res = await POST(makePost({ ...VALID_POST_BODY, phone: "123" }));
    expect(res.status).toBe(400);
  });

  it("calls normalizePhone before the alta", async () => {
    await POST(makePost(VALID_POST_BODY));
    expect(mockNormalizePhone).toHaveBeenCalledWith("987654321");
  });

  it("calls CustomersDB.altaSinPisar with tenantId first and the data", async () => {
    await POST(makePost({ ...VALID_POST_BODY, creditLimit: 300 }));
    expect(mockAltaSinPisar).toHaveBeenCalledWith(
      "main",
      expect.objectContaining({ name: "María García", creditLimit: 300 }),
    );
  });

  // Seguridad 17-10 (punto 5): un segundo alta con el mismo celular pisaba al cliente.
  const EXISTE = {
    estado: "existe",
    cliente: { ...CUSTOMER },
    identificacion: { documento: "44556677", tipoDocumento: "DNI", razonSocial: null },
  };

  it("celular de un cliente que ya tienes → 409 con ese cliente, sin bienvenida", async () => {
    mockAltaSinPisar.mockResolvedValue(EXISTE);
    const res = await POST(makePost(VALID_POST_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.motivo).toBe("existe");
    expect(body.existente).toEqual({ phone: "987654321", name: "Juan Pérez", documento: "44556677", tipoDocumento: "DNI", razonSocial: null });
  });

  it("?siExiste=usar → 200 con el cliente tal cual (no el nombre que llegó)", async () => {
    mockAltaSinPisar.mockResolvedValue(EXISTE);
    const req = new NextRequest("https://host/api/customers?siExiste=usar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_POST_BODY),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Juan Pérez", yaExistia: true });
  });

  it("celular de otra tienda → 409 con el mensaje (antes «invalid request»)", async () => {
    mockAltaSinPisar.mockResolvedValue({ estado: "otra_tienda" });
    const res = await POST(makePost(VALID_POST_BODY));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/otra tienda de la red/);
  });

  it("cuerpo vacío → 400", async () => {
    const res = await POST(new NextRequest("https://host/api/customers", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(mockAltaSinPisar).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockApplyRateLimit.mockReturnValueOnce(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );
    const res = await POST(makePost(VALID_POST_BODY));
    expect(res.status).toBe(429);
  });
});
