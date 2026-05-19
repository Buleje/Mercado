/**
 * API /api/message-templates – unit tests
 * Covers: auth failure, validation, GET list, POST create, PATCH update, DELETE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));

const { mockFindMany, mockCreate, mockFindFirst, mockUpdate, mockDelete, mockUpdateMany, mockDeleteMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockCreate: vi.fn(),
  mockFindFirst: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockDeleteMany: vi.fn(),
}));
vi.mock("@/lib/tenant", () => ({
  prismaForTenant: () => ({
    messageTemplate: {
      findMany: mockFindMany,
      create: mockCreate,
      findFirst: mockFindFirst,
      update: mockUpdate,
      delete: mockDelete,
      updateMany: mockUpdateMany,
      deleteMany: mockDeleteMany,
    },
  }),
}));

// Route uses prisma direct from @/lib/prisma (CLAUDE.md Rule 1 violation,
// tracked as tech debt). Mock so tests don't hit a real DB.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    messageTemplate: {
      findMany: mockFindMany,
      create: mockCreate,
      findFirst: mockFindFirst,
      update: mockUpdate,
      delete: mockDelete,
      updateMany: mockUpdateMany,
      deleteMany: mockDeleteMany,
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  applyRateLimitWithTenant: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// Brandon 2026-05-17: MessageTemplatesDB.list usa getOrSet con cache de 60s.
// Sin mock, el primer test puebla el cache con [] y los siguientes ven cache
// stale. Bypass directo al factory para que cada test vea su mockResolvedValue.
vi.mock("@/lib/cache", () => ({
  getOrSet: vi.fn(async (_k: string, _t: number, fn: () => Promise<unknown>) => fn()),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/message-templates/route";

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
const BASE_TPL = {
  id: "t1", name: "Bienvenida", channel: "whatsapp", category: "ventas",
  subject: null, body: "Hola {{nombre}}", variablesJson: "[\"nombre\"]",
  starred: false, usageCount: 0, tenantId: "main", createdAt: NOW, updatedAt: NOW,
};
const VALID_BODY = { name: "Bienvenida", channel: "whatsapp", category: "ventas", body: "Hola {{nombre}}" };

// ── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/message-templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("GET", "https://host/api/message-templates"));
    expect(res.status).toBe(401);
  });

  it("returns empty array", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("GET", "https://host/api/message-templates"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns templates with parsed variables", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindMany.mockResolvedValue([BASE_TPL]);
    const res = await GET(makeReq("GET", "https://host/api/message-templates"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].variables).toEqual(["nombre"]);
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/message-templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq("POST", "https://host/api/message-templates", VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing name", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/message-templates", { channel: "whatsapp", category: "ventas", body: "Hi" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid channel", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/message-templates", { ...VALID_BODY, channel: "telegram" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid category", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/message-templates", { ...VALID_BODY, category: "desconocida" }));
    expect(res.status).toBe(400);
  });

  it("creates template and returns 201", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue(BASE_TPL);
    const res = await POST(makeReq("POST", "https://host/api/message-templates", VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Bienvenida");
    expect(body.variables).toEqual(["nombre"]);
  });
});

// ── PATCH ────────────────────────────────────────────────────────────────────

describe("PATCH /api/message-templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await PATCH(makeReq("PATCH", "https://host/api/message-templates", { name: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when template not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    // SECURITY (HOTFIX-M3): updateMany es la nueva primera query.
    mockUpdateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(makeReq("PATCH", "https://host/api/message-templates?id=x", { name: "x" }));
    expect(res.status).toBe(404);
  });

  it("increments usageCount successfully", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    // SECURITY (HOTFIX-M3): updateMany retorna count > 0 → luego findFirst lee la fila.
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindFirst.mockResolvedValue({ ...BASE_TPL, usageCount: 1 });
    const res = await PATCH(makeReq("PATCH", "https://host/api/message-templates?id=t1", { usageCount: 1 }));
    expect(res.status).toBe(200);
    expect((await res.json()).usageCount).toBe(1);
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/message-templates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await DELETE(makeReq("DELETE", "https://host/api/message-templates"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when template not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    // SECURITY (HOTFIX-M3): deleteMany atomico — count=0 → 404.
    mockDeleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(makeReq("DELETE", "https://host/api/message-templates?id=x"));
    expect(res.status).toBe(404);
  });

  it("deletes and returns { ok: true }", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockDeleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeReq("DELETE", "https://host/api/message-templates?id=t1"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
