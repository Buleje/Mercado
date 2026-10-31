/**
 * GET /api/admin/forestal/gtf con el filtro por permiso del Libro TH (02-10-2026).
 * Corre el `requireAdmin` REAL; el plan de otro negocio → 404 sin leer las guías.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  list: vi.fn(),
  listBajas: vi.fn(),
  getPlan: vi.fn(),
  create: vi.fn(),
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
vi.mock("@/lib/db/forest-gtf.db", async (real) => ({
  ...(await real<typeof import("@/lib/db/forest-gtf.db")>()),
  ForestGtfDB: {
    list: (...a: unknown[]) => H.list(...a),
    listBajas: (...a: unknown[]) => H.listBajas(...a),
    create: (...a: unknown[]) => H.create(...a),
  },
}));
vi.mock("@/lib/db/guia-th-al-ctp.db", () => ({ GuiaThAlCtpDB: {} }));
vi.mock("@/lib/db/forest-plan.db", () => ({ ForestPlanDB: { getPlan: (...a: unknown[]) => H.getPlan(...a) } }));

import { GET, POST } from "@/app/api/admin/forestal/gtf/route";

import { dondeDelPermiso } from "@/lib/db/forest-gtf.db";

const PO12 = "cmpq6yhdu000073vzx1khmlap";
const pedir = (q: string) =>
  GET(new NextRequest(`http://localhost/api/admin/forestal/gtf${q}`, { headers: { cookie: "buleje-admin-sess=token-falso" } }));
const como = (tenantId: string) => {
  H.payload = { username: "qa-admin", role: "admin", tenantId };
};

beforeEach(() => {
  H.payload = null;
  H.list.mockReset().mockResolvedValue([{ id: "g1", gtfNumber: "019-001-1" }]);
  H.listBajas.mockReset().mockResolvedValue([{ id: "g9", gtfNumber: "019-001-9", status: "anulada" }]);
  H.create.mockReset().mockResolvedValue({ id: "nueva" });
  H.getPlan.mockReset().mockImplementation(async (t: string, id: string) => (t === "t-main" && id === PO12 ? { id: PO12 } : null));
});

describe("GET /api/admin/forestal/gtf — filtra por permiso", () => {
  it("plan propio + solo=1 → la base recibe el filtro con el tenant de la sesión", async () => {
    como("t-main");
    const r = await pedir(`?planId=${PO12}&solo=1`);
    expect(r.status).toBe(200);
    expect(H.getPlan).toHaveBeenCalledWith("t-main", PO12);
    expect(H.list).toHaveBeenCalledWith("t-main", { tipo: "plan", planId: PO12, conSinPlan: false });
  });

  it("plan de OTRO negocio → 404 y no se leen las guías", async () => {
    como("t-blas");
    const r = await pedir(`?planId=${PO12}&solo=1`);
    expect(r.status).toBe(404);
    expect(H.list).not.toHaveBeenCalled();
  });

  it("sin-plan → guías sin plan; sin query → todas", async () => {
    como("t-main");
    await pedir("?planId=sin-plan");
    expect(H.list).toHaveBeenLastCalledWith("t-main", { tipo: "sin-plan" });
    await pedir("");
    expect(H.list).toHaveBeenLastCalledWith("t-main", null);
  });

  it("planId mal formado → 400", async () => {
    como("t-main");
    const r = await pedir(`?planId=${encodeURIComponent("x' OR '1'='1")}`);
    expect(r.status).toBe(400);
    expect(H.list).not.toHaveBeenCalled();
  });
});

describe("GET ?estado=bajas — anuladas y borradas (Libro TH 07-10)", () => {
  it("lee las bajas con el tenant de la sesión y el mismo filtro de permiso; no la lista de vigentes", async () => {
    como("t-main");
    const r = await pedir(`?estado=bajas&planId=${PO12}&solo=1`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ gtfs: [{ id: "g9", gtfNumber: "019-001-9", status: "anulada" }] });
    expect(H.listBajas).toHaveBeenCalledWith("t-main", { tipo: "plan", planId: PO12, conSinPlan: false });
    expect(H.list).not.toHaveBeenCalled();
  });

  it("plan de OTRO negocio → 404 y no se leen las bajas; sin sesión → 401", async () => {
    como("t-blas");
    expect((await pedir(`?estado=bajas&planId=${PO12}&solo=1`)).status).toBe(404);
    expect(H.listBajas).not.toHaveBeenCalled();
    H.payload = null;
    expect((await pedir("?estado=bajas")).status).toBe(401);
  });
});

describe("dondeDelPermiso — el where del filtro de la base", () => {
  it("sin filtro → sólo tenant y vivas", () => {
    expect(dondeDelPermiso("t1", null)).toEqual({ tenantId: "t1", deletedAt: null });
  });
  it("plan → sólo sus guías", () => {
    expect(dondeDelPermiso("t1", { tipo: "plan", planId: "p1", conSinPlan: false })).toEqual({ tenantId: "t1", deletedAt: null, planId: "p1" });
  });
  it("sin-plan → planId null", () => {
    expect(dondeDelPermiso("t1", { tipo: "sin-plan" })).toEqual({ tenantId: "t1", deletedAt: null, planId: null });
  });
  it("plan + conSinPlan → ambas", () => {
    expect(dondeDelPermiso("t1", { tipo: "plan", planId: "p1", conSinPlan: true })).toEqual({
      tenantId: "t1",
      deletedAt: null,
      OR: [{ planId: "p1" }, { planId: null }],
    });
  });
});

describe("POST /api/admin/forestal/gtf — planId", () => {
  const cuerpo = (planId?: string) => ({
    ...(planId ? { planId } : {}),
    gtfNumber: "019-001-77",
    transportista: "Transportes SAC",
    conductor: "Juan Perez",
    placaVehiculo: "V2H-901",
    items: [{ species: "Tornillo", volumeM3: 1 }],
  });
  const enviar = (b: unknown) =>
    POST(
      new NextRequest("http://localhost/api/admin/forestal/gtf", {
        method: "POST",
        headers: { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json" },
        body: JSON.stringify(b),
      }),
    );

  it("planId de OTRO negocio → 404 y no se guarda", async () => {
    como("t-blas");
    const r = await enviar(cuerpo(PO12));
    expect(r.status).toBe(404);
    expect(H.getPlan).toHaveBeenCalledWith("t-blas", PO12);
    expect(H.create).not.toHaveBeenCalled();
  });
  it("planId propio → se guarda; sin planId → se guarda como hoy", async () => {
    como("t-main");
    expect((await enviar(cuerpo(PO12))).status).toBe(201);
    expect((await enviar(cuerpo())).status).toBe(201);
    expect(H.create).toHaveBeenCalledTimes(2);
  });
});
