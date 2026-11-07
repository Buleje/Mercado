/** ADR-462: el área por permiso — claves, lectura por alcance, validación del plan y «copiar» sin pisar. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  kv: {} as Record<string, unknown>,
  payload: null as null | { username: string; role: string; tenantId: string },
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/forestal/loth-audit", () => ({ auditLoth: vi.fn() }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => H.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: {
    getPlan: async (t: string, id: string) => (t === "t1" && (id === "A" || id === "B") ? { id } : null),
    // Como la DB real: `deletedAt: null` — el plan «D» está dado de baja y no sale.
    listPlans: async () => [{ id: "A", deletedAt: null }, { id: "B", deletedAt: null }, { id: "C", deletedAt: null }, { id: "D", deletedAt: new Date() }].filter((p) => p.deletedAt === null),
  },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  PlatformSettingsDB: {
    get: async (k: string) => H.kv[k] ?? null,
    set: async (k: string, v: unknown) => {
      H.kv[k] = JSON.parse(JSON.stringify(v));
    },
    actualizar: async (k: string, cambio: (a: unknown) => { valor?: unknown; resultado: unknown }) => {
      const r = cambio(H.kv[k] ?? null);
      if (r.valor !== undefined) H.kv[k] = JSON.parse(JSON.stringify(r.valor));
      return r.resultado;
    },
  },
}));

import { GET, PUT } from "@/app/api/admin/forestal/loth/parcela/route";
import { POST } from "@/app/api/admin/forestal/loth/parcela/copiar/route";

const URL_BASE = "http://localhost/api/admin/forestal/loth/parcela";
const hdr = { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json" };
const get = (qs = "") => GET(new NextRequest(`${URL_BASE}${qs}`, { headers: hdr }));
const put = (b: unknown) => PUT(new NextRequest(URL_BASE, { method: "PUT", headers: hdr, body: JSON.stringify(b) }));
const copiar = (b: unknown) => POST(new NextRequest(`${URL_BASE}/copiar`, { method: "POST", headers: hdr, body: JSON.stringify(b) }));

const tri = (o: number): [number, number][] => [[-9.8 + o, -74.8], [-9.8 + o, -74.79], [-9.79 + o, -74.79]];

beforeEach(() => {
  H.kv = {};
  H.payload = { username: "qa-admin", role: "admin", tenantId: "t1" };
});

describe("PUT /loth/parcela", () => {
  it("sin planId escribe la clave vieja; con planId, la del plan", async () => {
    expect((await put({ vertices: tri(0) })).status).toBe(200);
    expect((await put({ vertices: tri(1), planId: "A" })).status).toBe(200);
    expect(Object.keys(H.kv).sort()).toEqual(["loth-parcela:t1", "loth-parcela:t1:A"]);
  });

  it("plan ajeno o inexistente → 404 plan_not_found y no escribe", async () => {
    const r = await put({ vertices: tri(0), planId: "Z" });
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("plan_not_found");
    expect(H.kv).toEqual({});
  });

  it("un planId con formato malo es 400", async () => {
    expect((await put({ vertices: tri(0), planId: "a:b" })).status).toBe(400);
  });
});

describe("GET /loth/parcela", () => {
  beforeEach(async () => {
    await put({ vertices: tri(0) });
    await put({ vertices: tri(1), planId: "A" });
  });

  it("sin query: la del negocio, forma de siempre", async () => {
    const j = await (await get()).json();
    expect(j.parcela.vertices[0][0]).toBeCloseTo(-9.8);
    expect(j.heredada).toBe(false);
    expect(j.porPermiso).toEqual([]);
  });

  it("solo=1: la del plan, vacía si no tiene, sin heredar", async () => {
    expect((await (await get("?planId=A&solo=1")).json()).parcela.vertices[0][0]).toBeCloseTo(-8.8);
    const b = await (await get("?planId=B&solo=1")).json();
    expect(b.parcela.vertices).toEqual([]);
    expect(b.heredada).toBe(false);
  });

  it("sin solo: el plan sin área hereda la del negocio (heredada:true)", async () => {
    const b = await (await get("?planId=B")).json();
    expect(b.heredada).toBe(true);
    expect(b.parcela.vertices[0][0]).toBeCloseTo(-9.8);
    expect((await (await get("?planId=A")).json()).heredada).toBe(false);
  });

  it("sin-plan: la del negocio", async () => {
    expect((await (await get("?planId=sin-plan")).json()).parcela.vertices[0][0]).toBeCloseTo(-9.8);
  });

  it("todos=1: la del negocio + sólo los planes vivos con área", async () => {
    H.kv["loth-parcela:t1:D"] = H.kv["loth-parcela:t1:A"]; // área huérfana de un plan dado de baja
    const j = await (await get("?todos=1")).json();
    expect(j.porPermiso.map((x: { planId: string }) => x.planId)).toEqual(["A"]);
    expect(j.parcela.vertices).toHaveLength(3);
  });
});

describe("POST /loth/parcela/copiar", () => {
  it("copia el área del negocio al plan (201) y NO la pisa la segunda vez (409)", async () => {
    await put({ vertices: tri(0) });
    const r = await copiar({ planId: "A" });
    expect(r.status).toBe(201);
    expect((H.kv["loth-parcela:t1:A"] as { vertices: unknown[] }).vertices).toHaveLength(3);
    await put({ vertices: tri(2), planId: "A" });
    const antes = JSON.stringify(H.kv["loth-parcela:t1:A"]);
    const r2 = await copiar({ planId: "A" });
    expect(r2.status).toBe(409);
    expect((await r2.json()).error).toBe("ya_tiene_area");
    expect(JSON.stringify(H.kv["loth-parcela:t1:A"])).toBe(antes);
  });

  it("negocio sin área → 404 sin_area_del_negocio; plan ajeno → 404 plan_not_found", async () => {
    const r = await copiar({ planId: "A" });
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("sin_area_del_negocio");
    const z = await copiar({ planId: "Z" });
    expect(z.status).toBe(404);
    expect((await z.json()).error).toBe("plan_not_found");
  });

  it("el almacenero no copia (403)", async () => {
    H.payload = { username: "qa-alm", role: "almacenero", tenantId: "t1" };
    expect((await copiar({ planId: "A" })).status).toBe(403);
  });
});
