/**
 * F12 (2026-09-29) — GET /api/admin/por-cobrar.
 *
 * Corre el `requireAdmin` REAL (sólo se simula el JWT), como sus hermanas de
 * Mi Plata: es plata del negocio entero, así que sólo admin y dueño. El
 * almacenero entraba antes (sin ningún permiso de finanzas en la matriz) y el
 * encargado entra a `requireAdmin` por el management tier: lo corta el segundo
 * guard. El tenant es el de la sesión aunque el header diga otro.
 *
 * Y la regla del Resumen: `?resumen=1` devuelve los `totales` de la MISMA
 * función que el detalle — la cifra «Te deben» del Resumen no puede ser otra
 * que la de la sección.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  detalle: vi.fn(),
  summary: vi.fn(),
  porPagar: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/por-cobrar.db", async (real) => ({
  ...(await real<typeof import("@/lib/db/por-cobrar.db")>()),
  PorCobrarDB: { getDetalle: (...a: unknown[]) => H.detalle(...a), getSummary: (...a: unknown[]) => H.summary(...a) },
}));
vi.mock("@/lib/db/por-pagar.db", () => ({ PorPagarDB: { getDetalle: (...a: unknown[]) => H.porPagar(...a) } }));

import { GET } from "@/app/api/admin/por-cobrar/route";

const pedir = (ruta: string, conSesion = true, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${ruta}`, {
    headers: { ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}), ...headers },
  });

const como = (role: string, tenantId = "t1") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

const CERO = { total: 0, count: 0 };
const DETALLE = {
  fiados: { total: 30, count: 1 },
  prestamos: CERO,
  adelantos: CERO,
  madera: { total: 12323.02, count: 1 },
  totalGeneral: 12353.02,
  totales: [
    { moneda: "PEN", total: 12353.02, count: 2 },
    { moneda: "USD", total: 40, count: 1 },
  ],
  porTipo: [],
  items: [
    { id: "f1", tipo: "fiado", quien: "WASACO", monto: 30, moneda: "PEN", desde: null, vence: null, nota: null },
    { id: "p1", tipo: "madera", quien: "WASACO", monto: 12323.02, moneda: "PEN", desde: null, vence: null, nota: null },
    { id: "p9", tipo: "madera", quien: "Norte", monto: 40, moneda: "USD", desde: null, vence: null, nota: null },
  ],
};
const POR_PAGAR = {
  hoy: "2026-09-29",
  totales: [{ moneda: "PEN", total: 3031, cuentas: 1, partidas: 2, vencido: 0, cruzable: 3031 }],
  porFuente: [],
  personas: [
    {
      clave: "benef:b1", nombre: "WASACO", tipo: "persona", beneficiarioId: "b1", parteId: "p1",
      debes: [{ moneda: "PEN", monto: 3031 }], partidas: [], vence: null, vencido: false,
      teDebe: [{ moneda: "PEN", monto: 12323.02 }], neto: [{ moneda: "PEN", monto: 9292.02 }], liquidar: null,
    },
  ],
  truncado: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  como("admin");
  H.detalle.mockResolvedValue(DETALLE);
  H.summary.mockResolvedValue({ fiados: CERO, prestamos: CERO, adelantos: CERO, madera: CERO, totalGeneral: 0 });
  H.porPagar.mockResolvedValue(POR_PAGAR);
});

describe("GET /api/admin/por-cobrar — quién la puede ver", () => {
  it("sin sesión: 401 (nunca 404: sacaba del panel)", async () => {
    expect((await GET(pedir("/api/admin/por-cobrar?detalle=1", false))).status).toBe(401);
  });

  it.each(["cajero", "almacenero"])("%s: 403 por los roles de la ruta", async (rol) => {
    como(rol);
    expect((await GET(pedir("/api/admin/por-cobrar?detalle=1"))).status).toBe(403);
    expect(H.detalle).not.toHaveBeenCalled();
  });

  it("encargado: pasa el management tier, pero el segundo guard lo corta con 403", async () => {
    como("manager");
    const r = await GET(pedir("/api/admin/por-cobrar?resumen=1"));
    expect(r.status).toBe(403);
    expect((await r.json()).message).toBe("Solo el administrador o el dueño pueden ver lo que te deben.");
    expect(H.detalle).not.toHaveBeenCalled();
  });

  it("dueño: 200", async () => {
    como("owner");
    expect((await GET(pedir("/api/admin/por-cobrar?detalle=1"))).status).toBe(200);
  });

  it("el tenant es el del JWT, aunque el header o la query digan otro", async () => {
    como("admin", "t-sesion");
    await GET(pedir("/api/admin/por-cobrar?detalle=1&tenantId=t-otro", true, { "x-tenant-id": "t-otro" }));
    expect(H.detalle).toHaveBeenCalledWith("t-sesion");
    expect(H.porPagar.mock.calls[0]?.[0]).toBe("t-sesion");
  });

  it("un parámetro inválido: 400", async () => {
    expect((await GET(pedir("/api/admin/por-cobrar?resumen=2"))).status).toBe(400);
  });
});

describe("GET /api/admin/por-cobrar — lo que devuelve", () => {
  it("?resumen=1 son los totales del MISMO detalle que lista la sección (la cifra del Resumen)", async () => {
    const resumen = await (await GET(pedir("/api/admin/por-cobrar?resumen=1"))).json();
    const detalle = await (await GET(pedir("/api/admin/por-cobrar?detalle=1"))).json();
    expect(resumen).toEqual({ totales: DETALLE.totales, cuentas: 3 });
    expect(resumen.totales).toEqual(detalle.totales);
    // El Resumen no necesita «Lo que debo»: una sola lectura.
    expect(H.porPagar).toHaveBeenCalledTimes(1);
  });

  it("?detalle=1 marca la fila de quien está también en «Lo que debo» y trae su cruce", async () => {
    const d = await (await GET(pedir("/api/admin/por-cobrar?detalle=1"))).json();
    expect(d.items.map((f: { id: string; cruce: string | null }) => [f.id, f.cruce])).toEqual([
      ["f1", null],
      ["p1", "benef:b1"],
      ["p9", null],
    ]);
    expect(d.cruces).toEqual([
      { clave: "benef:b1", nombre: "WASACO", teDebe: [{ moneda: "PEN", monto: 12323.02 }], leDebes: [{ moneda: "PEN", monto: 3031 }], neto: [{ moneda: "PEN", monto: 9292.02 }] },
    ]);
    expect(d.cruzable).toEqual([{ moneda: "PEN", monto: 3031 }]);
    expect(d.totalGeneral).toBe(DETALLE.totalGeneral);
  });

  it("si «Lo que debo» falla, la lista sale igual (200) sin cruces", async () => {
    H.porPagar.mockRejectedValue(new Error("pooler"));
    const r = await GET(pedir("/api/admin/por-cobrar?detalle=1"));
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.items).toHaveLength(3);
    expect(d.cruces).toEqual([]);
    expect(d.crucesDisponibles).toBe(false);
  });

  it("sin parámetros: el resumen en soles del cron", async () => {
    await GET(pedir("/api/admin/por-cobrar"));
    expect(H.summary).toHaveBeenCalledWith("t1");
    expect(H.detalle).not.toHaveBeenCalled();
  });

  it("si el detalle falla: 500 con mensaje fijo", async () => {
    H.detalle.mockRejectedValue(new Error("boom"));
    const r = await GET(pedir("/api/admin/por-cobrar?detalle=1"));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "Internal error" });
  });
});
