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

// Prisma mock — the three methods the route touches.
const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    savedCart: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

// Imports must follow the mocks so the route picks up the stubs.
import { GET, DELETE } from "@/app/api/cart/[phone]/route";
import { signCartToken } from "@/lib/auth/cart-token";

const PHONE = "987654321";

function paramsFor(phone: string): Promise<{ phone: string }> {
  return Promise.resolve({ phone });
}

describe("/api/cart/[phone] — RED-009 auth gate", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpsert.mockReset();
    mockDeleteMany.mockReset();
  });

  it("returns 404 when the request is unauthenticated (no token)", async () => {
    const req = new NextRequest(`http://localhost/api/cart/${PHONE}`);
    const res = await GET(req, { params: paramsFor(PHONE) });

    expect(res.status).toBe(404);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns the saved cart on an authenticated GET", async () => {
    const token = signCartToken(PHONE);
    const savedItems = [
      { id: 1, name: "Coca-Cola 500ml", price: 3.5, quantity: 2 },
      { id: 2, name: "Pan francés", price: 0.4, quantity: 10 },
    ];
    const updatedAt = new Date("2026-04-09T12:00:00.000Z");

    mockFindUnique.mockResolvedValue({
      customerPhone: PHONE,
      itemsJson: JSON.stringify(savedItems),
      updatedAt,
    });

    const req = new NextRequest(
      `http://localhost/api/cart/${PHONE}?token=${token}`,
    );
    const res = await GET(req, { params: paramsFor(PHONE) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual(savedItems);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { customerPhone: PHONE },
    });
  });

  it("clears the saved cart on an authenticated DELETE", async () => {
    const token = signCartToken(PHONE);
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const req = new NextRequest(
      `http://localhost/api/cart/${PHONE}?token=${token}`,
      { method: "DELETE" },
    );
    const res = await DELETE(req, { params: paramsFor(PHONE) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { customerPhone: PHONE },
    });
  });
});
