/**
 * POST /api/fiados/cobro-masivo — medio y caja como /api/fiados/cobrar.
 * El tenant sale de la sesión (nunca del cuerpo); 422 si un fiado no se puede
 * cobrar (otro negocio o ya pagado), 409 reintentable si otro cobro ganó.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const { mockRequireAdmin, mockCobroMasivo } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn(), mockCobroMasivo: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db/fiados.db", () => {
  class FiadoConflictError extends Error {
    readonly code = "FIADO_CONFLICT";
  }
  return { FiadosDB: { cobroMasivo: mockCobroMasivo }, FiadoConflictError };
});
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/credit/scoring-engine", () => ({ updateCreditProfile: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/fiados/cobro-masivo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const OK = { resultados: [{ fiadoId: "f1", montoPagado: 20, nuevoSaldo: 0, status: "PAGADO", customerId: "900000001" }], cobrado: 20, sobrante: 0 };

describe("POST /api/fiados/cobro-masivo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ role: "cajero", username: "caja1", tenantId: "tenant-a" });
  });

  it("sin sesión: 401 y no cobra", async () => {
    mockRequireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const { POST } = await import("@/app/api/fiados/cobro-masivo/route");
    const res = await POST(post({ fiadoIds: ["f1"], monto: 20 }));
    expect(res.status).toBe(401);
    expect(mockCobroMasivo).not.toHaveBeenCalled();
    expect(mockRequireAdmin.mock.calls[0][1]).toEqual(["admin", "cajero"]);
  });

  it("fiadoIds + monto + yape + aCaja: el servidor reparte, la caja lleva el medio y la nota también", async () => {
    mockCobroMasivo.mockResolvedValue({ ...OK, caja: { sinCaja: false, movimientos: 1 } });
    const { POST } = await import("@/app/api/fiados/cobro-masivo/route");
    const res = await POST(post({ fiadoIds: ["f1", "f2"], monto: 20, metodo: "yape", aCaja: true, tenantId: "tenant-b" }));
    expect(res.status).toBe(200);
    expect(mockCobroMasivo).toHaveBeenCalledWith("tenant-a", { fiadoIds: ["f1", "f2"], monto: 20 }, "Yape · Cobro masivo", { metodo: "yape" });
    const body = await res.json();
    expect(body).toMatchObject({ success: true, totalCobrado: 20, sobrante: 0, caja: { sinCaja: false, movimientos: 1 } });
  });

  it("aCaja sin medio = efectivo; sin aCaja no pasa caja", async () => {
    mockCobroMasivo.mockResolvedValue(OK);
    const { POST } = await import("@/app/api/fiados/cobro-masivo/route");
    await POST(post({ fiadoIds: ["f1"], monto: 20, aCaja: true, notas: "lo trajo el cobrador" }));
    expect(mockCobroMasivo.mock.calls[0].slice(2)).toEqual(["lo trajo el cobrador", { metodo: "efectivo" }]);
    await POST(post({ fiadoIds: ["f1"], monto: 20, metodo: "plin" }));
    expect(mockCobroMasivo.mock.calls[1].slice(2)).toEqual(["Plin · Cobro masivo", undefined]);
  });

  it("contrato viejo (payments) sigue andando", async () => {
    mockCobroMasivo.mockResolvedValue(OK);
    const { POST } = await import("@/app/api/fiados/cobro-masivo/route");
    const res = await POST(post({ payments: [{ fiadoId: "f1", monto: 20 }] }));
    expect(res.status).toBe(200);
    expect(mockCobroMasivo.mock.calls[0][1]).toEqual([{ fiadoId: "f1", monto: 20 }]);
  });

  it.each([
    ["los dos modos a la vez", { payments: [{ fiadoId: "f1", monto: 5 }], fiadoIds: ["f1"], monto: 5 }],
    ["fiadoIds sin monto", { fiadoIds: ["f1"] }],
    ["monto bajo un céntimo", { fiadoIds: ["f1"], monto: 0.001 }],
    ["fiado repetido", { fiadoIds: ["f1", "f1"], monto: 5 }],
    ["medio inventado", { fiadoIds: ["f1"], monto: 5, metodo: "bitcoin" }],
  ])("400 con %s", async (_n, body) => {
    const { POST } = await import("@/app/api/fiados/cobro-masivo/route");
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(mockCobroMasivo).not.toHaveBeenCalled();
  });

  it("fiado de otro negocio o ya pagado: 422 con el motivo", async () => {
    const { FiadoNoCobrableError } = await import("@/lib/fiados/reparto-cobro-masivo");
    mockCobroMasivo.mockRejectedValue(new FiadoNoCobrableError("Fiado abc123 no encontrado"));
    const { POST } = await import("@/app/api/fiados/cobro-masivo/route");
    const res = await POST(post({ fiadoIds: ["f-de-otro"], monto: 5 }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Fiado abc123 no encontrado");
  });

  it("otro cobro ganó la carrera: 409 reintentable", async () => {
    const { FiadoConflictError } = await import("@/lib/db/fiados.db");
    mockCobroMasivo.mockRejectedValue(new FiadoConflictError("el saldo cambió"));
    const { POST } = await import("@/app/api/fiados/cobro-masivo/route");
    const res = await POST(post({ fiadoIds: ["f1"], monto: 5 }));
    expect(res.status).toBe(409);
    expect((await res.json()).retryable).toBe(true);
  });
});
