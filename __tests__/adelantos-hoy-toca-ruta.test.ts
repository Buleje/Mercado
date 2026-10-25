/**
 * GET /api/adelantos/resumen trae `hoyToca` (las cuatro cifras y las tareas del
 * Resumen, 25-10; antes `sinControl`).
 *
 * Casos multi-tenant: sin sesión 401; el tenant sale del JWT aunque el header
 * diga otro; un rol sin lectura no lo ve; si la cuenta falla, el resumen sale
 * igual y `hoyToca` es null (no «nada que hacer»).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
  resumen: vi.fn(),
  hoyToca: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () =>
    H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }),
  ),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/adelantos.db", () => ({ AdelantosDB: { resumen: (...a: unknown[]) => H.resumen(...a) } }));
vi.mock("@/lib/db/adelantos-hoy-toca.db", () => ({ AdelantosHoyTocaDB: { hoyToca: (...a: unknown[]) => H.hoyToca(...a) } }));

import { GET } from "@/app/api/adelantos/resumen/route";

const HOY_TOCA = {
  cifras: {
    teDeben: { PEN: 17000 },
    abiertos: 1,
    personasQueDeben: 1,
    leDebes: {},
    personasLeDebes: 0,
    conMadera: false,
    porCobrar: { PEN: 17000 },
    personasPorCobrar: 1,
    volvioEsteMes: {},
    entregasEsteMes: 0,
  },
  tareas: [{ id: "cobrar:b9", tipo: "cobrar", titulo: "Cobrar a Quispe", detalle: "S/ 17,000.00 sin moverse hace 83 días", cantidad: 1, boton: "Cobrar", href: "/admin" }],
};

const get = (headers: Record<string, string> = {}) =>
  GET(new NextRequest("http://localhost/api/adelantos/resumen", { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.resumen.mockResolvedValue({ adelantosAbiertos: 6 });
  H.hoyToca.mockResolvedValue(HOY_TOCA);
});

describe("GET /api/adelantos/resumen — hoyToca", () => {
  it("devuelve el resumen de siempre MÁS las cifras y las tareas", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adelantosAbiertos).toBe(6);
    expect(body.hoyToca).toEqual(HOY_TOCA);
    expect(body.sinControl).toBeUndefined();
  });

  it("cuenta con el tenant del JWT, no con el header", async () => {
    await get({ "x-tenant-id": "tenant-ajeno" });
    expect(H.hoyToca).toHaveBeenCalledWith("t1");
    expect(H.resumen).toHaveBeenCalledWith("t1");
    expect(H.hoyToca).not.toHaveBeenCalledWith("tenant-ajeno");
  });

  it("sin sesión: 401 y no cuenta nada", async () => {
    H.auth = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(H.hoyToca).not.toHaveBeenCalled();
  });

  it("un rol sin lectura de adelantos (cajero): 403 y no cuenta nada", async () => {
    H.auth = { tenantId: "t1", username: "caja", role: "cajero" };
    const res = await get();
    expect(res.status).toBe(403);
    expect(H.hoyToca).not.toHaveBeenCalled();
  });

  it("si la cuenta falla, el resumen igual sale y `hoyToca` es null (no «nada que hacer»)", async () => {
    H.hoyToca.mockRejectedValue(new Error("timeout"));
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adelantosAbiertos).toBe(6);
    expect(body.hoyToca).toBeNull();
  });
});
