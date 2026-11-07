// @vitest-environment node
/**
 * ADR-491 — `POST /api/adelantos/entregar`: entregar en una pantalla.
 *
 * Fija lo que protege la plata: el cajero sólo crea DADO, en cuenta corriente,
 * en soles, con fecha de ahora, hasta el tope de Ajustes (leído en el servidor),
 * de la caja abierta (sin caja = 409 y la base no guarda nada) y con firma; la
 * huella pide consentimiento; un reintento no duplica ni caja ni firma; la
 * respuesta no lleva banco, CCI ni dirección de la ficha.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "caja1", role: "cajero" } as { tenantId: string; username: string; role: string } | null,
  tope: null as number | null,
  create: vi.fn(),
  porIdempotencia: vi.fn(async () => [] as unknown[]),
  vigentes: vi.fn(async () => ({ firma: null, huella: null }) as { firma: unknown; huella: unknown }),
  guardar: vi.fn(),
  resumenPorClave: vi.fn(async () => null as unknown),
  movAlta: vi.fn(async () => null as unknown),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => (H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }))),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => H.logActivity(...(a as [])) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: async () => ({ adelantoTopeCajero: H.tope ?? undefined }) } }));
vi.mock("@/lib/db/adelanto-firmas.db", () => ({
  AdelantoFirmasDB: { porIdempotencia: (...a: unknown[]) => H.porIdempotencia(...(a as [])), vigentes: (...a: unknown[]) => H.vigentes(...(a as [])) },
}));
vi.mock("@/lib/adelantos/guardar-en-registro.server", () => ({ guardarEnRegistro: (...a: unknown[]) => H.guardar(...a) }));
vi.mock("@/lib/db/adelantos.db", async () => {
  class SinCajaError extends Error {
    readonly status = 409;
    readonly code = "sin_caja";
  }
  class IdempotenciaDistintaError extends Error {
    readonly status = 422;
    readonly code = "idempotencia_distinta";
  }
  class TopeCajeroError extends Error {
    constructor(readonly tope: number, readonly queda: number) {
      super(`queda S/ ${queda}`);
    }
  }
  return {
    AdelantosDB: {
      create: (...a: unknown[]) => H.create(...a),
      resumenPorClave: (...a: unknown[]) => H.resumenPorClave(...(a as [])),
      movimientoDeCajaDelAlta: (...a: unknown[]) => H.movAlta(...(a as [])),
    },
    SinCajaError,
    IdempotenciaDistintaError,
    TopeCajeroError,
  };
});

import { POST } from "@/app/api/adelantos/entregar/route";
import { IdempotenciaDistintaError, SinCajaError, TopeCajeroError } from "@/lib/db/adelantos.db";

let PNG: Buffer;
beforeAll(async () => {
  PNG = await sharp({ create: { width: 60, height: 30, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
});

const FIRMANTE = { nombre: "Juan Pérez", documento: "45678901" };
function pedido(datos: Record<string, unknown>, { firma = true, huella = false }: { firma?: boolean; huella?: boolean } = {}) {
  const fd = new FormData();
  fd.append("datos", JSON.stringify({ beneficiarioId: "b1", monto: 120, metodoCaja: "efectivo", idempotencyKey: "clave-0001", firmante: FIRMANTE, ...datos }));
  if (firma) fd.append("firma", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "firma.png");
  if (huella) fd.append("huella", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "huella.png");
  return new NextRequest("http://localhost/api/adelantos/entregar", { method: "POST", body: fd });
}

const ADELANTO = {
  id: "a1",
  codigoOperacion: "ADL-2026-0099",
  montoAdelantado: 120,
  moneda: "PEN",
  fechaAdelanto: "2026-10-10T15:00:00.000Z",
  beneficiario: { id: "b1", nombre: "Juan Pérez", banco: "BCP", cci: "00219300123456789012", direccion: "Jr. Secreto 123", documento: "45678901" },
  caja: { sinCaja: false, movimientoId: "m1" },
  status: "ABIERTO",
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  H.auth = { tenantId: "t1", username: "caja1", role: "cajero" };
  H.tope = null;
  H.create.mockReset().mockResolvedValue(ADELANTO);
  H.porIdempotencia.mockReset().mockResolvedValue([]);
  H.vigentes.mockReset().mockResolvedValue({ firma: null, huella: null });
  H.guardar.mockReset().mockResolvedValue({ firma: { guardada: true, id: "f1", sha256: "a".repeat(64) }, huella: null });
  H.logActivity.mockClear();
});

describe("POST /api/adelantos/entregar — modo cajero", () => {
  it("201 dentro del tope: DADO, cuenta corriente, soles, caja exigida; firma al registro", async () => {
    const r = await POST(pedido({ monto: 120, moneda: "USD" }));
    expect(r.status).toBe(201);
    const [tenant, input] = H.create.mock.calls[0] as [string, Record<string, unknown>];
    expect(tenant).toBe("t1");
    expect(input).toMatchObject({ beneficiarioId: "b1", montoAdelantado: 120, moneda: "PEN", direccion: "DADO", modalidad: "CUENTA_CORRIENTE", metodoCaja: "efectivo", exigirCajaAbierta: true, soloActivas: true, idempotencyKey: "cajero:clave-0001" });
    /* Tope DIARIO: el alta suma lo que los cajeros ya le dieron hoy (Lima) a esa persona. */
    const tc = input.topeCajero as { tope: number; desde: Date; prefijoClave: string };
    expect(tc.tope).toBe(500);
    expect(tc.prefijoClave).toBe("cajero:");
    expect(new Date().getTime() - tc.desde.getTime()).toBeLessThan(86_400_000);
    expect(tc.desde.toISOString()).toMatch(/T05:00:00\.000Z$/);
    expect(input).not.toHaveProperty("fechaAdelanto");
    expect(input).not.toHaveProperty("forzarLimite");
    expect(input).not.toHaveProperty("contratoId");
    expect(input).not.toHaveProperty("entregasPactadas");
    const body = await r.json();
    expect(body.firma).toEqual({ guardada: true, id: "f1", sha256: "a".repeat(64) });
    expect(body.caja).toEqual({ movimientoId: "m1" });
    expect(H.guardar.mock.calls[0][3]).toEqual({ firmante: FIRMANTE, pedidoPor: "caja1", clave: "clave-0001" });
  });

  it("el cuerpo no puede pedir otra dirección, fecha, tope forzado ni contrato (strict → 400, sin alta)", async () => {
    for (const extra of [{ direccion: "RECIBIDO" }, { fechaAdelanto: "2026-01-01" }, { forzarLimite: true }, { contratoId: "c1" }, { modalidad: "ENTREGAS_PACTADAS" }]) {
      const r = await POST(pedido(extra));
      expect(r.status).toBe(400);
    }
    expect(H.create).not.toHaveBeenCalled();
  });

  it("403 supera_tope_cajero: 500 por defecto, leído en el servidor", async () => {
    const r = await POST(pedido({ monto: 500.01 }));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe("supera_tope_cajero");
    expect(H.create).not.toHaveBeenCalled();
    expect((await POST(pedido({ monto: 500 }))).status).toBe(201);
  });

  it("tope de Ajustes: 0 = el cajero no entrega; 1000 deja pasar 800", async () => {
    H.tope = 0;
    expect((await POST(pedido({ monto: 1 }))).status).toBe(403);
    H.tope = 1000;
    expect((await POST(pedido({ monto: 800 }))).status).toBe(201);
  });

  it("409 sin_caja: sin método de caja no se llama al alta; sin caja abierta el alta tira y no queda nada", async () => {
    const r1 = await POST(pedido({ metodoCaja: null }));
    expect(r1.status).toBe(409);
    expect((await r1.json()).code).toBe("sin_caja");
    expect(H.create).not.toHaveBeenCalled();

    H.create.mockRejectedValueOnce(new SinCajaError());
    const r2 = await POST(pedido({}));
    expect(r2.status).toBe(409);
    expect((await r2.json()).code).toBe("sin_caja");
    expect(H.guardar).not.toHaveBeenCalled();
    expect(H.logActivity).not.toHaveBeenCalled();
  });

  it("400 firma_obligatoria sin firma (antes de mover plata)", async () => {
    const r = await POST(pedido({}, { firma: false }));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("firma_obligatoria");
    expect(H.create).not.toHaveBeenCalled();
  });

  it("huella sin consentimiento → 400 falta_consentimiento, sin alta", async () => {
    const r = await POST(pedido({}, { huella: true }));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("falta_consentimiento");
    expect(H.create).not.toHaveBeenCalled();
  });

  it("una imagen que no es imagen → 422 antes del alta", async () => {
    const fd = new FormData();
    fd.append("datos", JSON.stringify({ beneficiarioId: "b1", monto: 120, metodoCaja: "efectivo", idempotencyKey: "clave-0001", firmante: FIRMANTE }));
    fd.append("firma", new Blob([new TextEncoder().encode("no soy png")], { type: "image/png" }), "firma.png");
    const r = await POST(new NextRequest("http://localhost/api/adelantos/entregar", { method: "POST", body: fd }));
    expect(r.status).toBe(422);
    expect(H.create).not.toHaveBeenCalled();
  });

  it("repetido: 200, la caja que dejó el 1.º y sin volver a anotar la firma que ya quedó", async () => {
    H.create.mockResolvedValueOnce({ ...ADELANTO, caja: null, repetido: true });
    H.movAlta.mockResolvedValueOnce({ id: "m-del-primero" });
    H.porIdempotencia.mockResolvedValueOnce([{ id: "f1", tipo: "FIRMA", sha256: "b".repeat(64) }]);
    const r = await POST(pedido({}));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.repetido).toBe(true);
    expect(body.caja).toEqual({ movimientoId: "m-del-primero" });
    expect(body.firma).toEqual({ guardada: true, id: "f1", sha256: "b".repeat(64) });
    expect(H.guardar).not.toHaveBeenCalled();
    expect(H.logActivity).not.toHaveBeenCalled();
  });

  it("repetido SIN firma guardada: reintenta la firma con la misma clave", async () => {
    H.create.mockResolvedValueOnce({ ...ADELANTO, caja: null, repetido: true });
    const r = await POST(pedido({}));
    expect(r.status).toBe(200);
    expect(H.guardar).toHaveBeenCalledTimes(1);
    expect(H.guardar.mock.calls[0][3].clave).toBe("clave-0001");
  });

  it("la respuesta no lleva banco, CCI, dirección ni documento de la ficha", async () => {
    const r = await POST(pedido({}));
    const texto = JSON.stringify(await r.json());
    for (const secreto of ["BCP", "00219300123456789012", "Jr. Secreto", "45678901"]) expect(texto).not.toContain(secreto);
    expect(Object.keys(JSON.parse(texto).adelanto).sort()).toEqual(["codigoOperacion", "fechaAdelanto", "id", "moneda", "monto", "persona"]);
  });

  it("firma no guardada: 201 igual (la plata ya salió) con guardada:false", async () => {
    H.guardar.mockResolvedValueOnce({ firma: { guardada: false, motivo: "No se pudo guardar la imagen." }, huella: null });
    const r = await POST(pedido({}));
    expect(r.status).toBe(201);
    expect((await r.json()).firma.guardada).toBe(false);
  });
});

describe("POST /api/adelantos/entregar — quién", () => {
  it("almacenero y analista: 403 sin tocar la base", async () => {
    for (const role of ["almacenero", "analista"]) {
      H.auth = { tenantId: "t1", username: "x", role };
      const r = await POST(pedido({}));
      expect(r.status).toBe(403);
    }
    expect(H.create).not.toHaveBeenCalled();
  });

  it("sin sesión: 401", async () => {
    H.auth = null;
    expect((await POST(pedido({}))).status).toBe(401);
  });

  it("admin: puede entregar sin firma y sin caja (elige), sin tope del cajero", async () => {
    H.auth = { tenantId: "t1", username: "dueno", role: "admin" };
    H.create.mockResolvedValueOnce({ ...ADELANTO, montoAdelantado: 5000, caja: null });
    const r = await POST(pedido({ monto: 5000, metodoCaja: null }, { firma: false }));
    expect(r.status).toBe(201);
    expect(H.create.mock.calls[0][1]).toMatchObject({ exigirCajaAbierta: false, metodoCaja: null, direccion: "DADO" });
    const body = await r.json();
    expect(body.firma).toBeNull();
    expect(body.caja).toBeNull();
  });

  it("el negocio sale de la sesión, nunca del cuerpo", async () => {
    H.auth = { tenantId: "t-otro", username: "caja2", role: "cajero" };
    await POST(pedido({}));
    expect(H.create.mock.calls[0][0]).toBe("t-otro");
  });
});

describe("ADR-491 security — tope diario, reintento y personas", () => {
  it("tope diario: el alta tira TopeCajeroError → 403 con lo que queda", async () => {
    H.create.mockRejectedValueOnce(new TopeCajeroError(500, 80));
    const r = await POST(pedido({ monto: 120 }));
    expect(r.status).toBe(403);
    const body = await r.json();
    expect(body).toMatchObject({ code: "supera_tope_cajero", tope: 500, queda: 80 });
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("persona inactiva o ajena para el cajero → 400 persona_inexistente", async () => {
    H.create.mockRejectedValueOnce(new Error("Esa persona no existe en este negocio. Elígela de la lista de beneficiarios."));
    const r = await POST(pedido({}));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("persona_inexistente");
  });

  it("el admin no lleva prefijo, ni tope diario, ni filtro de activas", async () => {
    H.auth = { tenantId: "t1", username: "dueno", role: "admin" };
    await POST(pedido({}));
    const input = H.create.mock.calls[0][1] as Record<string, unknown>;
    expect(input).toMatchObject({ idempotencyKey: "clave-0001", soloActivas: false });
    expect(input).not.toHaveProperty("topeCajero");
  });

  it("reintento del cajero sobre un adelanto ANULADO: no agrega firma", async () => {
    H.create.mockResolvedValueOnce({ ...ADELANTO, caja: null, repetido: true, status: "CANCELADO" });
    const r = await POST(pedido({}));
    expect(r.status).toBe(200);
    expect((await r.json()).firma).toMatchObject({ guardada: false });
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("reintento del cajero pasadas 2 h: no agrega firma", async () => {
    H.create.mockResolvedValueOnce({ ...ADELANTO, caja: null, repetido: true, createdAt: new Date(Date.now() - 2 * 3_600_000 - 1000).toISOString() });
    const r = await POST(pedido({}));
    expect((await r.json()).firma).toMatchObject({ guardada: false });
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("reintento del cajero con una firma VIGENTE (p. ej. por enlace): no la reemplaza", async () => {
    H.create.mockResolvedValueOnce({ ...ADELANTO, caja: null, repetido: true });
    H.vigentes.mockResolvedValueOnce({ firma: { id: "f-enlace" }, huella: null });
    const r = await POST(pedido({}));
    expect((await r.json()).firma).toMatchObject({ guardada: false });
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("reintento de un encargado (manager) con firma vigente: tampoco la reemplaza; el admin sí", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    H.create.mockResolvedValueOnce({ ...ADELANTO, caja: null, repetido: true });
    H.vigentes.mockResolvedValueOnce({ firma: { id: "f-enlace" }, huella: null });
    await POST(pedido({}));
    expect(H.guardar).not.toHaveBeenCalled();
    H.auth = { tenantId: "t1", username: "dueno", role: "admin" };
    H.create.mockResolvedValueOnce({ ...ADELANTO, caja: null, repetido: true });
    H.vigentes.mockResolvedValueOnce({ firma: { id: "f-enlace" }, huella: null });
    await POST(pedido({}));
    expect(H.guardar).toHaveBeenCalledTimes(1);
  });
});

describe("ADR-491 reviewer — contrato de la pantalla", () => {
  it("422 idempotencia_distinta trae `existente` (el adelanto que ya quedó con esa clave)", async () => {
    H.create.mockRejectedValueOnce(new IdempotenciaDistintaError("adelanto"));
    H.resumenPorClave.mockResolvedValueOnce({ codigoOperacion: "ADL-2026-0042", monto: 300, moneda: "PEN", persona: "Juan Pérez" });
    const r = await POST(pedido({}));
    expect(r.status).toBe(422);
    const body = await r.json();
    expect(body.code).toBe("idempotencia_distinta");
    expect(body.existente).toEqual({ codigoOperacion: "ADL-2026-0042", monto: 300, moneda: "PEN", persona: "Juan Pérez" });
    /* Se busca con la clave que se guardó (la del cajero lleva prefijo). */
    expect(H.resumenPorClave).toHaveBeenCalledWith("t1", "cajero:clave-0001");
  });

  it("repetido de un alta que pidió caja y no la movió → { sinCaja: true }, no null", async () => {
    H.create.mockResolvedValueOnce({ ...ADELANTO, caja: null, repetido: true });
    H.movAlta.mockResolvedValueOnce(null);
    expect((await (await POST(pedido({}))).json()).caja).toEqual({ sinCaja: true });
  });

  it("monto de 0,001 → 400 (mínimo un céntimo)", async () => {
    expect((await POST(pedido({ monto: 0.001 }))).status).toBe(400);
    expect(H.create).not.toHaveBeenCalled();
  });

  it("`desde` = medianoche de Lima: a las 22:30 de Lima del 10-10 (03:30Z del 11) es 2026-10-10T05:00Z", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T03:30:00Z"));
    try {
      await POST(pedido({}));
      const tc = (H.create.mock.calls[0][1] as { topeCajero: { desde: Date } }).topeCajero;
      expect(tc.desde.toISOString()).toBe("2026-10-10T05:00:00.000Z");
      expect(tc.desde.getTime()).toBeLessThanOrEqual(Date.now());
    } finally {
      vi.useRealTimers();
    }
  });
});
