// @vitest-environment node
/**
 * Recibo firmado de un adelanto (08-10, revisión independiente): la ruta.
 *
 * PATCH multipart `adjuntarComprobante`: la hoja (DNI + firma + monto) la sube
 * el SERVIDOR a la carpeta privada recién después de validar todo — clave
 * extra 400, no-imagen 422, adelanto ajeno 404, anulado/cambió 409, rol de
 * sólo lectura 403 — y si el compara-y-cambia pierde la carrera, lo subido se
 * borra (sin huérfanas). La actividad no lleva la ruta.
 *
 * GET `/comprobante`: la puerta privada (ajeno 404, sin permiso 403, ruta de
 * otra carpeta 404, binario con `Cache-Control: private`).
 *
 * POST del alta: la foto del comprobante tiene que ser de la carpeta de ESTE
 * negocio en el bucket (422 si no).
 *
 * `environment: node`: el multipart de `NextRequest` necesita el `FormData` de
 * undici, no el de jsdom.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
  comprobanteDe: vi.fn(),
  adjuntar: vi.fn(),
  create: vi.fn(),
  registrarEntrega: vi.fn(),
  subir: vi.fn(),
  bajar: vi.fn(),
  borrar: vi.fn(),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => (H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }))),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => H.logActivity(...(a as [])) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ cacheStore: { get: () => null, set: () => {} } }));
vi.mock("@/lib/adelantos/firma-storage", () => ({
  subirFirmaPrivada: (...a: unknown[]) => H.subir(...a),
  bajarFirmaPrivada: (...a: unknown[]) => H.bajar(...a),
  borrarFirmaPrivada: (...a: unknown[]) => H.borrar(...a),
}));
vi.mock("@/lib/db/adelantos-control.db", () => ({
  AdelantosControlDB: { controlar: vi.fn() },
  AdelantoNoControlableError: class AdelantoNoControlableError extends Error {},
}));
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: {
    comprobanteDe: (...a: unknown[]) => H.comprobanteDe(...a),
    adjuntarComprobante: (...a: unknown[]) => H.adjuntar(...a),
    create: (...a: unknown[]) => H.create(...a),
    registrarEntrega: (...a: unknown[]) => H.registrarEntrega(...a),
  },
  AdelantoConLiquidacionError: class extends Error {},
  AdelantoNoCancelableError: class extends Error {},
  DireccionNoCorregibleError: class extends Error {},
  ReglaDeRecibidoError: class extends Error {},
  ContratoInvalidoError: class extends Error {},
  IdempotenciaDistintaError: class extends Error {},
}));

import { PATCH } from "@/app/api/adelantos/[id]/route";
import { GET as GET_COMPROBANTE } from "@/app/api/adelantos/[id]/comprobante/route";
import { POST } from "@/app/api/adelantos/route";
import { POST as POST_ENTREGA } from "@/app/api/adelantos/[id]/entregas/route";

let PNG: Buffer;
const RUTA_OK = /^t1\/adelantos\/a1\/\d{13}-firma-recibo-[a-f0-9]{16}\.webp$/;

function firmar(campos: Record<string, string>, archivo: Blob | null = new Blob([new Uint8Array(PNG)], { type: "image/png" }), id = "a1") {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  if (archivo) fd.append("file", archivo, "recibo-firmado.png");
  return PATCH(new NextRequest(`http://localhost/api/adelantos/${id}`, { method: "PATCH", body: fd }), { params: Promise.resolve({ id }) });
}
const verComprobante = (id = "a1") =>
  GET_COMPROBANTE(new NextRequest(`http://localhost/api/adelantos/${id}/comprobante?v=x`), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  PNG ??= await sharp({ create: { width: 40, height: 20, channels: 3, background: "white" } }).png().toBuffer();
  /* El adelanto a1 es de t1, abierto y sin foto; cualquier otro (o de otro negocio) no existe. */
  H.comprobanteDe.mockImplementation(async (tenantId: string, id: string) =>
    tenantId === "t1" && id === "a1" ? { status: "ACTIVO", comprobanteUrl: null } : null,
  );
  H.adjuntar.mockResolvedValue("ok");
  H.subir.mockResolvedValue({ ok: true });
  H.borrar.mockResolvedValue(undefined);
  H.create.mockResolvedValue({ id: "n1", direccion: "DADO" });
  H.registrarEntrega.mockResolvedValue({ id: "a1", saldoPendiente: 50 });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
});

describe("PATCH adjuntarComprobante — la hoja la sube el servidor, a lo privado", () => {
  it("feliz: sube a la carpeta privada del adelanto y guarda `priv:<ruta>`; la actividad no lleva la ruta", async () => {
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(200);
    const ruta = H.subir.mock.calls[0][0] as string;
    expect(ruta).toMatch(RUTA_OK);
    const cuerpo = H.subir.mock.calls[0][1] as Buffer;
    expect((await sharp(cuerpo).metadata()).format).toBe("webp");
    expect(H.adjuntar).toHaveBeenCalledWith("t1", "a1", `priv:${ruta}`, null);
    expect(await r.json()).toEqual({ id: "a1", comprobanteUrl: `priv:${ruta}` });
    const detalle = String((H.logActivity.mock.calls[0] as unknown[])[2]);
    expect(detalle).not.toMatch(/priv:|https?:|adelantos\//);
    expect(H.borrar).not.toHaveBeenCalled();
  });

  it("400 con una clave extra (p. ej. la URL del contrato viejo) — no sube nada", async () => {
    const r = await firmar({ action: "adjuntarComprobante", anterior: "", comprobanteUrl: "https://evil.com/x.webp" });
    expect(r.status).toBe(400);
    expect(H.subir).not.toHaveBeenCalled();
    expect(H.adjuntar).not.toHaveBeenCalled();
  });

  it("400 con el JSON viejo `{ comprobanteUrl }`: ya no se acepta una URL", async () => {
    const r = await PATCH(
      new NextRequest("http://localhost/api/adelantos/a1", {
        method: "PATCH",
        body: JSON.stringify({ action: "adjuntarComprobante", comprobanteUrl: "https://x.supabase.co/storage/v1/object/public/media/t2/media/1-a.webp", anterior: null }),
      }),
      { params: Promise.resolve({ id: "a1" }) },
    );
    expect(r.status).toBe(400);
    expect(H.adjuntar).not.toHaveBeenCalled();
  });

  it("422 si el archivo no es una imagen (aunque diga image/png) — no sube nada", async () => {
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" }, new Blob(["<html>hola</html>"], { type: "image/png" }));
    expect(r.status).toBe(422);
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("422 si declara otro tipo (PDF)", async () => {
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" }, new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    expect(r.status).toBe(422);
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("404 con el adelanto de otro negocio — se busca con el tenant del JWT y no sube nada", async () => {
    H.auth = { tenantId: "t2", username: "intruso", role: "admin" };
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(404);
    expect(H.comprobanteDe).toHaveBeenCalledWith("t2", "a1");
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("409 «anulado» antes de subir", async () => {
    H.comprobanteDe.mockResolvedValue({ status: "CANCELADO", comprobanteUrl: null });
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("anulado");
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("409 «cambio» si la foto ya no es la que se vio al firmar — antes de subir", async () => {
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: "priv:t1/adelantos/a1/1728000000000-firma-recibo-abcdef12.webp" });
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("cambio");
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("409 «cambio» si pierde la carrera en el compara-y-cambia: lo subido se BORRA", async () => {
    H.adjuntar.mockResolvedValue("cambio");
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(409);
    expect(H.borrar).toHaveBeenCalledWith(H.subir.mock.calls[0][0]);
    expect(H.logActivity).not.toHaveBeenCalled();
  });

  it("409 «anulado» en la carrera también borra lo subido", async () => {
    H.adjuntar.mockResolvedValue("anulado");
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("anulado");
    expect(H.borrar).toHaveBeenCalledTimes(1);
  });

  it("403 con un rol de sólo lectura (analista) — ni lee ni sube", async () => {
    H.auth = { tenantId: "t1", username: "ana", role: "analista" };
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(403);
    expect(H.comprobanteDe).not.toHaveBeenCalled();
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("401 sin sesión", async () => {
    H.auth = null;
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(401);
  });
});

describe("PATCH adjuntarComprobante — reemplazar lo que ya tiene (auditoría 08-10)", () => {
  const VOUCHER = "https://x.supabase.co/storage/v1/object/public/media/t1/media/1728000000000-voucher.webp";
  const FIRMA_VIEJA = "priv:t1/adelantos/a1/1728000000000-firma-recibo-abcdef12.webp";

  it("403 si un encargado (manager) quiere reemplazar un recibo YA FIRMADO — no sube ni toca la columna", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: FIRMA_VIEJA });
    const r = await firmar({ action: "adjuntarComprobante", anterior: FIRMA_VIEJA });
    expect(r.status).toBe(403);
    expect((await r.json()).message).toMatch(/administrador o el dueño pueden reemplazar/);
    expect(H.subir).not.toHaveBeenCalled();
    expect(H.adjuntar).not.toHaveBeenCalled();
  });

  it("el encargado SÍ firma sobre el voucher del alta (primera firma) y la actividad guarda el voucher", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: VOUCHER });
    const r = await firmar({ action: "adjuntarComprobante", anterior: VOUCHER });
    expect(r.status).toBe(200);
    expect(String((H.logActivity.mock.calls[0] as unknown[])[2])).toContain(`anterior: ${VOUCHER}`);
  });

  it("el encargado SÍ firma uno sin foto (la primera vez), y el compara-y-cambia exige que siga vacía", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" });
    expect(r.status).toBe(200);
    expect(H.adjuntar).toHaveBeenCalledWith("t1", "a1", expect.stringMatching(/^priv:/), null);
  });

  it("el admin reemplaza: la actividad guarda la referencia a la anterior (no la nueva)", async () => {
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: FIRMA_VIEJA });
    const r = await firmar({ action: "adjuntarComprobante", anterior: FIRMA_VIEJA });
    expect(r.status).toBe(200);
    expect(H.adjuntar).toHaveBeenCalledWith("t1", "a1", expect.stringMatching(/^priv:/), FIRMA_VIEJA);
    const detalle = String((H.logActivity.mock.calls[0] as unknown[])[2]);
    expect(detalle).toContain(`anterior: ${FIRMA_VIEJA}`);
    expect(detalle).not.toContain(H.subir.mock.calls[0][0] as string);
  });

  it("el dueño (owner) también reemplaza el voucher", async () => {
    H.auth = { tenantId: "t1", username: "dueno", role: "owner" };
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: VOUCHER });
    expect((await firmar({ action: "adjuntarComprobante", anterior: VOUCHER })).status).toBe(200);
    expect(String((H.logActivity.mock.calls[0] as unknown[])[2])).toContain(`anterior: ${VOUCHER}`);
  });

  it("anulado da 409 antes que el 403 (lo que de verdad lo frena)", async () => {
    H.auth = { tenantId: "t1", username: "enc", role: "manager" };
    H.comprobanteDe.mockResolvedValue({ status: "CANCELADO", comprobanteUrl: VOUCHER });
    const r = await firmar({ action: "adjuntarComprobante", anterior: VOUCHER });
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe("anulado");
  });
});

describe("PATCH adjuntarComprobante — la imagen (auditoría 08-10)", () => {
  it("422 con más de 12 MP (un PNG chico que se abre enorme) — no sube nada", async () => {
    const grande = await sharp({ create: { width: 1000, height: 12_100, channels: 3, background: "white" } }).png().toBuffer();
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" }, new Blob([new Uint8Array(grande)], { type: "image/png" }));
    expect(r.status).toBe(422);
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("422 con un JPEG cortado a la mitad — no sube nada", async () => {
    const jpg = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).jpeg().toBuffer();
    const cortado = jpg.subarray(0, Math.floor(jpg.length / 2));
    const r = await firmar({ action: "adjuntarComprobante", anterior: "" }, new Blob([new Uint8Array(cortado)], { type: "image/jpeg" }));
    expect(r.status).toBe(422);
    expect(H.subir).not.toHaveBeenCalled();
  });
});

describe("GET /api/adelantos/[id]/comprobante — la puerta privada", () => {
  const PRIV = "t1/adelantos/a1/1728000000000-firma-recibo-abcdef1234.webp";

  it("200 con el binario, privado, sin guardarse en disco y sin incrustarse desde otro sitio", async () => {
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: `priv:${PRIV}` });
    H.bajar.mockResolvedValue(Buffer.from([1, 2, 3]));
    const r = await verComprobante();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(H.bajar).toHaveBeenCalledWith(PRIV);
    expect(H.logActivity).toHaveBeenCalledTimes(1);
  });

  it("404 con el adelanto de otro negocio", async () => {
    H.auth = { tenantId: "t2", username: "intruso", role: "admin" };
    const r = await verComprobante();
    expect(r.status).toBe(404);
    expect(H.comprobanteDe).toHaveBeenCalledWith("t2", "a1");
    expect(H.bajar).not.toHaveBeenCalled();
  });

  it("404 si la ruta guardada no es de la carpeta de ESTE adelanto", async () => {
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: "priv:t2/adelantos/a1/1728000000000-firma-recibo-abcdef1234.webp" });
    const r = await verComprobante();
    expect(r.status).toBe(404);
    expect(H.bajar).not.toHaveBeenCalled();
  });

  it("403 sin permiso de leer adelantos (cajero)", async () => {
    H.auth = { tenantId: "t1", username: "caja", role: "cajero" };
    const r = await verComprobante();
    expect(r.status).toBe(403);
    expect(H.comprobanteDe).not.toHaveBeenCalled();
  });

  it("el analista (sólo lectura) SÍ la ve", async () => {
    H.auth = { tenantId: "t1", username: "ana", role: "analista" };
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: `priv:${PRIV}` });
    H.bajar.mockResolvedValue(Buffer.from([1]));
    expect((await verComprobante()).status).toBe(200);
  });

  it("voucher viejo del bucket público: 302 sólo si es de este negocio", async () => {
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: "https://x.supabase.co/storage/v1/object/public/media/t1/media/1728000000000-voucher.webp" });
    const ok = await verComprobante();
    expect(ok.status).toBe(302);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    H.comprobanteDe.mockResolvedValue({ status: "ACTIVO", comprobanteUrl: "https://evil.com/x.webp" });
    expect((await verComprobante()).status).toBe(404);
  });
});

describe("POST /api/adelantos — la foto del alta tiene que ser de este negocio", () => {
  const alta = (body: unknown) => POST(new NextRequest("http://localhost/api/adelantos", { method: "POST", body: JSON.stringify(body) }));
  const base = { beneficiarioId: "b1", montoAdelantado: 100 };

  it("422 con la foto de otro negocio o de otro sitio", async () => {
    for (const url of [
      "https://x.supabase.co/storage/v1/object/public/media/t2/media/1728000000000-voucher.webp",
      "https://evil.com/storage/v1/object/public/media/t1/media/1728000000000-voucher.webp",
      "https://x.supabase.co/storage/v1/object/public/media/t1/media/%2e%2e/%2e%2e/t2/media/1728000000000-v.webp",
    ]) {
      const r = await alta({ ...base, comprobanteUrl: url });
      expect(r.status, url).toBe(422);
    }
    expect(H.create).not.toHaveBeenCalled();
  });

  it("pasa con la foto que acaba de subir /api/upload, y sin foto", async () => {
    const r = await alta({ ...base, comprobanteUrl: "https://x.supabase.co/storage/v1/object/public/media/t1/media/1728000000000-voucher_yape.webp" });
    expect(r.status).toBe(201);
    expect((await alta(base)).status).toBe(201);
    expect(H.create).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/adelantos/[id]/entregas — la foto de la entrega, igual que la del alta (auditoría 08-10)", () => {
  const entrega = (body: unknown, id = "a1") =>
    POST_ENTREGA(new NextRequest(`http://localhost/api/adelantos/${id}/entregas`, { method: "POST", body: JSON.stringify(body) }), {
      params: Promise.resolve({ id }),
    });
  const base = { tipo: "LIBRE", valorManual: 50 };

  it.each([
    ["javascript:alert(1)"],
    ["data:image/png;base64,AAAA"],
    ["priv:t1/adelantos/a1/1728000000000-firma-recibo-abcdef12.webp"],
    ["https://evil.com/storage/v1/object/public/media/t1/media/1728000000000-v.webp"],
    ["https://x.supabase.co/storage/v1/object/public/media/t2/media/1728000000000-v.webp"],
  ])("422 `foto_ajena` con %s — no registra la entrega", async (url) => {
    const r = await entrega({ ...base, comprobanteUrl: url });
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe("foto_ajena");
    expect(H.registrarEntrega).not.toHaveBeenCalled();
  });

  it("pasa con la foto que subió /api/upload a la carpeta de este negocio, y sin foto", async () => {
    const foto = "https://x.supabase.co/storage/v1/object/public/media/t1/media/1728000000000-voucher.webp";
    expect((await entrega({ ...base, comprobanteUrl: foto })).status).toBe(201);
    expect((await entrega(base)).status).toBe(201);
    expect(H.registrarEntrega).toHaveBeenCalledTimes(2);
    expect(H.registrarEntrega.mock.calls[0][0]).toBe("t1");
  });
});
