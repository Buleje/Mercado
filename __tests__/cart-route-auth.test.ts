/**
 * __tests__/cart-route-auth.test.ts
 *
 * Regression tests for RED-009 — /api/cart/[phone] auth gate.
 *
 * The endpoint is anonymous-but-identifiable: the caller proves ownership
 * of the phone number by presenting an HMAC token generated server-side.
 * Any auth failure must collapse to a 404 (no existence oracle).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// AUTH_SECRET must be present before the helper runs. `verifyCartToken`
// reads env at call time, so stubbing here (above the dynamic imports
// inside each test) is sufficient.
vi.stubEnv("AUTH_SECRET", "test-auth-secret-abcdefghijklmnop");

// Rate-limit mock — always allow.
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: vi.fn(() => null),
  applyRateLimitWithTenant: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// Prisma mock — all methods the route touches (findFirst, create, deleteMany).
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockUpsert = vi.fn();
const mockCreate = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    savedCart: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

// Imports must follow the mocks so the route picks up the stubs.
import { GET, DELETE } from "@/app/api/cart/[phone]/route";
import { signCartToken } from "@/lib/auth/cart-token";

const PHONE = "987654321";
const TENANT = "main";

function paramsFor(phone: string): Promise<{ phone: string }> {
  return Promise.resolve({ phone });
}

/** Build a NextRequest with the active-tenant cookie already set. */
function makeRequest(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
): NextRequest {
  const req = new NextRequest(url, init);
  req.cookies.set("active-tenant", TENANT);
  return req;
}

describe("/api/cart/[phone] — RED-009 auth gate", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindFirst.mockReset();
    mockUpsert.mockReset();
    mockCreate.mockReset();
    mockDeleteMany.mockReset();
  });

  it("returns 404 when the request is unauthenticated (no token)", async () => {
    const req = makeRequest(`http://localhost/api/cart/${PHONE}`);
    const res = await GET(req, { params: paramsFor(PHONE) });

    expect(res.status).toBe(404);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns the saved cart on an authenticated GET", async () => {
    const token = signCartToken(TENANT, PHONE);
    const savedItems = [
      { id: 1, name: "Coca-Cola 500ml", price: 3.5, quantity: 2 },
      { id: 2, name: "Pan francés", price: 0.4, quantity: 10 },
    ];
    const updatedAt = new Date("2026-04-09T12:00:00.000Z");

    // Route uses findFirst (with tenantId guard — Security P1 Round 23).
    mockFindFirst.mockResolvedValue({
      customerPhone: PHONE,
      itemsJson: JSON.stringify(savedItems),
      updatedAt,
    });

    const req = makeRequest(
      `http://localhost/api/cart/${PHONE}?token=${token}`,
    );
    const res = await GET(req, { params: paramsFor(PHONE) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual(savedItems);
    expect(mockFindFirst).toHaveBeenCalled();
  });

  it("clears the saved cart on an authenticated DELETE", async () => {
    const token = signCartToken(TENANT, PHONE);
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const req = makeRequest(
      `http://localhost/api/cart/${PHONE}?token=${token}`,
      { method: "DELETE" },
    );
    const res = await DELETE(req, { params: paramsFor(PHONE) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Route includes tenantId guard in the DELETE where clause (Security P1).
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerPhone: PHONE }),
      }),
    );
  });
});
