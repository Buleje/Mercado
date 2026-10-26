/**
 * «Dar adelanto» desde RRHH: lo dan admin, dueño y encargado (los que escriben
 * adelantos); cajero y almacenero entran a RRHH sólo a marcar → 403. El
 * adelanto va a SU cuenta de Mi Plata como descuento por planilla, con el
 * negocio de la sesión.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { limaDateKey } from "@/lib/utils";

const m = vi.hoisted(() => {
  class CuentaAmbiguaError extends Error {}
  class IdempotenciaDistintaError extends Error {
    readonly status = 422;
    readonly code = "idempotencia_distinta";
  }
  class ContratoInvalidoError extends Error {
    readonly status = 422;
    readonly code = "contrato_invalido";
  }
  return {
    CuentaAmbiguaError,
    IdempotenciaDistintaError,
    ContratoInvalidoError,
    requireAdmin: vi.fn(),
    asegurarCuenta: vi.fn(),
    create: vi.fn(),
    fechaDelDescuento: vi.fn(),
    logActivity: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: m.logActivity }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: m.requireAdmin }));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({
  ColaboradoresDB: { asegurarCuenta: m.asegurarCuenta },
  CuentaAmbiguaError: m.CuentaAmbiguaError,
}));
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: { create: m.create },
  IdempotenciaDistintaError: m.IdempotenciaDistintaError,
  ContratoInvalidoError: m.ContratoInvalidoError,
}));
vi.mock("@/lib/db/rrhh-pagos.db", () => ({ PagosSemanaDB: { fechaDelDescuento: m.fechaDelDescuento } }));
vi.mock("@/app/api/rrhh/colaboradores/_errores", () => ({ respuestaErrorColaborador: vi.fn(() => null) }));

const { POST } = await import("@/app/api/rrhh/colaboradores/[id]/adelanto/route");

const params = { params: Promise.resolve({ id: "c1" }) };
const BODY = { monto: 50, idempotencyKey: "rrhh-adl-123456" };

function req(body: unknown): NextRequest {
  return new NextRequest("https://host/api/rrhh/colaboradores/c1/adelanto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const auth = (role: string) => ({ tenantId: "t1", username: "qauser", role });

function ayer(): string {
  const d = new Date(`${limaDateKey()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function manana(): string {
  const d = new Date(`${limaDateKey()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.asegurarCuenta.mockResolvedValue({ beneficiarioId: "b1", nombre: "Juan Pérez", origen: "existente" });
  m.create.mockResolvedValue({ id: "a1", codigoOperacion: "ADL-1" });
  m.fechaDelDescuento.mockResolvedValue({ fecha: "2026-10-31", tipo: "tarifa", semanaPagada: false });
});

it("sin sesión: el 401 pasa tal cual", async () => {
  m.requireAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
  expect((await POST(req(BODY), params)).status).toBe(401);
  expect(m.create).not.toHaveBeenCalled();
});

describe.each(["cajero", "almacenero", "superadmin"])("rol %s", (role) => {
  it("403 y no abre cuenta ni anota", async () => {
    m.requireAdmin.mockResolvedValue(auth(role));
    expect((await POST(req(BODY), params)).status).toBe(403);
    expect(m.asegurarCuenta).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
});

describe.each(["admin", "owner", "manager"])("rol %s", (role) => {
  beforeEach(() => m.requireAdmin.mockResolvedValue(auth(role)));

  it("anota descuento por planilla en SU cuenta, con el negocio de la sesión", async () => {
    const res = await POST(req({ ...BODY, tenantId: "ajeno" }), params);
    expect(res.status).toBe(201);
    expect(m.asegurarCuenta).toHaveBeenCalledWith("t1", "c1", "qauser");
    expect(m.create).toHaveBeenCalledWith("t1", expect.objectContaining({
      beneficiarioId: "b1",
      modalidad: "DESCUENTO_PLANILLA",
      montoAdelantado: 50,
      moneda: "PEN",
      direccion: "DADO",
      fechaAdelanto: undefined,
      idempotencyKey: "rrhh-adl-123456",
      metodoCaja: null,
    }));
    expect(m.logActivity).toHaveBeenCalledTimes(1);
  });

  it("un día pasado va al mediodía de Lima; sin caja", async () => {
    const dia = ayer();
    expect((await POST(req({ ...BODY, fecha: dia }), params)).status).toBe(201);
    expect(m.create.mock.calls[0][1].fechaAdelanto).toBe(`${dia}T12:00:00-05:00`);
  });

  it("fecha futura → 422; caja con un día pasado → 422", async () => {
    const fut = await POST(req({ ...BODY, fecha: manana() }), params);
    expect(fut.status).toBe(422);
    expect((await fut.json()).error).toBe("fecha_futura");
    const caja = await POST(req({ ...BODY, fecha: ayer(), metodoCaja: "efectivo" }), params);
    expect(caja.status).toBe(422);
    expect((await caja.json()).error).toBe("caja_solo_hoy");
    expect(m.create).not.toHaveBeenCalled();
  });

  it("el mismo intento devuelve 200 y no se audita dos veces", async () => {
    m.create.mockResolvedValue({ id: "a1", repetido: true });
    expect((await POST(req(BODY), params)).status).toBe(200);
    expect(m.logActivity).not.toHaveBeenCalled();
  });

  it("la misma clave con otro monto → 422 idempotencia_distinta", async () => {
    m.create.mockRejectedValue(new m.IdempotenciaDistintaError("otro"));
    const res = await POST(req(BODY), params);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("idempotencia_distinta");
  });

  it("dos cuentas con su documento → 409 y no anota", async () => {
    m.asegurarCuenta.mockRejectedValue(new m.CuentaAmbiguaError("dos"));
    expect((await POST(req(BODY), params)).status).toBe(409);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("colaborador de otro negocio → 404", async () => {
    m.asegurarCuenta.mockResolvedValue(null);
    expect((await POST(req(BODY), params)).status).toBe(404);
  });

  it("monto cero o sin clave → 422", async () => {
    expect((await POST(req({ ...BODY, monto: 0 }), params)).status).toBe(422);
    expect((await POST(req({ monto: 50 }), params)).status).toBe(422);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("(25-10) el servidor pone el sábado del descuento, la nota legible y el recibo de papel", async () => {
    const res = await POST(req({ ...BODY, motivo: "pasaje", detalle: "a Pucallpa", metodo: "yape", reciboManual: " 0042 " }), params);
    expect(res.status).toBe(201);
    expect(m.fechaDelDescuento).toHaveBeenCalledWith("t1", "c1", limaDateKey());
    expect(m.create.mock.calls[0][1]).toMatchObject({
      notas: "Adelanto de sueldo (RRHH) · Pasaje: a Pucallpa · por Yape",
      fechaVencimiento: "2026-10-31T12:00:00-05:00",
      reciboManual: "0042",
      metodoCaja: null,
    });
    const cuerpo = await res.json();
    expect(cuerpo.descuento).toEqual({ fecha: "2026-10-31", tipo: "tarifa", semanaPagada: false, texto: "Se descuenta el sábado 31/10" });
  });

  it("(25-10) «sale de la caja» mueve la caja por el método elegido; sin método → 422", async () => {
    expect((await POST(req({ ...BODY, metodo: "efectivo", saleDeCaja: true }), params)).status).toBe(201);
    expect(m.create.mock.calls[0][1].metodoCaja).toBe("efectivo");
    const sinMetodo = await POST(req({ ...BODY, saleDeCaja: true }), params);
    expect(sinMetodo.status).toBe(422);
    expect((await sinMetodo.json()).error).toBe("metodo_requerido");
    const pasado = await POST(req({ ...BODY, fecha: ayer(), metodo: "yape", saleDeCaja: true }), params);
    expect((await pasado.json()).error).toBe("caja_solo_hoy");
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("(25-10) «Otro» sin detalle → 422; textos largos → 422", async () => {
    const otro = await POST(req({ ...BODY, motivo: "otro" }), params);
    expect((await otro.json()).error).toBe("detalle_requerido");
    expect((await POST(req({ ...BODY, detalle: "x".repeat(201) }), params)).status).toBe(422);
    expect((await POST(req({ ...BODY, reciboManual: "x".repeat(61) }), params)).status).toBe(422);
    expect((await POST(req({ ...BODY, motivo: "fiesta" }), params)).status).toBe(422);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("(25-10) si el sábado no se puede leer, el adelanto se anota igual sin fecha", async () => {
    m.fechaDelDescuento.mockRejectedValue(new Error("db caída"));
    const res = await POST(req(BODY), params);
    expect(res.status).toBe(201);
    expect(m.create.mock.calls[0][1].fechaVencimiento).toBeNull();
    expect((await res.json()).descuento).toBeNull();
  });
});
