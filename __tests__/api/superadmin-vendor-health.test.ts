/**
 * Tests — GET /api/superadmin/vendor-health
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockRequirePlatform } = vi.hoisted(() => ({
  mockRequirePlatform: vi.fn(),
}));

vi.mock("@/lib/superadmin-auth", () => ({
  requirePlatformAPI: mockRequirePlatform,
}));

const { mockCacheGet } = vi.hoisted(() => ({
  mockCacheGet: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  cacheStore: {
    get: mockCacheGet,
    set: vi.fn(),
    del: vi.fn(),
  },
}));

import { GET } from "@/app/api/superadmin/vendor-health/route";

function makeReq(): NextRequest {
  return new NextRequest("https://example.com/api/superadmin/vendor-health");
}

describe("GET /api/superadmin/vendor-health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatform.mockResolvedValue({ ok: true, username: "sa-test" });
  });

  it("401 si no hay sesión platform", async () => {
    mockRequirePlatform.mockResolvedValueOnce(
      NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("neverRun=true cuando cache vacío", async () => {
    mockCacheGet.mockReturnValueOnce(null);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.neverRun).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.summary).toBeNull();
  });

  it("retorna summary con healthScore=100 cuando 0 alerts", async () => {
    mockCacheGet.mockReturnValueOnce({
      lastRunAt: new Date().toISOString(),
      total: 10,
      checked: 10,
      changed: 0,
      errors: 0,
      alerts: [],
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.healthScore).toBe(100);
    expect(body.stale).toBe(false);
    expect(body.alertsByKind).toEqual({});
  });

  it("calcula healthScore correctamente con alerts", async () => {
    mockCacheGet.mockReturnValueOnce({
      lastRunAt: new Date().toISOString(),
      total: 10,
      checked: 10,
      changed: 2,
      errors: 0,
      alerts: [
        { vendorId: "v1", tenantSlug: "a", kind: "ruc-changed", detail: "x" },
        { vendorId: "v2", tenantSlug: "b", kind: "dni-not-found", detail: "y" },
      ],
    });
    const res = await GET(makeReq());
    const body = await res.json();
    // 10 total - 2 alerts = 8 sanas → 80%
    expect(body.healthScore).toBe(80);
    expect(body.alertsByKind).toEqual({
      "ruc-changed": 1,
      "dni-not-found": 1,
    });
  });

  it("marca stale=true si último run >36h", async () => {
    const old = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString();
    mockCacheGet.mockReturnValueOnce({
      lastRunAt: old,
      total: 5,
      checked: 5,
      changed: 0,
      errors: 0,
      alerts: [],
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.stale).toBe(true);
  });

  it("healthScore=100 cuando total=0 (sin vendors)", async () => {
    mockCacheGet.mockReturnValueOnce({
      lastRunAt: new Date().toISOString(),
      total: 0,
      checked: 0,
      changed: 0,
      errors: 0,
      alerts: [],
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.healthScore).toBe(100);
  });
});
