/**
 * GET /api/adelantos/resumen trae `sinControl` (la cuenta del aviso).
 *
 * Con HEAD falla: la ruta devolvía sólo el resumen y nunca llamaba a
 * `AdelantosDB.sinControl`. Casos multi-tenant: sin sesión 401; el tenant sale
 * del JWT aunque el header diga otro; un rol sin lectura no lo ve.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
  resumen: vi.fn(),
  sinControl: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () =>
    H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }),
  ),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: {
    resumen: (...a: unknown[]) => H.resumen(...a),
    sinControl: (...a: unknown[]) => H.sinControl(...a),
  },
}));

import { GET } from "@/app/api/adelantos/resumen/route";

const SIN_CONTROL = {
  cantidad: 1,
  porMoneda: { PEN: 17000 },
  adelantos: [
    {
      id: "a17",
      codigoOperacion: null,
      beneficiarioId: "b9",
      nombre: "Maderera",
      saldoPendiente: 17000,
      moneda: "PEN",
      fechaAdelanto: "2026-08-03T17:00:00.000Z",
      motivos: [{ codigo: "sin-vencimiento", texto: "Sin fecha de vencimiento" }],
    },
  ],
};

const get = (headers: Record<string, string> = {}) =>
  GET(new NextRequest("http://localhost/api/adelantos/resumen", { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.resumen.mockResolvedValue({ adelantosAbiertos: 6 });
  H.sinControl.mockResolvedValue(SIN_CONTROL);
});

describe("GET /api/adelantos/resumen — sinControl", () => {
  it("devuelve el resumen de siempre MÁS la cuenta de los sin control", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adelantosAbiertos).toBe(6);
    expect(body.sinControl).toEqual(SIN_CONTROL);
  });

  it("cuenta con el tenant del JWT, no con el header", async () => {
    await get({ "x-tenant-id": "tenant-ajeno" });
    expect(H.sinControl).toHaveBeenCalledWith("t1");
    expect(H.sinControl).not.toHaveBeenCalledWith("tenant-ajeno");
  });

  it("sin sesión: 401 y no cuenta nada", async () => {
    H.auth = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(H.sinControl).not.toHaveBeenCalled();
  });

  it("un rol sin lectura de adelantos (cajero): 403 y no cuenta nada", async () => {
    H.auth = { tenantId: "t1", username: "caja", role: "cajero" };
    const res = await get();
    expect(res.status).toBe(403);
    expect(H.sinControl).not.toHaveBeenCalled();
  });

  it("si la cuenta falla, el resumen igual sale y `sinControl` es null (no «ninguno»)", async () => {
    H.sinControl.mockRejectedValue(new Error("timeout"));
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adelantosAbiertos).toBe(6);
    expect(body.sinControl).toBeNull();
  });
});
