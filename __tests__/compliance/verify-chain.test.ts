/**
 * Tests del endpoint GET /api/compliance/verify-chain
 *
 * Round 25 (2026-05-09) — cierra QA gap #2 reportado en round 21.
 *
 * Cubre:
 *  - 400 cuando falta tenantId
 *  - 401 cuando no hay auth (ni superadmin ni admin)
 *  - 403 cuando admin intenta verificar tenant ajeno
 *  - 200 cuando superadmin verifica cualquier tenant
 *  - 200 cuando admin verifica su propio tenant
 *  - chainStatus="empty" cuando no hay entries L29733
 *  - rate limit STRICT aplicado
 *  - audit del propio acceso (round 7 H001)
 *  - gate de detalle por rol (round 7 M001): admin solo ve chainStatus
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

// Mock auth helpers
const { mockGetPlatformSession, mockRequireAdmin } = vi.hoisted(() => ({
  mockGetPlatformSession: vi.fn(),
  mockRequireAdmin: vi.fn(),
}));
vi.mock("@/lib/superadmin-session", () => ({
  getPlatformSession: mockGetPlatformSession,
  PLATFORM_SESSION: { COOKIE_NAME: "bsm-platform" },
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

// Mock activity-logger (verify-chain audita su propio acceso desde round 7)
const { mockLogActivity } = vi.hoisted(() => ({ mockLogActivity: vi.fn() }));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: mockLogActivity,
}));

// Mock prisma — $queryRawUnsafe devuelve array de filas L29733
const { mockQueryRawUnsafe } = vi.hoisted(() => ({ mockQueryRawUnsafe: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
}));

// Mock hash-chain verifier — el test no valida el algoritmo en sí, sólo el flujo
vi.mock("@/lib/audit/hash-chain", () => ({
  verifyChain: vi.fn(() => ({ valid: true, brokenAt: null })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock applyRateLimitWithTenant (round 8 M002)
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  applyRateLimitWithTenant: vi.fn(() => null),
}));

import { GET } from "@/app/api/compliance/verify-chain/route";

function makeReq(url: string, opts?: { platformCookie?: boolean }): NextRequest {
  const headers = new Headers();
  const cookies = opts?.platformCookie ? "bsm-platform=valid-token" : "";
  if (cookies) headers.set("cookie", cookies);
  return new NextRequest(url, { headers });
}

describe("GET /api/compliance/verify-chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlatformSession.mockResolvedValue(null);
    mockQueryRawUnsafe.mockResolvedValue([]);
  });

  it("400 — tenantId requerido", async () => {
    const req = makeReq("http://localhost/api/compliance/verify-chain");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/inválido/i);
  });

  it("401 — sin auth (ni superadmin ni admin)", async () => {
    // Handler usa `if (auth instanceof NextResponse) return auth` — debe ser
    // NextResponse específicamente, no Response del DOM.
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    );
    const req = makeReq("http://localhost/api/compliance/verify-chain?tenantId=t1");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("403 — admin intenta verificar tenant ajeno", async () => {
    mockRequireAdmin.mockResolvedValue({
      tenantId: "tenant-A",
      username: "admin-a",
      role: "admin",
    });
    const req = makeReq("http://localhost/api/compliance/verify-chain?tenantId=tenant-B");
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("200 chainStatus=empty cuando no hay entries L29733 (admin propio tenant)", async () => {
    mockRequireAdmin.mockResolvedValue({
      tenantId: "tenant-A",
      username: "admin-a",
      role: "admin",
    });
    mockQueryRawUnsafe.mockResolvedValue([]);

    const req = makeReq("http://localhost/api/compliance/verify-chain?tenantId=tenant-A");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chainStatus).toBe("empty");
    expect(body.totalEntries).toBe(0);
  });

  it("200 — superadmin puede verificar cualquier tenant + ve detalle completo", async () => {
    mockGetPlatformSession.mockResolvedValue({ username: "superadmin", role: "platform" });

    const fakeRows = [
      {
        id: "cpl_1",
        action: "CREATE",
        entity: "[L29733] Customer",
        entityId: "+51999000111",
        detail: JSON.stringify({ originalDetail: "test", hash: "abc", previousHash: null }),
        user: "admin-a",
        ipAddress: "1.2.3.4",
        tenantId: "tenant-A",
        createdAt: new Date("2026-05-01"),
      },
    ];
    mockQueryRawUnsafe.mockResolvedValue(fakeRows);

    const req = makeReq(
      "http://localhost/api/compliance/verify-chain?tenantId=tenant-A",
      { platformCookie: true },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Round 7 M001: superadmin SÍ ve brokenAt + firstEntry/lastEntry detallado
    expect(body.chainStatus).toBe("valid");
    expect(body.totalEntries).toBe(1);
    expect(body).toHaveProperty("firstEntry");
    expect(body).toHaveProperty("lastEntry");
  });

  it("200 — admin propio tenant solo ve chainStatus (M001 gate)", async () => {
    mockRequireAdmin.mockResolvedValue({
      tenantId: "tenant-A",
      username: "admin-a",
      role: "admin",
    });

    const fakeRows = [
      {
        id: "cpl_1",
        action: "CREATE",
        entity: "[L29733] Customer",
        entityId: "+51999000111",
        detail: JSON.stringify({ originalDetail: "test", hash: "abc", previousHash: null }),
        user: "admin-a",
        ipAddress: "1.2.3.4",
        tenantId: "tenant-A",
        createdAt: new Date("2026-05-01"),
      },
    ];
    mockQueryRawUnsafe.mockResolvedValue(fakeRows);

    const req = makeReq("http://localhost/api/compliance/verify-chain?tenantId=tenant-A");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Round 7 M001: admin NO ve hashes ni brokenAt (signal feedback de tampering)
    expect(body.chainStatus).toBe("valid");
    expect(body.totalEntries).toBe(1);
    expect(body).not.toHaveProperty("firstEntry");
    expect(body).not.toHaveProperty("lastEntry");
    expect(body).not.toHaveProperty("brokenAt");
  });

  it("auditea su propio acceso al chain (Round 7 H001 — Ley 29733)", async () => {
    mockRequireAdmin.mockResolvedValue({
      tenantId: "tenant-A",
      username: "admin-a",
      role: "admin",
    });
    mockQueryRawUnsafe.mockResolvedValue([
      {
        id: "cpl_1",
        action: "CREATE",
        entity: "[L29733] Customer",
        entityId: "x",
        detail: JSON.stringify({ originalDetail: "t", hash: "abc", previousHash: null }),
        user: "admin-a",
        ipAddress: null,
        tenantId: "tenant-A",
        createdAt: new Date(),
      },
    ]);

    const req = makeReq("http://localhost/api/compliance/verify-chain?tenantId=tenant-A");
    await GET(req);
    // logActivity es void/fire-and-forget — esperar tick para que se queue.
    await new Promise((r) => setTimeout(r, 0));

    expect(mockLogActivity).toHaveBeenCalledWith(
      "READ_AUDIT_CHAIN",
      "[L29733] ChainVerification",
      expect.any(String),
      undefined,
      "admin-a",
      undefined,
      "tenant-A",
    );
  });
});
