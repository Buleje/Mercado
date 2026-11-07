import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth/customer-session", () => ({
  CUSTOMER_SESSION: { COOKIE_NAME: "buleje-cust-sess" },
  getCustomerPayload: vi.fn(),
}));
vi.mock("@/lib/credit/checkout-fiado", () => ({
  getFiadoCheckoutEligibility: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));

import { POST } from "@/app/api/checkout/fiado-option/route";
import { getCustomerPayload } from "@/lib/auth/customer-session";
import { getFiadoCheckoutEligibility } from "@/lib/credit/checkout-fiado";

function mockReq(body: unknown, cookieVal?: string): NextRequest {
  return {
    cookies: { get: () => (cookieVal ? { value: cookieVal } : undefined) },
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.mocked(getCustomerPayload).mockResolvedValue({
    tenantId: "t1",
    customerId: "+51999",
    name: "Ana",
  } as never);
});

describe("POST /api/checkout/fiado-option", () => {
  it("sin sesión → 401", async () => {
    const res = await POST(mockReq({ total: 30 }));
    expect(res.status).toBe(401);
  });

  it("body inválido → 400", async () => {
    const res = await POST(mockReq({ total: -5 }, "tok"));
    expect(res.status).toBe(400);
  });

  it("elegible → 200 con dueDate serializado", async () => {
    vi.mocked(getFiadoCheckoutEligibility).mockResolvedValue({
      eligible: true,
      availableCredit: 80,
      creditLimit: 100,
      dueDate: new Date("2026-06-15"),
      reason: null,
    });
    const res = await POST(mockReq({ total: 30 }, "tok"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eligible).toBe(true);
    expect(json.availableCredit).toBe(80);
    expect(typeof json.dueDate).toBe("string");
  });

  it("pasa tenantId y customerId del payload a la elegibilidad", async () => {
    vi.mocked(getFiadoCheckoutEligibility).mockResolvedValue({
      eligible: false,
      availableCredit: 0,
      creditLimit: 0,
      dueDate: null,
      reason: "x",
    });
    await POST(mockReq({ total: 30 }, "tok"));
    expect(getFiadoCheckoutEligibility).toHaveBeenCalledWith("t1", "+51999", 30);
  });
});
