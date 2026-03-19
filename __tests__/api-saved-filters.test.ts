/**
 * API /api/saved-filters – unit tests
 * Covers: auth failure, validation, GET list, POST create (with conditions array), PATCH update, DELETE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockFindMany, mockCreate, mockFindFirst, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    savedFilter: {
      findMany: mockFindMany,
      create: mockCreate,
      findFirst: mockFindFirst,
      update: mockUpdate,
      delete: mockDelete,
    },
  },
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/saved-filters/route";

const AUTH = { tenantId: "main", role: "admin", username: "test" };
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
const BASE_FILTER = {
  id: "f1", name: "Clientes VIP", description: "", module: "Clientes",
  conditionsJson: JSON.stringify([{ field: "tier", operator: "eq", value: "vip" }]),
  isDefault: false, usageCount: 0, tenantId: "main", createdAt: NOW,
};
const VALID_BODY = { name: "Clientes VIP", module: "Clientes" };

// ── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/saved-filters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("GET", "https://host/api/saved-filters"));
    expect(res.status).toBe(401);
  });

  it("returns empty array", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("GET", "https://host/api/saved-filters"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns filters with parsed conditions", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindMany.mockResolvedValue([BASE_FILTER]);
    const res = await GET(makeReq("GET", "https://host/api/saved-filters"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].conditions).toEqual([{ field: "tier", operator: "eq", value: "vip" }]);
    expect(body[0].createdAt).toBe("2026-01-01");
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/saved-filters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq("POST", "https://host/api/saved-filters", VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing name", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/saved-filters", { module: "Ventas" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing module", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/saved-filters", { name: "Test" }));
    expect(res.status).toBe(400);
  });

  it("creates filter with conditionsJson string", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue(BASE_FILTER);
    const res = await POST(makeReq("POST", "https://host/api/saved-filters", {
      ...VALID_BODY,
      conditionsJson: JSON.stringify([{ field: "tier", operator: "eq", value: "vip" }]),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Clientes VIP");
  });

  it("creates filter with conditions array (auto-converts to JSON)", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue(BASE_FILTER);
    const res = await POST(makeReq("POST", "https://host/api/saved-filters", {
      ...VALID_BODY,
      conditions: [{ field: "tier", operator: "eq", value: "vip" }],
    }));
    expect(res.status).toBe(201);
  });

  it("creates filter with isDefault true", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue({ ...BASE_FILTER, isDefault: true });
    const res = await POST(makeReq("POST", "https://host/api/saved-filters", { ...VALID_BODY, isDefault: true }));
    expect(res.status).toBe(201);
    expect((await res.json()).isDefault).toBe(true);
  });
});

// ── PATCH ────────────────────────────────────────────────────────────────────

describe("PATCH /api/saved-filters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await PATCH(makeReq("PATCH", "https://host/api/saved-filters", { name: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when filter not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(null);
    const res = await PATCH(makeReq("PATCH", "https://host/api/saved-filters?id=x", { name: "x" }));
    expect(res.status).toBe(404);
  });

  it("updates usageCount via PATCH", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(BASE_FILTER);
    mockUpdate.mockResolvedValue({ ...BASE_FILTER, usageCount: 5 });
    const res = await PATCH(makeReq("PATCH", "https://host/api/saved-filters?id=f1", { usageCount: 5 }));
    expect(res.status).toBe(200);
    expect((await res.json()).usageCount).toBe(5);
  });

  it("sets isDefault via PATCH", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(BASE_FILTER);
    mockUpdate.mockResolvedValue({ ...BASE_FILTER, isDefault: true });
    const res = await PATCH(makeReq("PATCH", "https://host/api/saved-filters?id=f1", { isDefault: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).isDefault).toBe(true);
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/saved-filters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await DELETE(makeReq("DELETE", "https://host/api/saved-filters"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when filter not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq("DELETE", "https://host/api/saved-filters?id=x"));
    expect(res.status).toBe(404);
  });

  it("deletes and returns { ok: true }", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(BASE_FILTER);
    mockDelete.mockResolvedValue({});
    const res = await DELETE(makeReq("DELETE", "https://host/api/saved-filters?id=f1"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
