/**
 * POST/GET /api/admin/forestal/loth/atar-plan (ADR-459, 02-10-2026).
 *
 * `requireAdmin` REAL (sólo se simula el JWT): sin sesión 401, cajero 403 y
 * ENCARGADO 403 en el POST (requireAdmin lo deja pasar; el saldo de un permiso
 * lo cambia sólo admin/dueño). El tenant es SIEMPRE el de la sesión. Body mal
 * formado → 400; plan ajeno/de baja → 422 `PLAN_NO_EXISTE`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  atar: vi.fn(),
  conteo: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/forest-loth.db", async (real) => ({
  ...(await real<typeof import("@/lib/db/forest-loth.db")>()),
  ForestLothDB: { atarSinPlan: (...a: unknown[]) => H.atar(...a), conteoAtarSinPlan: (...a: unknown[]) => H.conteo(...a) },
}));

import { GET, POST } from "@/app/api/admin/forestal/loth/atar-plan/route";
import { LothInvariantError } from "@/lib/db/forest-loth.db";

const URL_BASE = "http://localhost/api/admin/forestal/loth/atar-plan";
const post = (body: unknown, conSesion = true) =>
  POST(new NextRequest(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json", ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const get = (q = "", conSesion = true) =>
  GET(new NextRequest(`${URL_BASE}${q}`, { headers: conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {} }));
const como = (role: string, tenantId = "t-main") => { H.payload = { username: `qa-${role}`, role, tenantId }; };

beforeEach(() => {
  H.payload = null;
  H.atar.mockReset().mockResolvedValue({ simulado: false, planId: "p1", total: 2, atadas: 2, porSeccion: [], cerradas: { n: 0, periodos: [] }, fueraDelRegistro: { n: 0, especies: [] } });
  H.conteo.mockReset().mockResolvedValue({ total: 2, cerradas: 0 });
});

describe("atar-plan · permisos", () => {
  it("sin sesión → 401 (GET y POST) y no lee ni escribe", async () => {
    expect((await get("", false)).status).toBe(401);
    expect((await post({ planId: "p1" }, false)).status).toBe(401);
    expect(H.atar).not.toHaveBeenCalled();
    expect(H.conteo).not.toHaveBeenCalled();
  });
  it("cajero → 403 en el POST", async () => {
    como("cajero");
    expect((await post({ planId: "p1" })).status).toBe(403);
    expect(H.atar).not.toHaveBeenCalled();
  });
  it("encargado (almacenero) → 403 en el POST, pero ve el conteo", async () => {
    como("almacenero");
    expect((await post({ planId: "p1" })).status).toBe(403);
    expect(H.atar).not.toHaveBeenCalled();
    const r = await get();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ total: 2, cerradas: 0 });
  });
});

describe("atar-plan · contrato", () => {
  it("el tenant y el actor salen de la sesión, no del pedido", async () => {
    como("admin", "t-de-la-sesion");
    const r = await POST(new NextRequest(URL_BASE, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "buleje-admin-sess=x", "x-tenant-id": "otro-negocio" },
      body: JSON.stringify({ planId: "p1", tenantId: "otro-negocio" }),
    }));
    expect(r.status).toBe(200);
    expect(H.atar).toHaveBeenCalledWith("t-de-la-sesion", "p1", "qa-admin");
  });
  it("body inválido → 400 con mensaje; JSON roto → 400; planId raro → 400", async () => {
    como("owner");
    for (const b of [{}, { planId: "" }, { planId: "a/../b" }, { planId: "x".repeat(65) }]) {
      const r = await post(b);
      expect(r.status).toBe(400);
      expect((await r.json()).message).toBeTruthy();
    }
    expect((await post("{no-json")).status).toBe(400);
    expect(H.atar).not.toHaveBeenCalled();
  });
  it("GET ?planId = vista previa (simular), sin escribir", async () => {
    como("admin");
    await get("?planId=p1");
    expect(H.atar).toHaveBeenCalledWith("t-main", "p1", "qa-admin", { simular: true });
  });
  it("plan ajeno o de baja → 422 PLAN_NO_EXISTE", async () => {
    como("admin");
    H.atar.mockRejectedValue(new LothInvariantError("no existe", "PLAN_NO_EXISTE", { planId: "ajeno" }));
    const r = await post({ planId: "ajeno" });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toBe("PLAN_NO_EXISTE");
  });
});
