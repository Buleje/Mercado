// @vitest-environment node
/**
 * ADR-491 — enlace de firma de un uso.
 *
 * - La base guarda el sha256 del token, NUNCA el token; GET no lo devuelve.
 * - Un uso: dos POST a la vez → uno 200, el otro 409 (y borra lo que subió).
 * - Vencido / revocado → 410; anulado / usado → 409; token mal formado → 404
 *   sin tocar la base.
 * - DNI distinto: suma un intento y revoca a los 5.
 * - La respuesta pública no lleva ids.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const H = vi.hoisted(() => ({
  tx: {
    adelanto: { findFirst: vi.fn() },
    adelantoEnlaceFirma: { updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    adelantoFirma: { create: vi.fn() },
  },
  findMany: vi.fn(),
  adelantoFindFirst: vi.fn(),
  updateMany: vi.fn(),
  enlaceFindFirst: vi.fn(),
  findUnique: vi.fn(),
  // ruta pública
  enlacePorToken: vi.fn(),
  firmarPorEnlace: vi.fn(),
  sumarIntentoFallido: vi.fn(),
  subir: vi.fn(),
  borrar: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: typeof H.tx) => unknown) => fn(H.tx),
    adelanto: { findFirst: (...a: unknown[]) => H.adelantoFindFirst(...a) },
    adelantoEnlaceFirma: {
      findMany: (...a: unknown[]) => H.findMany(...a),
      updateMany: (...a: unknown[]) => H.updateMany(...a),
      findFirst: (...a: unknown[]) => H.enlaceFindFirst(...a),
      findUnique: (...a: unknown[]) => H.findUnique(...a),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));

import { AdelantoFirmasDB, estadoDeEnlace } from "@/lib/db/adelanto-firmas.db";
import { hashToken, TOKEN_RE } from "@/lib/adelantos/registro-firmas";
import { MAX_INTENTOS_DNI_ENLACE } from "@/lib/adelantos/entregar-tipos";

describe("crearEnlace / listarEnlaces", () => {
  beforeEach(() => {
    H.tx.adelanto.findFirst.mockReset().mockResolvedValue({ status: "ABIERTO", beneficiario: { nombre: "Juan Pérez", documento: "DNI 45678901" } });
    H.tx.adelantoEnlaceFirma.updateMany.mockReset().mockResolvedValue({ count: 1 });
    H.tx.adelantoEnlaceFirma.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "e1", pideHuella: data.pideHuella, venceEn: data.venceEn, usadoEn: null, revocadoEn: null, creadoPor: data.creadoPor, createdAt: new Date(),
    }));
  });

  it("guarda el sha256, nunca el token; el token sale una vez y tiene 256 bits", async () => {
    const r = await AdelantoFirmasDB.crearEnlace("t1", "a1", { creadoPor: "dueno", pideHuella: false, horas: 48 });
    if (typeof r === "string") throw new Error(r);
    expect(r.token).toMatch(TOKEN_RE);
    const data = H.tx.adelantoEnlaceFirma.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.tokenHash).toBe(hashToken(r.token));
    expect(JSON.stringify(data)).not.toContain(r.token);
    expect(data).toMatchObject({ tenantId: "t1", adelantoId: "a1", firmanteNombre: "Juan Pérez", firmanteDocumento: "45678901" });
    expect((data.venceEn as Date).getTime() - Date.now()).toBeGreaterThan(47.9 * 3_600_000);
    expect(JSON.stringify(r.enlace)).not.toContain(r.token);
  });

  it("revoca los pendientes del mismo adelanto en la misma transacción", async () => {
    await AdelantoFirmasDB.crearEnlace("t1", "a1", { creadoPor: "dueno", pideHuella: true, horas: 2 });
    expect(H.tx.adelantoEnlaceFirma.updateMany.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t1", adelantoId: "a1", usadoEn: null, revocadoEn: null } });
  });

  it("adelanto de otro negocio → no-existe; anulado → anulado (sin crear)", async () => {
    H.tx.adelanto.findFirst.mockResolvedValueOnce(null);
    expect(await AdelantoFirmasDB.crearEnlace("t1", "a-ajeno", { creadoPor: "x", pideHuella: false, horas: 48 })).toBe("no-existe");
    expect(H.tx.adelanto.findFirst.mock.calls[0][0].where).toEqual({ id: "a-ajeno", tenantId: "t1" });
    H.tx.adelanto.findFirst.mockResolvedValueOnce({ status: "CANCELADO", beneficiario: { nombre: "J", documento: null } });
    expect(await AdelantoFirmasDB.crearEnlace("t1", "a1", { creadoPor: "x", pideHuella: false, horas: 48 })).toBe("anulado");
    expect(H.tx.adelantoEnlaceFirma.create).not.toHaveBeenCalled();
  });

  it("listarEnlaces no pide ni devuelve el hash", async () => {
    H.adelantoFindFirst.mockResolvedValueOnce({ status: "ABIERTO" });
    H.findMany.mockResolvedValueOnce([{ id: "e1", pideHuella: false, venceEn: new Date(Date.now() + 3_600_000), usadoEn: null, revocadoEn: null, creadoPor: "dueno", createdAt: new Date() }]);
    const r = await AdelantoFirmasDB.listarEnlaces("t1", "a1");
    expect(Object.keys(H.findMany.mock.calls[0][0].select)).not.toContain("tokenHash");
    expect(Object.keys(r[0]).sort()).toEqual(["creadoEn", "creadoPor", "estado", "id", "pideHuella", "usadoEn", "venceEn"]);
    expect(r[0].estado).toBe("pendiente");
  });
});

describe("estadoDeEnlace", () => {
  const base = { usadoEn: null, revocadoEn: null, venceEn: new Date(Date.now() + 60_000) };
  it("usado > revocado > anulado > vencido > pendiente", () => {
    expect(estadoDeEnlace(base, "ABIERTO")).toBe("pendiente");
    expect(estadoDeEnlace({ ...base, venceEn: new Date(Date.now() - 1) }, "ABIERTO")).toBe("vencido");
    expect(estadoDeEnlace(base, "CANCELADO")).toBe("anulado");
    expect(estadoDeEnlace({ ...base, revocadoEn: new Date() }, "CANCELADO")).toBe("revocado");
    expect(estadoDeEnlace({ ...base, usadoEn: new Date(), revocadoEn: new Date() }, "CANCELADO")).toBe("usado");
  });
});

describe("firmarPorEnlace — un uso", () => {
  beforeEach(() => {
    H.tx.adelantoEnlaceFirma.updateMany.mockReset();
    H.tx.adelantoEnlaceFirma.findFirst.mockReset();
    H.tx.adelantoFirma.create.mockReset().mockResolvedValue({ id: "f1" });
  });
  const FILA = {
    adelantoId: "a1", tipo: "FIRMA" as const, canal: "ENLACE" as const, firmanteNombre: "Juan", firmanteDocumento: "45678901",
    ruta: "t1/adelantos/a1/registro/1760000000000-firma-0123456789abcdef.webp", sha256: "a".repeat(64), bytes: 10, montoFirmado: 120, monedaFirmada: "PEN",
  };

  it("el CAS gana: marca usado y anota en la MISMA transacción, canal ENLACE con el enlace", async () => {
    H.tx.adelantoEnlaceFirma.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await AdelantoFirmasDB.firmarPorEnlace("t1", "e1", [FILA])).toBe("ok");
    const where = H.tx.adelantoEnlaceFirma.updateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", id: "e1", usadoEn: null, revocadoEn: null, intentosFallidos: { lt: MAX_INTENTOS_DNI_ENLACE }, adelanto: { status: { not: "CANCELADO" } } });
    expect(H.tx.adelantoFirma.create.mock.calls[0][0].data).toMatchObject({ tenantId: "t1", canal: "ENLACE", enlaceId: "e1" });
  });

  it("el CAS pierde (otro firmó primero): «usado» sin anotar nada", async () => {
    H.tx.adelantoEnlaceFirma.updateMany.mockResolvedValueOnce({ count: 0 });
    H.tx.adelantoEnlaceFirma.findFirst.mockResolvedValueOnce({ usadoEn: new Date(), revocadoEn: null, venceEn: new Date(Date.now() + 1e6), intentosFallidos: 0, adelanto: { status: "ABIERTO" } });
    expect(await AdelantoFirmasDB.firmarPorEnlace("t1", "e1", [FILA])).toBe("usado");
    expect(H.tx.adelantoFirma.create).not.toHaveBeenCalled();
  });

  it("DNI acertado en paralelo con 5 fallidos: el CAS no pasa y vuelve «revocado»", async () => {
    H.tx.adelantoEnlaceFirma.updateMany.mockResolvedValueOnce({ count: 0 });
    H.tx.adelantoEnlaceFirma.findFirst.mockResolvedValueOnce({ usadoEn: null, revocadoEn: null, venceEn: new Date(Date.now() + 1e6), intentosFallidos: MAX_INTENTOS_DNI_ENLACE, adelanto: { status: "ABIERTO" } });
    expect(await AdelantoFirmasDB.firmarPorEnlace("t1", "e1", [FILA])).toBe("revocado");
    expect(H.tx.adelantoFirma.create).not.toHaveBeenCalled();
  });
});

describe("sumarIntentoFallido", () => {
  it(`suma uno y revoca al llegar a ${MAX_INTENTOS_DNI_ENLACE}`, async () => {
    H.updateMany.mockReset().mockResolvedValue({ count: 1 });
    H.enlaceFindFirst.mockReset().mockResolvedValueOnce({ revocadoEn: new Date() });
    expect(await AdelantoFirmasDB.sumarIntentoFallido("t1", "e1")).toEqual({ revocado: true });
    expect(H.updateMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: "t1", id: "e1", usadoEn: null, revocadoEn: null, intentosFallidos: { lt: MAX_INTENTOS_DNI_ENLACE } },
      data: { intentosFallidos: { increment: 1 } },
    });
    expect(H.updateMany.mock.calls[1][0].where).toMatchObject({ tenantId: "t1", id: "e1", revocadoEn: null, intentosFallidos: { gte: MAX_INTENTOS_DNI_ENLACE } });
  });
});

describe("enlacePorToken / vistaPublica", () => {
  it("token mal formado: null sin tocar la base", async () => {
    H.findUnique.mockReset();
    expect(await AdelantoFirmasDB.enlacePorToken("corto")).toBeNull();
    expect(await AdelantoFirmasDB.vistaPublica("../../etc")).toBeNull();
    expect(H.findUnique).not.toHaveBeenCalled();
  });

  it("busca por el hash; fuera de «pendiente» la vista no muestra monto ni persona", async () => {
    const token = "A".repeat(43);
    H.findUnique.mockReset().mockResolvedValueOnce({
      pideHuella: false, firmanteNombre: "Juan Pérez", firmanteDocumento: "45678901", venceEn: new Date(Date.now() - 1), usadoEn: null, revocadoEn: null,
      adelanto: { status: "ABIERTO", montoAdelantado: 120, moneda: "PEN", codigoOperacion: "ADL-1", fechaAdelanto: new Date(), direccion: "DADO" },
      tenant: { name: "Bodega" },
    });
    const v = await AdelantoFirmasDB.vistaPublica(token);
    expect(H.findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashToken(token) });
    expect(v?.estado).toBe("vencido");
    expect(JSON.stringify(v)).not.toMatch(/Juan|120|ADL-1|45678901/);
  });

  it("pendiente: monto en letras, DNI enmascarado", async () => {
    H.findUnique.mockReset().mockResolvedValueOnce({
      pideHuella: true, firmanteNombre: "Juan Pérez", firmanteDocumento: "45678901", venceEn: new Date(Date.now() + 1e6), usadoEn: null, revocadoEn: null,
      adelanto: { status: "ABIERTO", montoAdelantado: 120, moneda: "PEN", codigoOperacion: "ADL-1", fechaAdelanto: new Date("2026-10-10T15:00:00Z"), direccion: "DADO" },
      tenant: { name: "Bodega" },
    });
    const v = await AdelantoFirmasDB.vistaPublica("B".repeat(43));
    expect(v).toMatchObject({ estado: "pendiente", negocio: "Bodega", monto: 120, montoEnLetras: "Son: ciento veinte con 00/100 soles", documentoFinal: "•••••901", pideDocumento: false, pideHuella: true });
    expect(JSON.stringify(v)).not.toContain("45678901");
  });
});

describe("POST /api/public/adelantos/[token]/firmar", () => {
  let PNG: Buffer;
  beforeAll(async () => {
    PNG = await sharp({ create: { width: 60, height: 30, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  });
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/db/adelanto-firmas.db", () => ({
      AdelantoFirmasDB: {
        enlacePorToken: (...a: unknown[]) => H.enlacePorToken(...a),
        firmarPorEnlace: (...a: unknown[]) => H.firmarPorEnlace(...a),
        sumarIntentoFallido: (...a: unknown[]) => H.sumarIntentoFallido(...a),
      },
    }));
    vi.doMock("@/lib/adelantos/guardar-en-registro.server", () => ({
      subirParaRegistro: (...a: unknown[]) => H.subir(...a),
      borrarSubidas: (...a: unknown[]) => H.borrar(...a),
    }));
    H.enlacePorToken.mockReset().mockResolvedValue({
      enlaceId: "e1", tenantId: "t-secreto", adelantoId: "a-secreto", estado: "pendiente", pideHuella: false, documentoEsperado: "45678901",
      firmanteNombre: "Juan", creadoPor: "dueno", montoAdelantado: 120, moneda: "PEN", codigoOperacion: "ADL-2026-0001",
    });
    H.firmarPorEnlace.mockReset();
    H.sumarIntentoFallido.mockReset().mockResolvedValue({ revocado: false });
    H.subir.mockReset().mockImplementation(async (_t: string, _a: string, tipo: string) => ({ ruta: `t-secreto/adelantos/a-secreto/registro/1-${tipo}-0123456789abcdef.webp`, sha256: "a".repeat(64), bytes: 10 }));
    H.borrar.mockReset();
  });
  const TOKEN = "T".repeat(43);
  const pedido = (datos: Record<string, unknown> = {}, token = TOKEN) => {
    const fd = new FormData();
    fd.append("datos", JSON.stringify({ firmante: { nombre: "Juan Pérez", documento: "45678901" }, ...datos }));
    fd.append("firma", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "firma.png");
    return [new NextRequest(`http://localhost/api/public/adelantos/${token}/firmar`, { method: "POST", body: fd }), { params: Promise.resolve({ token }) }] as const;
  };
  const POST = async (...a: Parameters<typeof import("@/app/api/public/adelantos/[token]/firmar/route").POST>) =>
    (await import("@/app/api/public/adelantos/[token]/firmar/route")).POST(...a);

  it("200 sin ids; dos a la vez → uno 200 y el otro 409 (borra lo que subió)", async () => {
    H.firmarPorEnlace.mockResolvedValueOnce("ok").mockResolvedValueOnce("usado");
    const [a, b] = await Promise.all([POST(...pedido()), POST(...pedido())]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const ok = a.status === 200 ? a : b;
    const texto = await ok.text();
    expect(Object.keys(JSON.parse(texto)).sort()).toEqual(["codigoOperacion", "firmadoEn", "ok"]);
    expect(texto).not.toMatch(/secreto|e1/);
    expect(H.borrar).toHaveBeenCalledTimes(1);
    const filas = H.firmarPorEnlace.mock.calls[0][2] as { canal: string; enlaceId: string; idempotencyKey: string }[];
    expect(filas[0]).toMatchObject({ canal: "ENLACE", enlaceId: "e1", idempotencyKey: "enlace:e1:FIRMA" });
  });

  it("token mal formado → 404 sin tocar la base", async () => {
    const r = await POST(...pedido({}, "abc"));
    expect(r.status).toBe(404);
    expect((await r.json()).code).toBe("no_encontrado");
    expect(H.enlacePorToken).not.toHaveBeenCalled();
  });

  it.each([
    ["vencido", 410],
    ["revocado", 410],
    ["usado", 409],
    ["anulado", 409],
  ])("%s → %i sin subir nada", async (estado, status) => {
    H.enlacePorToken.mockResolvedValueOnce({ ...(await H.enlacePorToken.getMockImplementation()?.()), estado } as never);
    const r = await POST(...pedido());
    expect(r.status).toBe(status);
    expect((await r.json()).code).toBe(estado);
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("DNI distinto: 422, suma el intento y no sube nada; al revocarse lo dice", async () => {
    const r = await POST(...pedido({ firmante: { nombre: "Juan Pérez", documento: "11111111" } }));
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe("dni_no_coincide");
    expect(H.sumarIntentoFallido).toHaveBeenCalledWith("t-secreto", "e1");
    expect(H.subir).not.toHaveBeenCalled();
    H.sumarIntentoFallido.mockResolvedValueOnce({ revocado: true });
    const r2 = await POST(...pedido({ firmante: { nombre: "Juan Pérez", documento: "11111111" } }));
    expect((await r2.json()).error).toMatch(/se bloqueó/);
  });

  it("pide huella y no vino → 422 falta_huella", async () => {
    H.enlacePorToken.mockResolvedValueOnce({ ...(await H.enlacePorToken.getMockImplementation()?.()), pideHuella: true } as never);
    const r = await POST(...pedido());
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe("falta_huella");
  });
});
