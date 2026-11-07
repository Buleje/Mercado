/**
 * `POST /api/adelantos/<id>/firmas` con SÓLO la huella (23-10): el botón de la
 * huella en la columna «Recibo» la escanea con la cámara y la guarda sin firma.
 * Vale sólo con el aviso aceptado; el cajero sigue mandando la firma; un
 * reintento con la misma clave devuelve la que ya quedó; reemplazar una huella
 * vigente sólo lo puede el dueño o un administrador; un anulado no se firma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { VERSION_CONSENTIMIENTO_HUELLA } from "@/lib/adelantos/entregar-tipos";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", role: "admin", username: "qaadmin" } as { tenantId: string; role: string; username: string },
  archivos: {} as Record<string, File>,
  textos: {} as Record<string, string>,
  adelanto: { id: "a1", status: "ABIERTO", montoAdelantado: 100, moneda: "PEN", codigoOperacion: "ADL-1", idempotencyKey: null, direccion: "DADO", createdAt: new Date() } as Record<string, unknown> | null,
  ya: [] as { tipo: string; id: string; sha256: string }[],
  vigentes: { firma: null, huella: null } as { firma: unknown; huella: unknown },
  guardar: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/adelantos/imagen-firma.server", () => ({
  leerMultipartFirma: vi.fn(async () => ({ ok: true, archivos: H.archivos, textos: H.textos })),
  jsonDe: (t: string | undefined) => {
    try {
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  },
  imagenesDeFirma: vi.fn(async (a: Record<string, File>) => ({ firma: a.firma ? Buffer.from("f") : null, huella: a.huella ? Buffer.from("h") : null })),
}));
vi.mock("@/lib/adelantos/guardar-en-registro.server", () => ({ guardarEnRegistro: H.guardar }));
vi.mock("@/lib/db/adelantos.db", () => ({ AdelantosDB: { datosParaFirmar: vi.fn(async () => H.adelanto), comprobanteDe: vi.fn() } }));
vi.mock("@/lib/db/adelanto-firmas.db", () => ({
  AdelantoFirmasDB: { porIdempotencia: vi.fn(async () => H.ya), vigentes: vi.fn(async () => H.vigentes), listar: vi.fn() },
}));

const { POST } = await import("@/app/api/adelantos/[id]/firmas/route");
const params = { params: Promise.resolve({ id: "a1" }) };
const imagen = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "huella.jpg", { type: "image/jpeg" });
const datos = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ firmante: { nombre: "Juan Pérez", documento: "12345678" }, idempotencyKey: "clave-de-prueba-01", ...extra });
const enviar = async () => (await POST(new NextRequest("http://localhost/api/adelantos/a1/firmas", { method: "POST" }), params)) as NextResponse;

beforeEach(() => {
  H.auth = { tenantId: "t1", role: "admin", username: "qaadmin" };
  H.archivos = { huella: imagen() };
  H.textos = { datos: datos({ consentimientoHuella: VERSION_CONSENTIMIENTO_HUELLA }) };
  H.adelanto = { id: "a1", status: "ABIERTO", montoAdelantado: 100, moneda: "PEN", codigoOperacion: "ADL-1", idempotencyKey: null, direccion: "DADO", createdAt: new Date() };
  H.ya = [];
  H.vigentes = { firma: null, huella: null };
  H.guardar.mockReset();
  H.guardar.mockImplementation(async (_t: string, _a: unknown, imagenes: { tipo: string }[]) => ({
    firma: imagenes.some((i) => i.tipo === "FIRMA") ? { guardada: true, id: "f1", sha256: "x" } : null,
    huella: imagenes.some((i) => i.tipo === "HUELLA") ? { guardada: true, id: "h1", sha256: "y" } : null,
  }));
});

describe("la huella sola, sin firma", () => {
  it("se guarda como HUELLA con su aviso aceptado → 201", async () => {
    const r = await enviar();
    expect(r.status).toBe(201);
    expect((await r.json()).huella).toMatchObject({ guardada: true });
    const imagenes = H.guardar.mock.calls[0][2] as { tipo: string; consentimiento: string | null }[];
    expect(imagenes).toEqual([expect.objectContaining({ tipo: "HUELLA", consentimiento: VERSION_CONSENTIMIENTO_HUELLA })]);
  });

  it("sin el aviso aceptado no se guarda", async () => {
    H.textos = { datos: datos() };
    const r = await enviar();
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("falta_consentimiento");
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("sin firma ni huella → 400 firma_obligatoria", async () => {
    H.archivos = {};
    const r = await enviar();
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("firma_obligatoria");
  });

  it("el cajero no guarda la huella sola: sigue mandando la firma", async () => {
    H.auth = { tenantId: "t1", role: "cajero", username: "caja" };
    H.textos = { datos: datos({ consentimientoHuella: VERSION_CONSENTIMIENTO_HUELLA, entregaKey: "clave-de-entrega-01" }) };
    const r = await enviar();
    expect(r.status).toBe(400);
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("el reintento con la misma clave devuelve la que ya quedó, sin guardar otra", async () => {
    H.ya = [{ tipo: "HUELLA", id: "h1", sha256: "y" }];
    const r = await enviar();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ firma: null, huella: { guardada: true, id: "h1" }, repetido: true });
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("reemplazar una huella vigente: el encargado no, el dueño sí", async () => {
    H.vigentes = { firma: null, huella: { id: "h0" } };
    H.auth = { tenantId: "t1", role: "manager", username: "encargado" };
    expect((await enviar()).status).toBe(403);
    H.auth = { tenantId: "t1", role: "owner", username: "dueno" };
    expect((await enviar()).status).toBe(201);
  });

  it("en un adelanto anulado no se registra nada", async () => {
    H.adelanto = { ...H.adelanto, status: "CANCELADO" };
    const r = await enviar();
    expect(r.status).toBe(409);
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("si la huella no quedó guardada lo dice (no «la firma»)", async () => {
    H.guardar.mockImplementation(async () => ({ firma: null, huella: { guardada: false } }));
    const r = await enviar();
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/huella/);
  });
});
