/**
 * Tests unitarios — /api/marketplace/anomalies
 *
 * Cubre:
 *  - GET sin auth → 401/403
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn(async () => {}) };
});

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { store: { findFirst: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  SalesAnomaliesDB: { getRecent: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET } from "@/app/api/marketplace/anomalies/route";

describe("GET /api/marketplace/anomalies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 cuando requireAdmin rechaza la auth", async () => {
    const authError = new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
    mockRequireAdmin.mockResolvedValueOnce(authError);

    const url = new URL("http://localhost/api/marketplace/anomalies?storeSlug=test");
    const req = new NextRequest(url);
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(mockRequireAdmin).toHaveBeenCalled();
  });

  it("retorna 403 cuando requireAdmin rechaza por roles insuficientes", async () => {
    const authError = new NextResponse(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
    });
    mockRequireAdmin.mockResolvedValueOnce(authError);

    const url = new URL("http://localhost/api/marketplace/anomalies?storeSlug=test");
    const req = new NextRequest(url);
    const res = await GET(req);

    expect(res.status).toBe(403);
  });
});
