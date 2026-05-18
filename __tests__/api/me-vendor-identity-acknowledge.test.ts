/**
 * Tests — /api/me/vendor-identity-acknowledge (POST + DELETE + GET)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

const { mockGraceSet, mockGraceGet, mockGraceClear } = vi.hoisted(() => ({
  mockGraceSet: vi.fn(),
  mockGraceGet: vi.fn(),
  mockGraceClear: vi.fn(),
}));

vi.mock("@/lib/db/vendor-grace.db", () => ({
  VendorGraceDB: {
    set: mockGraceSet,
    get: mockGraceGet,
    clear: mockGraceClear,
  },
  VALID_GRACE_DAYS: [3, 7, 14],
}));

import { POST, DELETE, GET } from "@/app/api/me/vendor-identity-acknowledge/route";

function makeReq(method: "POST" | "DELETE" | "GET", body?: unknown): NextRequest {
  return new NextRequest("https://example.com/api/me/vendor-identity-acknowledge", {
    method,
    ...(body != null && {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  });
}

describe("POST /api/me/vendor-identity-acknowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      tenantId: "t-1",
      username: "admin",
      role: "admin",
    });
    mockGraceSet.mockResolvedValue({
      vendorId: "v-1",
      kind: "ruc-changed",
      until: "2026-06-01T00:00:00Z",
      graceDays: 7,
      acknowledgedBy: "admin",
      acknowledgedAt: "2026-05-25T00:00:00Z",
    });
  });

  it("401 sin auth", async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: "no auth" }, { status: 401 }),
    );
    const res = await POST(
      makeReq("POST", { vendorId: "v-1", kind: "ruc-changed", graceDays: 7 }),
    );
    expect(res.status).toBe(401);
  });

  it("400 si body no es JSON", async () => {
    const req = new NextRequest("https://example.com/api/me/vendor-identity-acknowledge", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 si graceDays no es 3/7/14", async () => {
    const res = await POST(
      makeReq("POST", { vendorId: "v-1", kind: "ruc-changed", graceDays: 5 }),
    );
    expect(res.status).toBe(400);
  });

  it("400 si kind inválido", async () => {
    const res = await POST(
      makeReq("POST", { vendorId: "v-1", kind: "other-kind", graceDays: 7 }),
    );
    expect(res.status).toBe(400);
  });

  it("crea grace 7 días y devuelve record", async () => {
    const res = await POST(
      makeReq("POST", {
        vendorId: "v-1",
        kind: "ruc-changed",
        graceDays: 7,
        reason: "Cita SUNAT lunes",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.grace.graceDays).toBe(7);
    expect(mockGraceSet).toHaveBeenCalledWith("t-1", expect.objectContaining({
      vendorId: "v-1",
      kind: "ruc-changed",
      graceDays: 7,
      reason: "Cita SUNAT lunes",
      acknowledgedBy: "admin",
    }));
  });

  it("acepta sin reason (opcional)", async () => {
    const res = await POST(
      makeReq("POST", { vendorId: "v-1", kind: "ruc-changed", graceDays: 3 }),
    );
    expect(res.status).toBe(200);
    const call = mockGraceSet.mock.calls[0]?.[1] as { reason?: string };
    expect(call.reason).toBeUndefined();
  });
});

describe("DELETE /api/me/vendor-identity-acknowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      tenantId: "t-1",
      username: "admin",
      role: "admin",
    });
  });

  it("borra el grace + retorna ok", async () => {
    const res = await DELETE(makeReq("DELETE"));
    expect(res.status).toBe(200);
    expect(mockGraceClear).toHaveBeenCalledWith("t-1");
  });

  it("401 sin auth", async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: "no auth" }, { status: 401 }),
    );
    const res = await DELETE(makeReq("DELETE"));
    expect(res.status).toBe(401);
    expect(mockGraceClear).not.toHaveBeenCalled();
  });
});

describe("GET /api/me/vendor-identity-acknowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      tenantId: "t-1",
      username: "admin",
      role: "admin",
    });
  });

  it("retorna grace activo del tenant", async () => {
    mockGraceGet.mockReturnValueOnce({
      vendorId: "v-1",
      kind: "ruc-changed",
      until: "2026-06-01T00:00:00Z",
      graceDays: 7,
      acknowledgedBy: "admin",
      acknowledgedAt: "2026-05-25T00:00:00Z",
    });
    const res = await GET(makeReq("GET"));
    const body = await res.json();
    expect(body.grace?.vendorId).toBe("v-1");
  });

  it("retorna null si no hay grace activo", async () => {
    mockGraceGet.mockReturnValueOnce(null);
    const res = await GET(makeReq("GET"));
    const body = await res.json();
    expect(body.grace).toBeNull();
  });
});
