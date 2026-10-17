// @vitest-environment node
/**
 * POST /api/admin/camaras/[id]/persona con `cajas` (ADR-479): la carga vieja
 * (sin cajas) se sigue aceptando, la nueva llega al Drive con la firma de la
 * ropa calculada en el SERVIDOR (sharp real sobre una foto sintética) y un
 * JSON roto se rechaza con 400 sin guardar nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const H = vi.hoisted(() => ({
  payload: { username: "qa-admin", role: "admin", tenantId: "t-qa" } as { username: string; role: string; tenantId: string },
  guardar: vi.fn(),
}));

vi.mock("next/server", async (real) => ({ ...(await real<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null), createRateLimiter: vi.fn(() => ({})) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/db/camaras.db", () => ({ CamarasDB: { list: async () => [{ id: "cam-1", nombre: "Patio" }] } }));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: {} }));
vi.mock("@/lib/documents/storage", () => ({ buildStoragePath: vi.fn(), uploadToStorage: vi.fn() }));
vi.mock("@/lib/camaras/avisar", () => ({ avisarPersonaDelMosaico: vi.fn(async () => undefined) }));
vi.mock("@/lib/camaras/personas-drive.server", async (real) => ({
  ...(await real<typeof import("@/lib/camaras/personas-drive.server")>()),
  guardarFotoPersona: (...a: unknown[]) => H.guardar(...a),
}));

import { POST } from "@/app/api/admin/camaras/[id]/persona/route";

/** 856×480 (lo que guarda Blas) con una persona: cara, polo rojo y jean, en x 0,4 · y 0,2 · 0,1 × 0,5. */
async function fotoConPersona(): Promise<Buffer> {
  const W = 856;
  const Hh = 480;
  const px = Buffer.alloc(W * Hh * 3, 120);
  const [x0, y0, w, h] = [342, 96, 86, 240];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const f = (y - y0) / h;
      const c = f < 0.18 ? [190, 140, 110] : f < 0.55 ? [200, 30, 30] : [40, 60, 150];
      px.set(c, (y * W + x) * 3);
    }
  }
  return sharp(px, { raw: { width: W, height: Hh, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

async function enviar(extra: Record<string, string>, foto?: Buffer) {
  const { personas = "1", ...resto } = extra;
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(foto ?? (await fotoConPersona()))], "p.jpg", { type: "image/jpeg" }));
  fd.append("motivo", "aparecio");
  fd.append("personas", personas);
  fd.append("confianza", "0.62");
  for (const [k, v] of Object.entries(resto)) fd.append(k, v);
  const req = new NextRequest("http://localhost/api/admin/camaras/cam-1/persona", {
    method: "POST",
    headers: { cookie: "buleje-admin-sess=token-falso" },
    body: fd,
  });
  return POST(req, { params: Promise.resolve({ id: "cam-1" }) });
}

describe("foto de persona con cajas", () => {
  beforeEach(() => {
    H.guardar.mockReset();
    H.guardar.mockResolvedValue({ ok: true, documentId: "doc-1", carpetaId: "car-1" });
  });

  it("sin `cajas` (cliente viejo): se guarda igual, sin cajas", async () => {
    const r = await enviar({});
    expect(r.status).toBe(200);
    expect(H.guardar).toHaveBeenCalledTimes(1);
    expect(H.guardar.mock.calls[0][1]).toMatchObject({ cajas: null, meta: { motivo: "aparecio", personas: 1 } });
  });

  it("con `cajas`: el servidor calcula la firma de la ropa y la guarda con la foto", async () => {
    const r = await enviar({ cajas: JSON.stringify([{ x: 0.4, y: 0.2, ancho: 0.1, alto: 0.5, confianza: 0.62 }]) });
    expect(r.status).toBe(200);
    const cajas = H.guardar.mock.calls[0][1].cajas as { firma: string | null; chaleco: boolean | null }[];
    expect(cajas).toHaveLength(1);
    expect(cajas[0]).toMatchObject({ x: 0.4, y: 0.2, ancho: 0.1, alto: 0.5, confianza: 0.62, chaleco: false });
    expect(cajas[0].firma).toMatch(/^[0-9a-f]{24}$/);
    // Rojo (casillero 0) manda en el torso; azul (casillero 5) en las piernas.
    expect(cajas[0].firma?.[0]).toBe("f");
    expect(cajas[0].firma?.[12 + 5]).toBe("f");
  });

  it("una caja chica (persona lejana) queda sin firma, pero la foto se guarda", async () => {
    const r = await enviar({ cajas: JSON.stringify([{ x: 0.05, y: 0.05, ancho: 0.02, alto: 0.05, confianza: 0.55 }]) });
    expect(r.status).toBe(200);
    expect(H.guardar.mock.calls[0][1].cajas).toEqual([
      { x: 0.05, y: 0.05, ancho: 0.02, alto: 0.05, confianza: 0.55, firma: null, chaleco: null },
    ]);
  });

  it("`cajas` con JSON roto o fuera de rango → 400 y no guarda nada", async () => {
    for (const cajas of ["[{x:", JSON.stringify([{ x: 2, y: 0, ancho: 0.1, alto: 0.1, confianza: 0.5 }])]) {
      const r = await enviar({ cajas });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ ok: false, error: "cajas_invalidas" });
    }
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("más cajas que las personas declaradas (o que 10) → 400 sin guardar", async () => {
    const una = { x: 0.4, y: 0.2, ancho: 0.1, alto: 0.5, confianza: 0.62 };
    for (const [personas, n] of [["1", 2], ["20", 11]] as const) {
      const r = await enviar({ personas, cajas: JSON.stringify(Array(n).fill(una)) });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ ok: false, error: "cajas_invalidas" });
    }
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("foto más alta que ancha → 400 `foto_vertical` antes de decodificarla", async () => {
    const vertical = await sharp({ create: { width: 64, height: 2000, channels: 3, background: { r: 120, g: 120, b: 120 } } })
      .jpeg()
      .toBuffer();
    const r = await enviar({ cajas: JSON.stringify([{ x: 0, y: 0, ancho: 1, alto: 1, confianza: 0.6 }]) }, vertical);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: "foto_vertical" });
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("el marcador que manda el cliente no se guarda si el chaleco no está registrado", async () => {
    const r = await enviar({ cajas: JSON.stringify([{ x: 0.4, y: 0.2, ancho: 0.1, alto: 0.5, confianza: 0.62, marcador: 203 }]) });
    expect(r.status).toBe(200);
    const [c] = H.guardar.mock.calls[0][1].cajas as Record<string, unknown>[];
    expect(c).not.toHaveProperty("marcador");
    expect(c.firma).toMatch(/^[0-9a-f]{24}$/);
  });
});
