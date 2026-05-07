/**
 * Tests for /api/activity-log
 *
 * Validates:
 * - GET: cursor-based pagination, entity/user/action filters
 * - POST: Zod validation, tenantId scoping
 * - DELETE: tenant-scoped clear
 * - Auth enforcement
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

const { mockFindMany, mockCreate, mockDeleteMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
  mockDeleteMany: vi.fn(),
}));

vi.mock("@/lib/tenant", () => ({
  prismaForTenant: () => ({
    activityLog: {
      findMany: mockFindMany,
      create: mockCreate,
      deleteMany: mockDeleteMany,
    },
  }),
}));

// Route uses prisma direct from @/lib/prisma (CLAUDE.md Rule 1 violation,
// tracked as tech debt). Mock so tests don't hit a real DB.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    activityLog: {
      findMany: mockFindMany,
      create: mockCreate,
      deleteMany: mockDeleteMany,
    },
  },
}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

import { GET, POST, DELETE } from "../app/api/activity-log/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUTH = { tenantId: "tenant-1", role: "admin", sub: "user-1" };

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cuid-1",
    action: "create",
    entity: "product",
    entityId: "prod-1",
    detail: "Created product",
    user: "admin",
    tenantId: "tenant-1",
    createdAt: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeGetRequest(params: Record<string, string> = {}) {
  const sp = new URLSearchParams(params).toString();
  return new NextRequest(`https://localhost/api/activity-log${sp ? `?${sp}` : ""}`, {
    method: "GET",
  });
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest("https://localhost/api/activity-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest() {
  return new NextRequest("https://localhost/api/activity-log", {
    method: "DELETE",
  });
}

// ── GET tests ─────────────────────────────────────────────────────────────────

describe("GET /api/activity-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("returns paginated items and nextCursor:null when no more pages", async () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    mockFindMany.mockResolvedValue(rows);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeNull();
    expect(body.items[0].id).toBe("a");
  });

  it("returns nextCursor when there are more pages", async () => {
    // Return limit+1 rows so the route knows there are more
    const rows = Array.from({ length: 51 }, (_, i) => makeRow({ id: `row-${i}` }));
    mockFindMany.mockResolvedValue(rows);

    const res = await GET(makeGetRequest({ limit: "50" }));
    const body = await res.json();
    expect(body.items).toHaveLength(50);
    expect(body.nextCursor).toBe("row-49");
  });

  it("passes user filter to prisma where clause", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeGetRequest({ user: "maria" }));
    const call = mockFindMany.mock.calls[0][0];
    expect(call?.where?.user).toBe("maria");
  });

  it("passes action filter to prisma where clause", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeGetRequest({ action: "delete" }));
    const call = mockFindMany.mock.calls[0][0];
    expect(call?.where?.action).toBe("delete");
  });

  it("passes entity filter to prisma where clause", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeGetRequest({ entity: "order" }));
    const call = mockFindMany.mock.calls[0][0];
    expect(call?.where?.entity).toBe("order");
  });

  it("always scopes to tenantId from auth", async () => {
    mockFindMany.mockResolvedValue([]);
    await GET(makeGetRequest());
    const call = mockFindMany.mock.calls[0][0];
    expect(call?.where?.tenantId).toBe("tenant-1");
  });

  it("maps createdAt to ISO string in response", async () => {
    mockFindMany.mockResolvedValue([makeRow()]);
    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(typeof body.items[0].createdAt).toBe("string");
    expect(body.items[0].createdAt).toBe("2024-01-15T10:00:00.000Z");
  });
});

// ── POST tests ────────────────────────────────────────────────────────────────

describe("POST /api/activity-log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue(makeRow());
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    const res = await POST(makePostRequest({ action: "create", entity: "product", detail: "test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when action is missing", async () => {
    const res = await POST(makePostRequest({ entity: "product", detail: "test" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 when entity is missing", async () => {
    const res = await POST(makePostRequest({ action: "create", detail: "test" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when detail is missing", async () => {
    const res = await POST(makePostRequest({ action: "create", entity: "product" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when action exceeds 100 chars", async () => {
    const res = await POST(makePostRequest({
      action: "a".repeat(101),
      entity: "product",
      detail: "test",
    }));
    expect(res.status).toBe(400);
  });

  it("creates entry with tenantId from auth and returns 201", async () => {
    const res = await POST(makePostRequest({
      action: "create",
      entity: "product",
      detail: "Created product X",
      entityId: "prod-99",
    }));
    expect(res.status).toBe(201);
    const call = mockCreate.mock.calls[0][0];
    expect(call?.data?.tenantId).toBe("tenant-1");
    expect(call?.data?.action).toBe("create");
    expect(call?.data?.entity).toBe("product");
    expect(call?.data?.detail).toBe("Created product X");
    expect(call?.data?.entityId).toBe("prod-99");
  });

  it("uses default user 'admin' when user is not provided", async () => {
    await POST(makePostRequest({ action: "create", entity: "product", detail: "test" }));
    const call = mockCreate.mock.calls[0][0];
    expect(call?.data?.user).toBe("admin");
  });
});

// ── DELETE tests ──────────────────────────────────────────────────────────────
// COMPLIANCE 2026-05-06: el endpoint DELETE fue deshabilitado (Art. 11 Ley 29733).
// Antes cualquier admin podía borrar TODO el audit log. Ahora siempre devuelve 410.

describe("DELETE /api/activity-log (deshabilitado por compliance)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(AUTH);
  });

  it("returns 410 Gone with compliance reason", async () => {
    const res = await DELETE(new NextRequest("http://localhost/api/activity-log", { method: "DELETE" }));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/compliance|29733/i);
  });

  it("does NOT call deleteMany regardless of auth", async () => {
    await DELETE(new NextRequest("http://localhost/api/activity-log", { method: "DELETE" }));
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
