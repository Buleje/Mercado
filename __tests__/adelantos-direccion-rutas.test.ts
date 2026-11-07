/**
 * ADR-448 — las rutas de Adelantos con la dirección.
 *
 * POST: los tres rechazos del `superRefine` (la misma regla que el CHECK de la
 * base) y que sin dirección todo siga siendo DADO. GET: `?direccion=` y los
 * demás filtros validados con Zod (antes `status` se casteaba `as never` y un
 * valor inventado daba 503). PATCH `corregirDireccion`: sólo admin o dueño
 * —`manager` pasa `requireAdmin` por el bypass de gestión—, con motivo, y el
 * adelanto de otro negocio da 404.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => {
  class DireccionNoCorregibleError extends Error {
    constructor(
      message: string,
      readonly status: 400 | 409,
      readonly code: string,
    ) {
      super(message);
    }
  }
  class AdelantoNoCancelableError extends Error {}
  /* Revisión ADR-449: la ruta la importa; sin ella en el mock, el `instanceof`
     del catch revienta con TypeError. */
  class AdelantoConLiquidacionError extends Error {}
  class IdempotenciaDistintaError extends Error {
    readonly status = 422;
    readonly code = "idempotencia_distinta";
  }
  class ReglaDeRecibidoError extends Error {
    constructor(
      message: string,
      readonly status: 400 | 403,
      readonly code: string,
    ) {
      super(message);
    }
  }
  return {
    registrarEntrega: vi.fn(),
    cancel: vi.fn(),
    ReglaDeRecibidoError,
    IdempotenciaDistintaError,
    auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
    create: vi.fn(),
    list: vi.fn(),
    corregir: vi.fn(),
    DireccionNoCorregibleError,
    AdelantoNoCancelableError,
    AdelantoConLiquidacionError,
  };
});

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () =>
    H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }),
  ),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: {
    create: (...a: unknown[]) => H.create(...a),
    list: (...a: unknown[]) => H.list(...a),
    corregirDireccion: (...a: unknown[]) => H.corregir(...a),
    registrarEntrega: (...a: unknown[]) => H.registrarEntrega(...a),
    cancel: (...a: unknown[]) => H.cancel(...a),
    updateNotas: async () => ({ id: "a1", notas: "ok" }),
  },
  DireccionNoCorregibleError: H.DireccionNoCorregibleError,
  ReglaDeRecibidoError: H.ReglaDeRecibidoError,
  IdempotenciaDistintaError: H.IdempotenciaDistintaError,
  ContratoInvalidoError: class ContratoInvalidoError extends Error {},
  AdelantoNoCancelableError: H.AdelantoNoCancelableError,
  AdelantoConLiquidacionError: H.AdelantoConLiquidacionError,
}));

import { GET, POST } from "@/app/api/adelantos/route";
import { PATCH } from "@/app/api/adelantos/[id]/route";
import { POST as POST_ENTREGA } from "@/app/api/adelantos/[id]/entregas/route";

const entrega = (body: unknown, id = "a1") =>
  POST_ENTREGA(new NextRequest(`http://localhost/api/adelantos/${id}/entregas`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/adelantos", { method: "POST", body: JSON.stringify(body) }));
const get = (qs: string) => GET(new NextRequest(`http://localhost/api/adelantos${qs}`));
const patch = (body: unknown, id = "a1") =>
  PATCH(new NextRequest(`http://localhost/api/adelantos/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

const base = { beneficiarioId: "b1", montoAdelantado: 1731 };

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.create.mockImplementation(async (_t: string, d: Record<string, unknown>) => ({
    id: "a1",
    direccion: d.direccion ?? "DADO",
    caja: null,
  }));
  H.list.mockResolvedValue([]);
});

describe("POST /api/adelantos — dirección (2.5)", () => {
  it("RECIBIDO sin concepto → 400 con el motivo", async () => {
    const r = await post({ ...base, direccion: "RECIBIDO" });
    expect(r.status).toBe(400);
    expect((await r.json()).issues.join(" ")).toMatch(/servicio o te prestaron/);
    expect(H.create).not.toHaveBeenCalled();
  });

  it("DADO con concepto → 400", async () => {
    const r = await post({ ...base, direccion: "DADO", conceptoRecibido: "SERVICIO" });
    expect(r.status).toBe(400);
    expect(H.create).not.toHaveBeenCalled();
  });

  it("RECIBIDO por descuento de planilla → 400", async () => {
    const r = await post({ ...base, direccion: "RECIBIDO", conceptoRecibido: "PRESTAMO", modalidad: "DESCUENTO_PLANILLA" });
    expect(r.status).toBe(400);
    expect((await r.json()).issues.join(" ")).toMatch(/planilla/);
  });

  it("sin dirección pasa tal cual (el default DADO lo pone la DB class)", async () => {
    const r = await post(base);
    expect(r.status).toBe(201);
    expect(H.create.mock.calls[0][1]).not.toHaveProperty("direccion");
    expect((await r.json()).direccion).toBe("DADO");
  });

  it("RECIBIDO + SERVICIO con pies de SERVICIO llega a la DB class", async () => {
    const r = await post({ ...base, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", piesTablares: 3462, piesTablaresTipo: "SERVICIO", metodoCaja: "efectivo" });
    expect(r.status).toBe(201);
    expect(H.create.mock.calls[0]).toEqual(["t1", expect.objectContaining({ direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", piesTablaresTipo: "SERVICIO" })]);
  });

  it.each(["cajero", "almacenero", "manager"])("un %s no registra plata recibida → 403", async (role) => {
    H.auth = { tenantId: "t1", username: "x", role };
    const r = await post({ ...base, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" });
    expect(r.status).toBe(403);
    expect(H.create).not.toHaveBeenCalled();
  });

  it("el dueño sí registra lo recibido; un encargado da plata (write), pero no recibe", async () => {
    H.auth = { tenantId: "t1", username: "d", role: "owner" };
    expect((await post({ ...base, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" })).status).toBe(201);
    H.auth = { tenantId: "t1", username: "m", role: "manager" };
    expect((await post(base)).status).toBe(201);
  });

  it.each(["cajero", "almacenero", "analista"])("un %s (sin `adelantos:write` en la matriz) no da un adelanto DADO → 403", async (role) => {
    H.auth = { tenantId: "t1", username: "x", role };
    const r = await post({ ...base, metodoCaja: "efectivo", forzarLimite: true });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: "sin_permiso_adelantos" });
    expect(H.create).not.toHaveBeenCalled();
  });

  it("la misma clave con otro cuerpo → 422 idempotencia_distinta", async () => {
    H.create.mockRejectedValue(new H.IdempotenciaDistintaError("Ya guardaste un adelanto con otros datos en este intento; revísalo en la lista."));
    const r = await post({ ...base, idempotencyKey: "intento-0002" });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ code: "idempotencia_distinta" });
  });

  it("un reintento con la misma clave devuelve 200 con `repetido`", async () => {
    H.create.mockResolvedValueOnce({ id: "a1", direccion: "DADO", caja: null, repetido: true });
    const r = await post({ ...base, idempotencyKey: "intento-0001" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ repetido: true });
    expect(H.create.mock.calls[0][1]).toMatchObject({ idempotencyKey: "intento-0001" });
  });

  it("sin sesión → 401", async () => {
    H.auth = null;
    expect((await post(base)).status).toBe(401);
  });
});

describe("GET /api/adelantos — quién lee", () => {
  it.each(["cajero", "almacenero"])("un %s no lee la lista → 403", async (role) => {
    H.auth = { tenantId: "t1", username: "x", role };
    expect((await get("?direccion=todas")).status).toBe(403);
    expect(H.list).not.toHaveBeenCalled();
  });

  it("un analista sí lee (read en la matriz)", async () => {
    H.auth = { tenantId: "t1", username: "a", role: "analista" };
    expect((await get("")).status).toBe(200);
  });
});

describe("GET /api/adelantos — filtros con Zod", () => {
  it("sin nada: la DB class decide (DADO)", async () => {
    await get("");
    expect(H.list.mock.calls[0][1]).toEqual({});
  });

  it("?direccion=todas y ?direccion=RECIBIDO llegan; un valor inventado → 400", async () => {
    await get("?direccion=todas");
    expect(H.list.mock.calls[0][1]).toMatchObject({ direccion: "todas" });
    await get("?direccion=RECIBIDO&status=ABIERTO");
    expect(H.list.mock.calls[1][1]).toMatchObject({ direccion: "RECIBIDO", status: "ABIERTO" });
    expect((await get("?direccion=dadas")).status).toBe(400);
    expect((await get("?status=PAGADO")).status).toBe(400);
    expect(H.list).toHaveBeenCalledTimes(2);
  });

  it("un parámetro vacío es «sin filtro», como antes", async () => {
    const r = await get("?status=&direccion=");
    expect(r.status).toBe(200);
    expect(H.list.mock.calls[0][1]).toEqual({});
  });
});

describe("PATCH /api/adelantos/[id] — corregirDireccion", () => {
  const pedido = { action: "corregirDireccion", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", motivo: "Era el pago del aserrío" };

  it("un encargado (manager) pasa requireAdmin pero no esto → 403", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    const r = await patch(pedido);
    expect(r.status).toBe(403);
    expect(H.corregir).not.toHaveBeenCalled();
  });

  it("sin motivo legible → 400", async () => {
    const r = await patch({ ...pedido, motivo: "  ..  " });
    expect(r.status).toBe(400);
    expect(H.corregir).not.toHaveBeenCalled();
  });

  it("el adelanto de otro negocio → 404 (la DB class no lo encuentra con este tenant)", async () => {
    H.corregir.mockResolvedValue(null);
    const r = await patch(pedido, "de-otro");
    expect(r.status).toBe(404);
    expect(H.corregir.mock.calls[0][0]).toBe("t1");
  });

  it("con entregas → el 409 de la DB class, con su código", async () => {
    H.corregir.mockRejectedValue(new H.DireccionNoCorregibleError("Ya tiene 1 entrega registrada", 409, "con_entregas"));
    const r = await patch(pedido);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "con_entregas" });
  });

  it("bien: 200 con el antes → después y el aviso de que la caja no se movió", async () => {
    H.corregir.mockResolvedValue({
      adelanto: { id: "a1", codigoOperacion: "ADL-2026-0003", direccion: "RECIBIDO" },
      antes: { direccion: "DADO", conceptoRecibido: null },
      despues: { direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" },
    });
    const r = await patch(pedido);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ id: "a1", direccion: "RECIBIDO", correccion: { cajaMovida: false } });
    expect(j.correccion.aviso).toMatch(/caja no se movió/);
    expect(H.corregir.mock.calls[0]).toEqual(["t1", "a1", { direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", motivo: "Era el pago del aserrío", usuario: "brandon" }]);
  });
});

describe("POST /api/adelantos/[id]/entregas — plata de un recibido", () => {
  it("le pasa a la DB class si quien pide es admin o dueño", async () => {
    H.registrarEntrega.mockResolvedValue({ id: "a1", saldoPendiente: 0, caja: null });
    H.auth = { tenantId: "t1", username: "m", role: "manager" };
    await entrega({ tipo: "LIBRE", valorManual: 10, metodoCaja: "efectivo" });
    expect(H.registrarEntrega.mock.calls[0][3]).toEqual({ puedeSacarPlataDeRecibido: false });
    H.auth = { tenantId: "t1", username: "a", role: "admin" };
    await entrega({ tipo: "LIBRE", valorManual: 10, metodoCaja: "efectivo" });
    expect(H.registrarEntrega.mock.calls[1][3]).toEqual({ puedeSacarPlataDeRecibido: true });
  });

  it.each([
    [403, "solo_admin_o_dueno"],
    [400, "excede_saldo"],
    [400, "producto_en_recibido"],
  ])("la regla de la DB class sale con su status %i y código %s", async (status, code) => {
    H.registrarEntrega.mockRejectedValue(new H.ReglaDeRecibidoError("no", status as 400 | 403, code));
    const r = await entrega({ tipo: "LIBRE", valorManual: 10, metodoCaja: "efectivo" });
    expect(r.status).toBe(status);
    expect(await r.json()).toMatchObject({ code });
  });
});

describe("entregas: roles de la matriz y el reintento", () => {
  it.each(["cajero", "almacenero", "analista"])("un %s no registra entregas (borraba deudas sin caja) → 403", async (role) => {
    H.auth = { tenantId: "t1", username: "x", role };
    const r = await entrega({ tipo: "LIBRE", valorManual: 5000, descripcion: "saldado" });
    expect(r.status).toBe(403);
    expect(H.registrarEntrega).not.toHaveBeenCalled();
  });

  it("el reintento del mismo intento → 200 con `repetido`; con otro cuerpo → 422", async () => {
    H.registrarEntrega.mockResolvedValueOnce({ id: "a1", saldoPendiente: 100, caja: null, repetido: true });
    const r = await entrega({ tipo: "LIBRE", valorManual: 10, metodoCaja: "efectivo", idempotencyKey: "entrega-0001" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ repetido: true });
    expect(H.registrarEntrega.mock.calls[0][2]).toMatchObject({ idempotencyKey: "entrega-0001" });
    H.registrarEntrega.mockRejectedValueOnce(new H.IdempotenciaDistintaError("otra"));
    expect((await entrega({ tipo: "LIBRE", valorManual: 11, idempotencyKey: "entrega-0001" })).status).toBe(422);
  });
});

describe("PATCH cancelar: `delete` en la matriz", () => {
  it("un encargado (manager) no anula: la matriz no le da `delete` → 403 sin llegar a la DB class", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    const r = await patch({ cancelar: true, devolucionCaja: "efectivo" });
    expect(r.status).toBe(403);
    expect(H.cancel).not.toHaveBeenCalled();
  });

  it("el admin anula; y la regla del recibido de la DB class sale tal cual", async () => {
    H.cancel.mockRejectedValue(new H.ReglaDeRecibidoError("Solo el administrador o el dueño…", 403, "solo_admin_o_dueno"));
    const r = await patch({ cancelar: true, devolucionCaja: "efectivo" });
    expect(r.status).toBe(403);
    expect(H.cancel.mock.calls[0]).toEqual(["t1", "a1", "efectivo", { puedeSacarPlataDeRecibido: true }]);
  });

  it("un encargado sí edita las notas (write)", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    expect((await patch({ notas: "ok" })).status).toBe(200);
  });
});

describe("PATCH corregirDireccion — la caja del alta y el tope", () => {
  const pedido = { action: "corregirDireccion", direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", motivo: "Era el pago del aserrío" };

  it("409 movio_caja con el movimiento, para que la pantalla lo muestre", async () => {
    const err = new H.DireccionNoCorregibleError("Esta plata salió de tu caja el 27/09 (S/ 3,217.00)…", 409, "movio_caja");
    (err as unknown as { movimiento: unknown }).movimiento = { tipo: "egreso", monto: 3217, fecha: "2026-09-28T00:59:32.271Z" };
    H.corregir.mockRejectedValue(err);
    const r = await patch(pedido);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: "movio_caja", movimiento: { tipo: "egreso", monto: 3217 } });
  });

  it("200 con `excedeLimite` cuando pasar a dado supera el tope", async () => {
    H.corregir.mockResolvedValue({
      adelanto: { id: "a1", direccion: "DADO" },
      antes: { direccion: "RECIBIDO", conceptoRecibido: "SERVICIO" },
      despues: { direccion: "DADO", conceptoRecibido: null },
      excedeLimite: { limite: 1000, saldo: 2631 },
    });
    const r = await patch({ action: "corregirDireccion", direccion: "DADO", motivo: "Era plata que le dimos" });
    expect(r.status).toBe(200);
    expect((await r.json()).correccion).toMatchObject({ cajaMovida: false, excedeLimite: { limite: 1000, saldo: 2631 } });
  });
});
