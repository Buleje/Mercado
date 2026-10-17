/**
 * GET/POST /api/admin/forestal/loth/borrar-del-plan (Brandon 07-10-2026:
 * «eliminar todas las operaciones de ese plan, sea tala, trozado, despacho»).
 *
 * `requireAdmin` REAL (sólo se simula el JWT): sin sesión 401, encargado y
 * cajero 403. El negocio sale SIEMPRE de la sesión, nunca del cuerpo; un plan
 * de otro negocio → 404 sin contar ni borrar; secciones vacías o inventadas → 400.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  contar: vi.fn(),
  borrar: vi.fn(),
  getPlan: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/forest-plan.db", () => ({ ForestPlanDB: { getPlan: (...a: unknown[]) => H.getPlan(...a) } }));
vi.mock("@/lib/db/forest-loth.db", async (real) => ({
  ...(await real<typeof import("@/lib/db/forest-loth.db")>()),
  ForestLothDB: {
    contarDelPlan: (...a: unknown[]) => H.contar(...a),
    softDeleteDelPlan: (...a: unknown[]) => H.borrar(...a),
  },
}));

import { GET, POST } from "@/app/api/admin/forestal/loth/borrar-del-plan/route";
import { GuiaYaEnElCtpError } from "@/lib/db/gtf-numero.db";

const URL_BASE = "http://localhost/api/admin/forestal/loth/borrar-del-plan";
const SESION = { cookie: "buleje-admin-sess=token-falso" };
const post = (body: unknown) =>
  POST(new NextRequest(URL_BASE, { method: "POST", headers: { "content-type": "application/json", ...SESION }, body: JSON.stringify(body) }));
const get = (qs: string) => GET(new NextRequest(`${URL_BASE}${qs}`, { headers: SESION }));

beforeEach(() => {
  H.payload = { username: "qa-admin", role: "admin", tenantId: "t1" };
  H.contar.mockReset().mockResolvedValue({ planId: "P1", total: 3, m3: 4.5, secciones: [] });
  H.borrar.mockReset().mockResolvedValue({ planId: "P1", borradas: 3, m3: 4.5, porSeccion: [], saltadas: [], arbolesLiberados: 1 });
  H.getPlan.mockReset().mockImplementation(async (tenantId: string, id: string) => (tenantId === "t1" && id === "P1" ? { id } : null));
});

describe("GET (el conteo antes de borrar)", () => {
  it("cuenta con el negocio de la sesión", async () => {
    const r = await get("?planId=P1&tenantId=otro");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ total: 3 });
    expect(H.contar).toHaveBeenCalledWith("t1", "P1");
  });

  it("sin planId o con uno raro → 400", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?planId=a%27%3B--")).status).toBe(400);
    expect(H.contar).not.toHaveBeenCalled();
  });

  it("plan de otro negocio → 404 y no cuenta", async () => {
    H.payload = { username: "x", role: "admin", tenantId: "t2" };
    expect((await get("?planId=P1")).status).toBe(404);
    expect(H.getPlan).toHaveBeenCalledWith("t2", "P1");
    expect(H.contar).not.toHaveBeenCalled();
  });
});

describe("POST (borrar)", () => {
  it("borra con el negocio del JWT, no el del cuerpo", async () => {
    const r = await post({ planId: "P1", secciones: ["tala", "trozado", "despacho_troza"], tenantId: "otro" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ borradas: 3, arbolesLiberados: 1 });
    expect(H.borrar).toHaveBeenCalledWith("t1", "P1", ["tala", "trozado", "despacho_troza"], "qa-admin");
  });

  it("secciones vacías, inventadas o sin plan → 400 sin borrar", async () => {
    for (const body of [{ planId: "P1", secciones: [] }, { planId: "P1", secciones: ["censo"] }, { secciones: ["tala"] }, null]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(H.borrar).not.toHaveBeenCalled();
  });

  it("plan de otro negocio → 404 sin borrar", async () => {
    H.payload = { username: "x", role: "owner", tenantId: "t2" };
    expect((await post({ planId: "P1", secciones: ["tala"] })).status).toBe(404);
    expect(H.borrar).not.toHaveBeenCalled();
  });

  it("sin sesión 401; encargado y cajero 403", async () => {
    H.payload = null;
    expect((await post({ planId: "P1", secciones: ["tala"] })).status).toBe(401);
    for (const role of ["almacenero", "cajero"]) {
      H.payload = { username: "x", role, tenantId: "t1" };
      expect((await post({ planId: "P1", secciones: ["tala"] })).status).toBe(403);
      expect((await get("?planId=P1")).status).toBe(403);
    }
    expect(H.borrar).not.toHaveBeenCalled();
    expect(H.contar).not.toHaveBeenCalled();
  });

  it("un invariante del libro llega con su código, no como 500", async () => {
    H.borrar.mockRejectedValue(new GuiaYaEnElCtpError("La guía ya entró", [12]));
    const r = await post({ planId: "P1", secciones: ["despacho_troza"] });
    expect(r.status).toBe(409);
  });
});
