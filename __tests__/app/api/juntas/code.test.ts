import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/resolve-tenant", () => ({
  resolveTenantIdForRoute: vi.fn().mockResolvedValue("t1"),
}));
vi.mock("@/lib/junta/customer", () => ({ customerPhoneFromReq: vi.fn() }));
vi.mock("@/lib/db/juntas.db", () => ({
  JuntasDB: { getByCode: vi.fn(), join: vi.fn() },
}));

import { GET } from "@/app/api/juntas/[code]/route";
import { POST as JOIN } from "@/app/api/juntas/[code]/join/route";
import { customerPhoneFromReq } from "@/lib/junta/customer";
import { JuntasDB } from "@/lib/db/juntas.db";

const req = {} as unknown as NextRequest;
/** Req de invitado: trae body JSON (la junta acepta sumarse sin sesión). */
const guestReq = (body: unknown) =>
  ({ json: () => Promise.resolve(body) }) as unknown as NextRequest;
const params = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(customerPhoneFromReq).mockResolvedValue("999888777");
});

describe("GET /api/juntas/[code]", () => {
  it("inexistente → 404", async () => {
    vi.mocked(JuntasDB.getByCode).mockResolvedValue(null);
    const res = await GET(req, params("BARRIO-XXXX"));
    expect(res.status).toBe(404);
  });

  it("existente → 200 con la junta", async () => {
    vi.mocked(JuntasDB.getByCode).mockResolvedValue({
      code: "BARRIO-AB12",
      status: "OPEN",
    } as never);
    const res = await GET(req, params("BARRIO-AB12"));
    expect(res.status).toBe(200);
    expect((await res.json()).junta.code).toBe("BARRIO-AB12");
  });
});

describe("POST /api/juntas/[code]/join", () => {
  it("sin sesión y sin teléfono → 400 (pide su WhatsApp)", async () => {
    vi.mocked(customerPhoneFromReq).mockResolvedValue(null);
    const res = await JOIN(guestReq(null), params("BARRIO-AB12"));
    expect(res.status).toBe(400);
  });

  it("sin sesión con WhatsApp de invitado válido → 200", async () => {
    vi.mocked(customerPhoneFromReq).mockResolvedValue(null);
    vi.mocked(JuntasDB.join).mockResolvedValue({
      code: "BARRIO-AB12",
      memberCount: 2,
      status: "OPEN",
    } as never);
    const res = await JOIN(guestReq({ phone: "999888777" }), params("BARRIO-AB12"));
    expect(res.status).toBe(200);
    expect(JuntasDB.join).toHaveBeenCalledWith("t1", "BARRIO-AB12", "999888777");
  });

  it("sin sesión con número inválido → 400", async () => {
    vi.mocked(customerPhoneFromReq).mockResolvedValue(null);
    const res = await JOIN(guestReq({ phone: "123" }), params("BARRIO-AB12"));
    expect(res.status).toBe(400);
  });

  it("OK → 200 con progreso actualizado", async () => {
    vi.mocked(JuntasDB.join).mockResolvedValue({
      code: "BARRIO-AB12",
      memberCount: 2,
      status: "OPEN",
    } as never);
    const res = await JOIN(req, params("BARRIO-AB12"));
    expect(res.status).toBe(200);
    expect(JuntasDB.join).toHaveBeenCalledWith("t1", "BARRIO-AB12", "999888777");
  });

  it("junta vencida → 400", async () => {
    vi.mocked(JuntasDB.join).mockRejectedValue(new Error("La junta ya venció"));
    const res = await JOIN(req, params("BARRIO-AB12"));
    expect(res.status).toBe(400);
  });

  it("junta inexistente → 404", async () => {
    vi.mocked(JuntasDB.join).mockRejectedValue(new Error("Junta no encontrada"));
    const res = await JOIN(req, params("BARRIO-XXXX"));
    expect(res.status).toBe(404);
  });
});
