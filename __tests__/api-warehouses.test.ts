/**
 * API /api/admin/warehouses – unit tests
 * Covers: auth, GET list, POST create, PATCH update, DELETE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockFindMany, mockCreate, mockUpdate, mockDelete, mockFindUnique, mockFindFirst, mockUpdateMany, mockDeleteMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockFindUnique: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  mockDeleteMany: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    warehouse: {
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      updateMany: mockUpdateMany,
      deleteMany: mockDeleteMany,
    },
  },
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/admin/warehouses/route";

const AUTH_ADMIN = { tenantId: "main", role: "admin", username: "test" };
const AUTH_ALMACENERO = { tenantId: "main", role: "almacenero", username: "test" };
const UNAUTH = NextResponse.json({ error: "unauthorized" }, { status: 401 });

function makeReq(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
}

const NOW = new Date("2026-01-01T00:00:00Z");
const BASE_WH = {
  id: "wh-1",
  tenantId: "main",
  name: "Almacén Principal",
  code: "ALM-001",
  type: "principal",
  location: "Tienda San Martín",
  manager: "Admin",
  capacity: 10000,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

// ── GET ───────────────────────────────────────────────────────────────────────

describe("GET /api/admin/warehouses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("GET", "https://host/api/admin/warehouses"));
    expect(res.status).toBe(401);
  });

  it("returns list of warehouses for admin", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockFindMany.mockResolvedValue([BASE_WH]);
    const res = await GET(makeReq("GET", "https://host/api/admin/warehouses"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe("wh-1");
  });

  it("returns list for almacenero role", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ALMACENERO);
    mockFindMany.mockResolvedValue([BASE_WH]);
    const res = await GET(makeReq("GET", "https://host/api/admin/warehouses"));
    expect(res.status).toBe(200);
  });

  it("auto-creates default warehouse when list is empty", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    // First call: empty (triggers ensureDefault), second call: returns default
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BASE_WH]);
    mockCreate.mockResolvedValue(BASE_WH);
    const res = await GET(makeReq("GET", "https://host/api/admin/warehouses"));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe("POST /api/admin/warehouses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouses", { name: "Test", code: "T-001" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing name", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouses", { code: "T-001" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Datos inválidos");
  });

  it("returns 400 for missing code", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouses", { name: "Depósito" }));
    expect(res.status).toBe(400);
  });

  it("creates warehouse successfully", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockCreate.mockResolvedValue({ ...BASE_WH, id: "wh-2", name: "Depósito Norte", code: "DEP-001" });
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouses", {
      name: "Depósito Norte",
      code: "DEP-001",
      type: "deposito",
      location: "Av. Norte 100",
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.code).toBe("DEP-001");
  });

  it("rejects invalid type", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await POST(makeReq("POST", "https://host/api/admin/warehouses", {
      name: "Test",
      code: "T-001",
      type: "invalido",
    }));
    expect(res.status).toBe(400);
  });
});

// ── PATCH ─────────────────────────────────────────────────────────────────────

describe("PATCH /api/admin/warehouses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouses", { id: "wh-1", name: "Nuevo" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouses", { name: "Sin ID" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id requerido");
  });

  it("updates warehouse name", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockFindFirst
      .mockResolvedValueOnce(BASE_WH)
      .mockResolvedValueOnce({ ...BASE_WH, name: "Almacén Actualizado" });
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouses", { id: "wh-1", name: "Almacén Actualizado" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Almacén Actualizado");
  });

  it("updates active status", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    mockFindFirst
      .mockResolvedValueOnce(BASE_WH)
      .mockResolvedValueOnce({ ...BASE_WH, active: false });
    const res = await PATCH(makeReq("PATCH", "https://host/api/admin/warehouses", { id: "wh-1", active: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe("DELETE /api/admin/warehouses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await DELETE(makeReq("DELETE", "https://host/api/admin/warehouses?id=wh-1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when id param is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const res = await DELETE(makeReq("DELETE", "https://host/api/admin/warehouses"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("id requerido");
  });

  it("returns 409 when deleting the last warehouse", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    // Only one warehouse in system
    mockFindMany.mockResolvedValue([BASE_WH]);
    const res = await DELETE(makeReq("DELETE", "https://host/api/admin/warehouses?id=wh-1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/\u00fanico almac\u00e9n/);
  });

  it("returns 409 when deleting a principal warehouse", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const secondWh = { ...BASE_WH, id: "wh-2", code: "DEP-001", type: "deposito" };
    mockFindMany.mockResolvedValue([BASE_WH, secondWh]);
    const res = await DELETE(makeReq("DELETE", "https://host/api/admin/warehouses?id=wh-1"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/almac\u00e9n principal/);
  });

  it("deletes a non-principal warehouse successfully", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const target = { ...BASE_WH, id: "wh-2", code: "DEP-001", type: "deposito" };
    mockFindMany.mockResolvedValue([BASE_WH, target]);
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    const res = await DELETE(makeReq("DELETE", "https://host/api/admin/warehouses?id=wh-2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 404 when warehouse is not found in list", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH_ADMIN);
    const target = { ...BASE_WH, id: "wh-2", code: "DEP-001", type: "deposito" };
    mockFindMany.mockResolvedValue([BASE_WH, target]);
    const res = await DELETE(makeReq("DELETE", "https://host/api/admin/warehouses?id=wh-999"));
    expect(res.status).toBe(404);
  });
});
