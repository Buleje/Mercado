/**
 * Tests — DELETE /api/superadmin/vendor-grace
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { csrfMock } from "../helpers/mocks";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/csrf", () => csrfMock());

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockRequirePlatform } = vi.hoisted(() => ({
  mockRequirePlatform: vi.fn(),
}));
vi.mock("@/lib/superadmin-auth", () => ({
  requirePlatformAPI: mockRequirePlatform,
}));

const { mockGraceGet, mockGraceClear } = vi.hoisted(() => ({
  mockGraceGet: vi.fn(),
  mockGraceClear: vi.fn(),
}));
vi.mock("@/lib/db/vendor-grace.db", () => ({
  VendorGraceDB: {
    get: mockGraceGet,
    clear: mockGraceClear,
  },
}));

import { DELETE } from "@/app/api/superadmin/vendor-grace/route";

function makeReq(tenantId?: string): NextRequest {
  const url = tenantId
    ? `https://example.com/api/superadmin/vendor-grace?tenantId=${tenantId}`
    : "https://example.com/api/superadmin/vendor-grace";
  return new NextRequest(url, { method: "DELETE" });
}

describe("DELETE /api/superadmin/vendor-grace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePlatform.mockResolvedValue({ ok: true, username: "sa-test" });
  });

  it("401 sin sesión platform", async () => {
    mockRequirePlatform.mockResolvedValueOnce(
      NextResponse.json({ error: "no auth" }, { status: 401 }),
    );
    const res = await DELETE(makeReq("t-1"));
    expect(res.status).toBe(401);
  });

  it("400 si falta tenantId", async () => {
    const res = await DELETE(makeReq());
    expect(res.status).toBe(400);
  });

  it("retorna cleared=false si no había grace activo", async () => {
    mockGraceGet.mockReturnValueOnce(null);
    const res = await DELETE(makeReq("t-noop"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cleared).toBe(false);
    expect(mockGraceClear).not.toHaveBeenCalled();
  });

  it("borra grace activo y retorna previousGrace info", async () => {
    mockGraceGet.mockReturnValueOnce({
      vendorId: "v-1",
      kind: "ruc-changed",
      until: "2026-06-01T00:00:00Z",
      graceDays: 7,
      acknowledgedBy: "admin-abuser",
      acknowledgedAt: "2026-05-25T00:00:00Z",
    });
    const res = await DELETE(makeReq("t-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cleared).toBe(true);
    expect(body.previousGrace).toEqual({
      vendorId: "v-1",
      kind: "ruc-changed",
      acknowledgedBy: "admin-abuser",
    });
    expect(mockGraceClear).toHaveBeenCalledWith("t-1");
  });

  it("rate-limit aplica", async () => {
    const { applyRateLimit } = await import("@/lib/rate-limit");
    (applyRateLimit as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Response(null, { status: 429 }),
    );
    const res = await DELETE(makeReq("t-1"));
    expect(res.status).toBe(429);
  });
});
