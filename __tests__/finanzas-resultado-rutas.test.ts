/**
 * ADR-451 — las tres rutas del resultado y la caja del negocio.
 *
 * Corre el `requireAdmin` REAL (sólo se simula el JWT): el 403 del cajero y del
 * almacenero sale de la misma regla que en producción, no de un mock que lo
 * devuelve. Y el tenant es el de la sesión aunque el header o la URL digan otro.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string; jti?: string },
  resultado: vi.fn(),
  detalle: vi.fn(),
  caja: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/resultado-negocio.db", () => ({
  ResultadoNegocioDB: {
    resultado: (...a: unknown[]) => H.resultado(...a),
    detalle: (...a: unknown[]) => H.detalle(...a),
    caja: (...a: unknown[]) => H.caja(...a),
  },
  hoyDeLima: () => ({ hoy: "2026-09-29", mes: "2026-09" }),
}));

import { GET as GET_RESULTADO } from "@/app/api/finanzas/resultado/route";
import { GET as GET_DETALLE } from "@/app/api/finanzas/resultado/detalle/route";
import { GET as GET_CAJA } from "@/app/api/finanzas/caja-del-negocio/route";

const pedir = (ruta: string, conSesion = true, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${ruta}`, {
    headers: { ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}), ...headers },
  });

const como = (role: string, tenantId = "t1") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

beforeEach(() => {
  vi.clearAllMocks();
  como("admin");
  H.resultado.mockResolvedValue({ actual: {}, serie: [], generadoEn: "x" });
  H.detalle.mockResolvedValue({ mes: "2026-09", fuente: "aserrio", filas: [], total: 0 });
  H.caja.mockResolvedValue({ caja: {}, viene: {}, generadoEn: "x" });
});

describe("permisos", () => {
  it("sin sesión → 401 en las tres", async () => {
    for (const r of [
      await GET_RESULTADO(pedir("/api/finanzas/resultado", false)),
      await GET_DETALLE(pedir("/api/finanzas/resultado/detalle?fuente=aserrio", false)),
      await GET_CAJA(pedir("/api/finanzas/caja-del-negocio", false)),
    ]) expect(r.status).toBe(401);
  });

  it.each(["almacenero", "cajero"])("%s → 403 en las tres, sin tocar la base", async (rol) => {
    como(rol);
    expect((await GET_RESULTADO(pedir("/api/finanzas/resultado"))).status).toBe(403);
    expect((await GET_DETALLE(pedir("/api/finanzas/resultado/detalle?fuente=aserrio"))).status).toBe(403);
    expect((await GET_CAJA(pedir("/api/finanzas/caja-del-negocio"))).status).toBe(403);
    expect(H.resultado).not.toHaveBeenCalled();
    expect(H.detalle).not.toHaveBeenCalled();
    expect(H.caja).not.toHaveBeenCalled();
  });

  it("manager → 403 en las tres (ADR-451: sólo admin o dueño, como Liquidar)", async () => {
    como("manager");
    expect((await GET_RESULTADO(pedir("/api/finanzas/resultado"))).status).toBe(403);
    expect((await GET_DETALLE(pedir("/api/finanzas/resultado/detalle?fuente=planilla"))).status).toBe(403);
    expect((await GET_CAJA(pedir("/api/finanzas/caja-del-negocio"))).status).toBe(403);
    expect(H.resultado).not.toHaveBeenCalled();
    expect(H.detalle).not.toHaveBeenCalled();
    expect(H.caja).not.toHaveBeenCalled();
  });

  it.each(["admin", "owner"])("%s → 200", async (rol) => {
    como(rol);
    expect((await GET_RESULTADO(pedir("/api/finanzas/resultado"))).status).toBe(200);
    expect((await GET_CAJA(pedir("/api/finanzas/caja-del-negocio"))).status).toBe(200);
  });
});

describe("parámetros (Zod safeParse)", () => {
  it.each([
    "/api/finanzas/resultado?mes=2026-13",
    "/api/finanzas/resultado?mes=setiembre",
    "/api/finanzas/resultado?meses=0",
    "/api/finanzas/resultado?meses=13",
    "/api/finanzas/resultado?meses=2.5",
    "/api/finanzas/resultado?mes=0050-01",
    "/api/finanzas/resultado?mes=1999-12",
  ])("%s → 400", async (ruta) => {
    const r = await GET_RESULTADO(pedir(ruta));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBeTruthy();
    expect(H.resultado).not.toHaveBeenCalled();
  });

  it("detalle: fuente desconocida o ausente → 400; caja: mes inválido → 400", async () => {
    expect((await GET_DETALLE(pedir("/api/finanzas/resultado/detalle?fuente=compras"))).status).toBe(400);
    expect((await GET_DETALLE(pedir("/api/finanzas/resultado/detalle?mes=2026-09"))).status).toBe(400);
    expect((await GET_CAJA(pedir("/api/finanzas/caja-del-negocio?mes=2026-9"))).status).toBe(400);
    expect((await GET_CAJA(pedir("/api/finanzas/caja-del-negocio?mes=0050-01"))).status).toBe(400);
    expect((await GET_DETALLE(pedir("/api/finanzas/resultado/detalle?mes=0050-01&fuente=planilla"))).status).toBe(400);
  });

  it("sin mes = el mes en curso de Lima; `meses=` vacío = 6", async () => {
    await GET_RESULTADO(pedir("/api/finanzas/resultado?meses="));
    expect(H.resultado).toHaveBeenCalledWith("t1", "2026-09", 6, "2026-09-29", { verPlanilla: true });
  });
});

describe("tenant de la sesión", () => {
  it("el header x-tenant-id y un ?tenantId= de otro negocio se ignoran", async () => {
    const h = { "x-tenant-id": "otro-negocio" };
    await GET_RESULTADO(pedir("/api/finanzas/resultado?mes=2026-10&meses=3&tenantId=otro-negocio", true, h));
    await GET_DETALLE(pedir("/api/finanzas/resultado/detalle?mes=2026-10&fuente=caja_sin_sumar&tenantId=otro-negocio", true, h));
    await GET_CAJA(pedir("/api/finanzas/caja-del-negocio?mes=2026-10&tenantId=otro-negocio", true, h));
    expect(H.resultado).toHaveBeenCalledWith("t1", "2026-10", 3, "2026-09-29", { verPlanilla: true });
    expect(H.detalle).toHaveBeenCalledWith("t1", "2026-10", "caja_sin_sumar", "2026-09-29", { verPlanilla: true });
    expect(H.caja).toHaveBeenCalledWith("t1", "2026-10", "2026-09-29", { verPlanilla: true });
  });
});
