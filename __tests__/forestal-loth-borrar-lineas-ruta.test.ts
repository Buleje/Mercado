/**
 * POST /api/admin/forestal/loth/borrar-lineas (Brandon 07-10-2026: borrar lo
 * elegido en «Secciones» por permiso o titular).
 *
 * `requireAdmin` REAL (sólo se simula el JWT): sin sesión 401, encargado y
 * cajero 403. El negocio sale de la sesión; `?vista=1` es la vista previa
 * (`simular`), nunca escribe; ids vacíos o demasiados → 400; ninguno del
 * negocio → 404.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  borrar: vi.fn(),
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
vi.mock("@/lib/db/forest-loth.db", async (real) => ({
  ...(await real<typeof import("@/lib/db/forest-loth.db")>()),
  ForestLothDB: { softDeleteLineas: (...a: unknown[]) => H.borrar(...a) },
}));

import { POST } from "@/app/api/admin/forestal/loth/borrar-lineas/route";
import { LothInvariantError } from "@/lib/db/forest-loth.db";

const post = (body: unknown, qs = "") =>
  POST(new NextRequest(`http://localhost/api/admin/forestal/loth/borrar-lineas${qs}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "buleje-admin-sess=token-falso" },
    body: JSON.stringify(body),
  }));
const RES = { simulado: false, pedidas: 2, ignoradas: 0, agregadas: 0, borradas: 2, m3: 3, porSeccion: [], porPlan: [], saltadas: [], arbolesLiberados: 0 };

beforeEach(() => {
  H.payload = { username: "qa-admin", role: "admin", tenantId: "t1" };
  H.borrar.mockReset().mockResolvedValue(RES);
});

describe("POST /loth/borrar-lineas", () => {
  it("borra con el negocio del JWT, no el del cuerpo", async () => {
    const r = await post({ ids: ["a", "b"], tenantId: "otro" });
    expect(r.status).toBe(200);
    expect(H.borrar).toHaveBeenCalledWith("t1", ["a", "b"], "qa-admin", { simular: false, incluirLoQueCuelga: false });
  });

  it("?vista=1 es la vista previa: simular, nunca escribe", async () => {
    H.borrar.mockResolvedValue({ ...RES, simulado: true });
    const r = await post({ ids: ["a"], incluirLoQueCuelga: true }, "?vista=1");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ simulado: true });
    expect(H.borrar).toHaveBeenCalledWith("t1", ["a"], "qa-admin", { simular: true, incluirLoQueCuelga: true });
  });

  it("ids vacíos, de más o mal formados → 400 sin tocar nada", async () => {
    const muchos = Array.from({ length: 5001 }, (_, i) => `id${i}`);
    for (const body of [{ ids: [] }, { ids: muchos }, { ids: "a" }, {}, null]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(H.borrar).not.toHaveBeenCalled();
  });

  it("ninguno es de este negocio → 404", async () => {
    H.borrar.mockResolvedValue({ ...RES, pedidas: 2, ignoradas: 2, borradas: 0 });
    H.payload = { username: "x", role: "owner", tenantId: "t2" };
    const r = await post({ ids: ["de-t1", "otra-de-t1"] });
    expect(r.status).toBe(404);
    expect(H.borrar).toHaveBeenCalledWith("t2", ["de-t1", "otra-de-t1"], "x", expect.anything());
  });

  it("sin sesión 401; encargado y cajero 403", async () => {
    H.payload = null;
    expect((await post({ ids: ["a"] })).status).toBe(401);
    for (const role of ["almacenero", "cajero"]) {
      H.payload = { username: "x", role, tenantId: "t1" };
      expect((await post({ ids: ["a"] })).status).toBe(403);
      expect((await post({ ids: ["a"] }, "?vista=1")).status).toBe(403);
    }
    expect(H.borrar).not.toHaveBeenCalled();
  });

  it("un invariante del libro llega como 422 con su mensaje", async () => {
    H.borrar.mockRejectedValue(new LothInvariantError("Elige al menos una línea para borrar.", "SIN_SECCIONES", {}));
    const r = await post({ ids: ["a"] });
    expect(r.status).toBe(422);
  });
});
