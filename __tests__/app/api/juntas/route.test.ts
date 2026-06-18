import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/resolve-tenant", () => ({
  resolveTenantIdForRoute: vi.fn().mockResolvedValue("t1"),
}));
vi.mock("@/lib/junta/customer", () => ({ customerPhoneFromReq: vi.fn() }));
vi.mock("@/lib/db/juntas.db", () => ({
  JuntasDB: { create: vi.fn(), listOpenByZone: vi.fn() },
}));

import { POST, GET } from "@/app/api/juntas/route";
import { customerPhoneFromReq } from "@/lib/junta/customer";
import { JuntasDB } from "@/lib/db/juntas.db";

function postReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}
function getReq(zone?: string): NextRequest {
  const sp = new URLSearchParams(zone ? { zone } : {});
  return { nextUrl: { searchParams: sp } } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(customerPhoneFromReq).mockResolvedValue("999888777");
});

describe("POST /api/juntas", () => {
  it("sin sesión → 401", async () => {
    vi.mocked(customerPhoneFromReq).mockResolvedValue(null);
    const res = await POST(postReq({ zoneLabel: "Centro" }));
    expect(res.status).toBe(401);
  });

  it("body inválido → 400", async () => {
    const res = await POST(postReq({ zoneLabel: "" }));
    expect(res.status).toBe(400);
  });

  it("OK → devuelve code y crea con el phone como iniciador", async () => {
    vi.mocked(JuntasDB.create).mockResolvedValue({
      code: "BARRIO-AB12",
      memberCount: 1,
      status: "OPEN",
    } as never);
    const res = await POST(postReq({ zoneLabel: "Centro", targetMembers: 4 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe("BARRIO-AB12");
    const arg = vi.mocked(JuntasDB.create).mock.calls[0];
    expect(arg[0]).toBe("t1");
    expect(arg[1].initiatorId).toBe("999888777");
    expect(arg[1].windowEnd).toBeInstanceOf(Date);
  });
});

describe("GET /api/juntas", () => {
  it("sin zona → lista vacía", async () => {
    const res = await GET(getReq());
    expect((await res.json()).juntas).toEqual([]);
    expect(JuntasDB.listOpenByZone).not.toHaveBeenCalled();
  });

  it("con zona → devuelve las juntas de esa zona", async () => {
    vi.mocked(JuntasDB.listOpenByZone).mockResolvedValue([
      { code: "BARRIO-AB12" },
    ] as never);
    const res = await GET(getReq("Centro"));
    const json = await res.json();
    expect(json.juntas).toHaveLength(1);
    expect(JuntasDB.listOpenByZone).toHaveBeenCalledWith("t1", "Centro");
  });
});
