/**
 * F10 «Lo que debo» — GET /api/finanzas/por-pagar.
 *
 * Corre el `requireAdmin` REAL (sólo se simula el JWT), como sus hermanas de
 * `app/api/finanzas/**`: el 403 del cajero y del almacenero sale de la misma
 * regla que en producción. Y el tenant es el de la sesión aunque el header diga
 * otro.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  detalle: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/por-pagar.db", () => ({ PorPagarDB: { getDetalle: (...a: unknown[]) => H.detalle(...a) } }));

import { GET } from "@/app/api/finanzas/por-pagar/route";

const pedir = (ruta: string, conSesion = true, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${ruta}`, {
    headers: { ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}), ...headers },
  });

const como = (role: string, tenantId = "t1") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

const DETALLE = {
  hoy: "2026-09-29",
  totales: [{ moneda: "PEN", total: 6279.6, cuentas: 3, partidas: 3, vencido: 0, cruzable: 0 }],
  porFuente: [{ fuente: "cuenta_forestal", moneda: "PEN", total: 6279.6, count: 3 }],
  personas: [{ clave: "parte:a" }, { clave: "parte:b" }, { clave: "parte:c" }],
  truncado: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  como("admin");
  H.detalle.mockResolvedValue(DETALLE);
});

describe("GET /api/finanzas/por-pagar", () => {
  it("sin sesión → 401 (nunca 404: un 404 saca del panel)", async () => {
    expect((await GET(pedir("/api/finanzas/por-pagar", false))).status).toBe(401);
    expect(H.detalle).not.toHaveBeenCalled();
  });

  it.each(["almacenero", "cajero", "manager"])("%s → 403 sin tocar la base", async (rol) => {
    como(rol);
    expect((await GET(pedir("/api/finanzas/por-pagar"))).status).toBe(403);
    expect(H.detalle).not.toHaveBeenCalled();
  });

  it.each(["admin", "owner"])("%s → 200 con el detalle", async (rol) => {
    como(rol);
    const r = await GET(pedir("/api/finanzas/por-pagar"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(DETALLE);
  });

  it("el tenant es el de la SESIÓN aunque el header o la URL pidan otro", async () => {
    como("admin", "tenant-de-la-sesion");
    await GET(pedir("/api/finanzas/por-pagar?tenantId=ajeno", true, { "x-tenant-id": "ajeno", "x-tenant-slug": "ajeno" }));
    expect(H.detalle).toHaveBeenCalledTimes(1);
    expect(H.detalle.mock.calls[0][0]).toBe("tenant-de-la-sesion");
    expect(H.detalle.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("?resumen=1 → sólo totales y cuántos acreedores", async () => {
    const r = await GET(pedir("/api/finanzas/por-pagar?resumen=1"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ hoy: "2026-09-29", totales: DETALLE.totales, porFuente: DETALLE.porFuente, truncado: false, cuentas: 3 });
  });

  it("un parámetro inválido → 400 con el motivo; vacío = no mandado", async () => {
    const r = await GET(pedir("/api/finanzas/por-pagar?resumen=si"));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("resumen va 0 o 1");
    expect((await GET(pedir("/api/finanzas/por-pagar?resumen="))).status).toBe(200);
  });

  it("si la base falla → 500 en español, sin detalles internos", async () => {
    H.detalle.mockRejectedValueOnce(new Error("P1001 connection refused"));
    const r = await GET(pedir("/api/finanzas/por-pagar"));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "No se pudo armar lo que debes" });
  });
});
