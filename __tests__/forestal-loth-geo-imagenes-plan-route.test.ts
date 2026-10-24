/** ADR-462: geografía e imágenes validan el `planId` (400 si malformado, 404 si ajeno o dado de baja) antes de tocar caché o internet. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  ctx: vi.fn(),
  geo: vi.fn(),
  img: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => H.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: { getPlan: async (t: string, id: string) => (t === "t1" && id === "A" ? { id } : null) },
}));
vi.mock("@/lib/forestal/loth-geografia-servidor", () => ({ contextoDelPlan: H.ctx, obtenerGeografia: H.geo }));
vi.mock("@/lib/forestal/loth-imagenes-servidor", () => ({ obtenerImagenes: H.img }));

import { GET as GEO } from "@/app/api/admin/forestal/loth/geografia/route";
import { GET as IMG } from "@/app/api/admin/forestal/loth/imagenes/route";

const hdr = { cookie: "buleje-admin-sess=token-falso" };
const pedir = (GET: typeof GEO, ruta: string, qs: string) => GET(new NextRequest(`http://localhost/api/admin/forestal/loth/${ruta}${qs}`, { headers: hdr }));

beforeEach(() => {
  vi.clearAllMocks();
  H.payload = { username: "qa-admin", role: "admin", tenantId: "t1" };
  H.ctx.mockResolvedValue({ planId: "A", contorno: [], contornoEs: "parcela", arboles: [] });
  H.geo.mockResolvedValue({ ok: false, motivo: "x" });
  H.img.mockResolvedValue({ ok: false, motivo: "x" });
});

describe.each([
  ["geografia", GEO],
  ["imagenes", IMG],
] as const)("GET /loth/%s con planId", (ruta, GET) => {
  it("formato malo (a.b) → 400 y no toca nada", async () => {
    expect((await pedir(GET, ruta, "?planId=a.b")).status).toBe(400);
    expect(H.ctx).not.toHaveBeenCalled();
  });

  it("plan ajeno o dado de baja → 404 plan_not_found, sin caché ni internet", async () => {
    const r = await pedir(GET, ruta, "?planId=Z");
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("plan_not_found");
    expect(H.ctx).not.toHaveBeenCalled();
    expect(H.geo).not.toHaveBeenCalled();
    expect(H.img).not.toHaveBeenCalled();
  });

  it("plan propio → sigue (422 de zona vacía simulada, no 404)", async () => {
    expect((await pedir(GET, ruta, "?planId=A")).status).toBe(422);
    expect(H.ctx).toHaveBeenCalledWith("t1", "A");
  });
});
