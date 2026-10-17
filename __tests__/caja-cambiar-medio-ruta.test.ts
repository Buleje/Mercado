/**
 * PATCH /api/cash-registers/[id]/movements/[movementId] — corregir el medio de
 * un ingreso/egreso de la caja abierta. Con HEAD la ruta no existía.
 *
 * Fija: sólo admin/dueño (cajero y encargado → 403), Zod con la lista fija de
 * medios, el tenant sale de la sesión (nunca del cuerpo), 404 para lo ajeno,
 * 409 con `motivo` y el renglón de auditoría con antes/después y quién.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => {
  class MedioNoCambiadoError extends Error {
    constructor(
      message: string,
      readonly motivo: string,
    ) {
      super(message);
    }
  }
  return {
    MedioNoCambiadoError,
    sesion: { tenantId: "t1", username: "dueno1", role: "owner" } as { tenantId: string; username: string; role: string } | null,
    cambiarMedio: vi.fn(),
    logActivity: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () => H.sesion ?? NextResponse.json({ error: "unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: H.logActivity }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/cash-registers-movements.db", () => ({
  MedioNoCambiadoError: H.MedioNoCambiadoError,
  CashRegistersMovementsDB: { cambiarMedio: H.cambiarMedio },
}));

import { PATCH } from "@/app/api/cash-registers/[id]/movements/[movementId]/route";

const patch = (body: unknown, ids = { id: "c1", movementId: "m1" }) =>
  PATCH(
    new NextRequest(`http://localhost/api/cash-registers/${ids.id}/movements/${ids.movementId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve(ids) },
  );

const CAMBIO = {
  movimiento: { id: "m1", cashRegisterId: "c1", type: "egreso", amount: 3642, method: "transferencia", description: "Adelanto ADL-2026-0001 · Juan", createdAt: new Date() },
  metodoAnterior: "efectivo",
  esperadoAntes: -6424,
  esperadoDespues: -2782,
};

beforeEach(() => {
  vi.clearAllMocks();
  H.sesion = { tenantId: "t1", username: "dueno1", role: "owner" };
  H.cambiarMedio.mockResolvedValue(CAMBIO);
});

describe("quién puede", () => {
  it("sin sesión → 401 (nunca 404: un 404 saca del panel)", async () => {
    H.sesion = null;
    expect((await patch({ method: "yape" })).status).toBe(401);
    expect(H.cambiarMedio).not.toHaveBeenCalled();
  });

  it("cajero y encargado → 403: cambiar el medio mueve el esperado del arqueo", async () => {
    for (const role of ["cajero", "manager", "almacenero"]) {
      H.sesion = { tenantId: "t1", username: "x", role };
      const r = await patch({ method: "yape" });
      expect(r.status).toBe(403);
    }
    expect(H.cambiarMedio).not.toHaveBeenCalled();
  });

  it("admin y dueño pasan", async () => {
    for (const role of ["admin", "owner"]) {
      H.sesion = { tenantId: "t1", username: "x", role };
      expect((await patch({ method: "transferencia" })).status).toBe(200);
    }
  });
});

describe("qué acepta", () => {
  it("un medio fuera de la lista (o HTML, o nada) → 400 sin tocar la base", async () => {
    for (const body of [{ method: "fiado" }, { method: `<img src=x onerror=alert(1)>` }, {}, null, { method: "EFECTIVO" }]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect(H.cambiarMedio).not.toHaveBeenCalled();
  });

  it("el tenant es el de la sesión, aunque el cuerpo traiga otro", async () => {
    await patch({ method: "transferencia", tenantId: "otro-negocio" });
    expect(H.cambiarMedio).toHaveBeenCalledWith("t1", { cashRegisterId: "c1", movementId: "m1", metodo: "transferencia" });
  });

  it("caja o movimiento de otro negocio → 404", async () => {
    H.sesion = { tenantId: "t2", username: "ajeno", role: "admin" };
    H.cambiarMedio.mockResolvedValueOnce(null);
    const r = await patch({ method: "yape" });
    expect(r.status).toBe(404);
    expect(H.cambiarMedio).toHaveBeenCalledWith("t2", expect.anything());
    expect(H.logActivity).not.toHaveBeenCalled();
  });

  it("caja cerrada → 409 con el mensaje y el motivo", async () => {
    H.cambiarMedio.mockRejectedValueOnce(new H.MedioNoCambiadoError("La caja ya está cerrada: …", "caja_cerrada"));
    const r = await patch({ method: "yape" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "La caja ya está cerrada: …", motivo: "caja_cerrada" });
  });
});

describe("qué devuelve y qué deja registrado", () => {
  it("200 con el esperado antes/después, y el renglón de auditoría con quién y los dos medios", async () => {
    const r = await patch({ method: "transferencia" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ metodoAnterior: "efectivo", esperadoAntes: -6424, esperadoDespues: -2782 });
    expect(H.logActivity).toHaveBeenCalledTimes(1);
    const [accion, entidad, detalle, entityId, usuario, , tenant] = H.logActivity.mock.calls[0] as unknown as unknown[];
    expect([accion, entidad, entityId, usuario, tenant]).toEqual(["Editar", "movimiento_caja", "m1", "dueno1", "t1"]);
    expect(detalle).toContain("Efectivo → Transferencia");
    expect(detalle).toContain("S/-6424.00 → S/-2782.00");
    expect(detalle).toContain("ADL-2026-0001");
  });
});
