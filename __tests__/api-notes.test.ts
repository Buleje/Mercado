/**
 * API /api/notes – unit tests
 * Covers: auth failure, validation, GET list, POST create, PATCH update, DELETE
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
vi.mock("@/lib/tenant", () => ({
  prismaForTenant: () => ({
    note: {
      findMany: mockFindMany,
      create: mockCreate,
      findFirst: mockFindFirst,
      update: mockUpdate,
      delete: mockDelete,
    },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/notes/route";

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
const BASE_NOTE = {
  id: "n1", title: "Test", content: "", color: "yellow",
  pinned: false, tenantId: "main", createdAt: NOW, updatedAt: NOW,
};

// ── GET ──────────────────────────────────────────────────────────────────────

describe("GET /api/notes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await GET(makeReq("GET", "https://host/api/notes"));
    expect(res.status).toBe(401);
  });

  it("returns empty array when no notes", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("GET", "https://host/api/notes"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns notes list", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindMany.mockResolvedValue([BASE_NOTE]);
    const res = await GET(makeReq("GET", "https://host/api/notes"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Test");
  });
});

// ── POST ─────────────────────────────────────────────────────────────────────

describe("POST /api/notes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH);
    const res = await POST(makeReq("POST", "https://host/api/notes", { title: "x" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing title", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/notes", { content: "no title" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 on title exceeding max length", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/notes", { title: "x".repeat(201) }));
    expect(res.status).toBe(400);
  });

  it("creates a note and returns 201", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue({ ...BASE_NOTE, title: "Nueva nota" });
    const res = await POST(makeReq("POST", "https://host/api/notes", { title: "Nueva nota" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe("Nueva nota");
  });

  it("accepts valid color values", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockCreate.mockResolvedValue({ ...BASE_NOTE, color: "blue" });
    const res = await POST(makeReq("POST", "https://host/api/notes", { title: "x", color: "blue" }));
    expect(res.status).toBe(201);
  });

  it("returns 400 on invalid color", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await POST(makeReq("POST", "https://host/api/notes", { title: "x", color: "rojo" }));
    expect(res.status).toBe(400);
  });
});

// ── PATCH ────────────────────────────────────────────────────────────────────

describe("PATCH /api/notes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when id param is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await PATCH(makeReq("PATCH", "https://host/api/notes", { title: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when note not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(null);
    const res = await PATCH(makeReq("PATCH", "https://host/api/notes?id=missing", { title: "x" }));
    expect(res.status).toBe(404);
  });

  it("updates and returns 200", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(BASE_NOTE);
    mockUpdate.mockResolvedValue({ ...BASE_NOTE, title: "Actualizado", pinned: true });
    const res = await PATCH(makeReq("PATCH", "https://host/api/notes?id=n1", { title: "Actualizado", pinned: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Actualizado");
    expect(body.pinned).toBe(true);
  });
});

// ── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/notes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when id is missing", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    const res = await DELETE(makeReq("DELETE", "https://host/api/notes"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when note not found", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq("DELETE", "https://host/api/notes?id=x"));
    expect(res.status).toBe(404);
  });

  it("deletes and returns { ok: true }", async () => {
    mockRequireAdmin.mockResolvedValue(AUTH);
    mockFindFirst.mockResolvedValue(BASE_NOTE);
    mockDelete.mockResolvedValue({});
    const res = await DELETE(makeReq("DELETE", "https://host/api/notes?id=n1"));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
