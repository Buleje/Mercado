/**
 * PATCH /api/adelantos/[id] con `fechaVencimiento` / `contratoId`.
 *
 * Con HEAD falla: el esquema de notas descartaba estas claves y el PATCH
 * terminaba en `updateNotas(null)` — ponerle fecha a un adelanto BORRABA su
 * motivo y devolvía 200. Casos multi-tenant: sin sesión 401, el tenant sale del
 * JWT, adelanto de otro negocio 404, permiso de otro negocio 422; roles de la
 * matriz: cajero/almacenero/analista 403, encargado sí.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => {
  class AdelantoNoControlableError extends Error {
    constructor(
      message: string,
      readonly status: 400 | 409 | 422,
      readonly code: string,
    ) {
      super(message);
    }
  }
  class Vacia extends Error {}
  return {
    auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
    controlar: vi.fn(),
    updateNotas: vi.fn(),
    AdelantoNoControlableError,
    Vacia,
  };
});

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => (H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }))),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: {
    updateNotas: (...a: unknown[]) => H.updateNotas(...a),
    cancel: vi.fn(),
    corregirDireccion: vi.fn(),
  },
  AdelantoConLiquidacionError: H.Vacia,
  AdelantoNoCancelableError: H.Vacia,
  DireccionNoCorregibleError: H.Vacia,
  ReglaDeRecibidoError: H.Vacia,
}));
vi.mock("@/lib/db/adelantos-control.db", () => ({
  AdelantosControlDB: { controlar: (...a: unknown[]) => H.controlar(...a) },
  AdelantoNoControlableError: H.AdelantoNoControlableError,
}));

import { PATCH } from "@/app/api/adelantos/[id]/route";

const patch = (body: unknown, id = "a17", headers: Record<string, string> = {}) =>
  PATCH(new NextRequest(`http://localhost/api/adelantos/${id}`, { method: "PATCH", body: JSON.stringify(body), headers }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.controlar.mockResolvedValue({ fechaVencimiento: "2026-10-15T17:00:00.000Z", contratoId: null, cambio: true });
  H.updateNotas.mockResolvedValue({ id: "a17", notas: null });
});

describe("PATCH /api/adelantos/[id] — vencimiento y permiso", () => {
  it("poner vencimiento llega a la DB class con el tenant del JWT, y NO toca las notas", async () => {
    const r = await patch({ fechaVencimiento: "2026-10-15" }, "a17", { "x-tenant-id": "otro" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: "a17", fechaVencimiento: "2026-10-15T17:00:00.000Z", cambio: true });
    expect(H.controlar.mock.calls[0]).toEqual(["t1", "a17", { fechaVencimiento: "2026-10-15", usuario: "brandon" }]);
    expect(H.updateNotas).not.toHaveBeenCalled();
  });

  it("atar y desatar un permiso", async () => {
    await patch({ contratoId: "ctr1" });
    expect(H.controlar.mock.calls[0][2]).toEqual({ contratoId: "ctr1", usuario: "brandon" });
    await patch({ contratoId: null });
    expect(H.controlar.mock.calls[1][2]).toEqual({ contratoId: null, usuario: "brandon" });
  });

  it.each([
    ["LIQUIDADO", "Este adelanto ya se liquidó: ya no se le pone fecha ni permiso."],
    ["CANCELADO", "Este adelanto está anulado: ya no se le pone fecha ni permiso."],
  ])("un adelanto %s → 409 no_abierto", async (_s, msg) => {
    H.controlar.mockRejectedValue(new H.AdelantoNoControlableError(msg, 409, "no_abierto"));
    const r = await patch({ fechaVencimiento: "2026-10-15" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: msg, code: "no_abierto" });
  });

  it("un permiso de otro negocio → 422 contrato_ajeno", async () => {
    H.controlar.mockRejectedValue(new H.AdelantoNoControlableError("Ese permiso no existe en este negocio", 422, "contrato_ajeno"));
    const r = await patch({ contratoId: "ctr-de-otro" });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ code: "contrato_ajeno" });
  });

  it("el adelanto de otro negocio → 404", async () => {
    H.controlar.mockResolvedValue(null);
    const r = await patch({ fechaVencimiento: "2026-10-15" }, "de-otro");
    expect(r.status).toBe(404);
    expect(H.controlar.mock.calls[0][0]).toBe("t1");
  });

  it.each(["cajero", "almacenero", "analista"])("un %s (sin `adelantos:write`) → 403 sin llegar a la DB class", async (role) => {
    H.auth = { tenantId: "t1", username: "x", role };
    const r = await patch({ fechaVencimiento: "2026-10-15" });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "sin_permiso_adelantos" });
    expect(H.controlar).not.toHaveBeenCalled();
  });

  it("un encargado (manager) sí: es `write`, como editar las notas", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    expect((await patch({ contratoId: "ctr1" })).status).toBe(200);
  });

  it("sin sesión → 401", async () => {
    H.auth = null;
    expect((await patch({ fechaVencimiento: "2026-10-15" })).status).toBe(401);
    expect(H.controlar).not.toHaveBeenCalled();
  });

  it.each([
    [{ fechaVencimiento: "15/10/2026" }],
    [{ fechaVencimiento: "2026-10-15T05:00:00Z" }],
    [{ fechaVencimiento: "2026-10-15", notas: "x" }],
    [{ contratoId: "ctr1", cancelar: true }],
    [{ contratoId: "x".repeat(65) }],
  ])("%j → 400 sin tocar nada", async (body) => {
    const r = await patch(body);
    expect(r.status).toBe(400);
    expect(H.controlar).not.toHaveBeenCalled();
    expect(H.updateNotas).not.toHaveBeenCalled();
  });

  it("la fecha que la DB class rechaza (antes de darlo) → 400 con su mensaje", async () => {
    H.controlar.mockRejectedValue(new H.AdelantoNoControlableError("La fecha para devolverlo no puede ser antes…", 400, "vencimiento_invalido"));
    const r = await patch({ fechaVencimiento: "2026-08-01" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ code: "vencimiento_invalido" });
  });

  it.each([
    [{}],
    [{ foo: 1 }],
    [{ cancelar: false }],
    [{ notas: "x", fechaVencimento: "2026-10-15" }],
    /* El caso de la auditoría 08-10: un PATCH con sólo la foto, sin `notas`. */
    [{ comprobanteUrl: "https://x.supabase.co/storage/v1/object/public/media/t1/media/1728000000000-v.webp" }],
  ])(
    "%j → 400: ya no cae en `updateNotas(null)` borrando las notas",
    async (body) => {
      const r = await patch(body);
      expect(r.status).toBe(400);
      expect(H.updateNotas).not.toHaveBeenCalled();
      expect(H.controlar).not.toHaveBeenCalled();
    },
  );

  it("borrar las notas a propósito (`notas: null`) sigue valiendo", async () => {
    expect((await patch({ notas: null })).status).toBe(200);
    expect(H.updateNotas).toHaveBeenCalledWith("t1", "a17", null);
  });

  it("editar sólo las notas sigue igual", async () => {
    H.updateNotas.mockResolvedValue({ id: "a17", notas: "ok" });
    expect((await patch({ notas: "ok" })).status).toBe(200);
    expect(H.updateNotas).toHaveBeenCalledWith("t1", "a17", "ok");
    expect(H.controlar).not.toHaveBeenCalled();
  });
});
