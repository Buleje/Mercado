/**
 * GET /api/admin/forestal/loth/extraccion (ADR-454) — la vista «Extracción».
 *
 * Corre el `requireAdmin` REAL (sólo se simula el JWT): sin sesión 401, el
 * cajero 403, y el tenant es el de la sesión aunque el header diga otro.
 * Parámetros malos → 400 con el motivo; plan ajeno o inexistente → 404.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  extraccion: vi.fn(),
  spec: true,
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => H.spec }));
vi.mock("@/lib/db/forest-plan.db", () => ({
  ForestPlanDB: { extraccion: (...a: unknown[]) => H.extraccion(...a) },
}));

import { GET } from "@/app/api/admin/forestal/loth/extraccion/route";

const pedir = (query: string, conSesion = true, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/admin/forestal/loth/extraccion${query}`, {
    headers: { ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}), ...headers },
  });

const como = (role: string, tenantId = "t1") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

const RESPUESTA = { generadoEn: "2026-09-29T17:00:00.000Z", permisos: [], avisos: [] };

beforeEach(() => {
  H.payload = null;
  H.spec = true;
  H.extraccion.mockReset().mockResolvedValue(RESPUESTA);
});

describe("GET /api/admin/forestal/loth/extraccion", () => {
  it("sin sesión → 401, sin leer nada", async () => {
    const r = await GET(pedir("?planId=p1", false));
    expect(r.status).toBe(401);
    expect(H.extraccion).not.toHaveBeenCalled();
  });

  it("cajero → 403 (la vista es de admin, almacenero y dueño)", async () => {
    como("cajero");
    const r = await GET(pedir("?planId=p1"));
    expect(r.status).toBe(403);
    expect(H.extraccion).not.toHaveBeenCalled();
  });

  it("admin → 200 con el tenant de SU sesión aunque el header y la query digan otro", async () => {
    como("admin", "tenant-de-la-sesion");
    const r = await GET(pedir("?planId=p1&desde=2026-09-01&hasta=2026-09-29&tenantId=otro", true, { "x-tenant-id": "otro-negocio" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(RESPUESTA);
    expect(H.extraccion).toHaveBeenCalledWith("tenant-de-la-sesion", { planId: "p1", desde: "2026-09-01", hasta: "2026-09-29" });
  });

  it("almacenero → 200 en su negocio; con el header de OTRO negocio, 403 (requireAdmin real)", async () => {
    como("almacenero", "t-alm");
    const r = await GET(pedir("?contratoId=c1"));
    expect(r.status).toBe(200);
    expect(H.extraccion).toHaveBeenCalledWith("t-alm", { contratoId: "c1" });

    H.extraccion.mockClear();
    const cruzado = await GET(pedir("?contratoId=c1", true, { "x-tenant-id": "otro-negocio" }));
    expect(cruzado.status).toBe(403);
    expect(H.extraccion).not.toHaveBeenCalled();
  });

  it("sin filtros = todo el negocio; un parámetro vacío es «sin filtro», no un error", async () => {
    como("owner");
    const r = await GET(pedir("?planId=&desde="));
    expect(r.status).toBe(200);
    expect(H.extraccion).toHaveBeenCalledWith("t1", {});
  });

  it.each([
    ["?desde=2026-13-01", /no existe/],
    ["?hasta=29/09/2026", /AAAA-MM-DD/],
    ["?desde=2026-09-30&hasta=2026-09-01", /después/],
    ["?planId=p1&contratoId=c1", /no los dos/],
    ["?antDesde=2026-08-01", /dos fechas/],
    ["?antDesde=2026-08-31&antHasta=2026-08-01", /al revés/],
    [`?planId=${"x".repeat(65)}`, /.+/],
  ])("parámetros malos %s → 400 con el motivo", async (query, motivo) => {
    como("admin");
    const r = await GET(pedir(query));
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string; message: string };
    expect(body.error).toBe("validation_error");
    expect(body.message).toMatch(motivo);
    expect(H.extraccion).not.toHaveBeenCalled();
  });

  it("plan o permiso de otro negocio (la DB class devuelve null) → 404", async () => {
    como("admin");
    H.extraccion.mockResolvedValue(null);
    const r = await GET(pedir("?contratoId=ctr_ajeno"));
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toBe("not_found");
  });

  it("sin el Libro TH habilitado → 403", async () => {
    como("admin");
    H.spec = false;
    const r = await GET(pedir(""));
    expect(r.status).toBe(403);
    expect(H.extraccion).not.toHaveBeenCalled();
  });

  it("si la lectura falla → 500 sin filtrar el error", async () => {
    como("admin");
    H.extraccion.mockRejectedValue(new Error("P2021 tabla"));
    const r = await GET(pedir(""));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "internal_error" });
  });
});
