/**
 * «Probar recepción» y «último aviso» (2026-10-05):
 *  · el aviso de prueba tiene el formato real de Hikvision (lo lee el mismo parser);
 *  · `modo=prueba` lee todo y NO escribe nada (ni foto, ni historial, ni contacto);
 *  · sin `prueba: true` en el GET, la foto de prueba no se manda (un servidor
 *    viejo la guardaría como real);
 *  · el aviso de la cámara se anota; el «Guardar» del visor (`evento=manual`) no.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const H = vi.hoisted(() => ({
  porToken: vi.fn(),
  guardar: vi.fn(),
  anotar: vi.fn(),
  base: { base: "https://abc-def.trycloudflare.com", motivo: null } as
    | { base: string; motivo: null }
    | { base: null; motivo: "sin_publica" | "tunel_caido" },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/camaras/cruces.server", () => ({ procesarCapturaNueva: vi.fn() }));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: { porToken: (...a: unknown[]) => H.porToken(...a) },
}));
vi.mock("@/lib/camaras/ingesta.server", () => ({
  guardarFoto: (...a: unknown[]) => H.guardar(...a),
}));
vi.mock("@/lib/camaras/contacto.server", () => ({
  anotarContacto: (...a: unknown[]) => H.anotar(...a),
}));
vi.mock("@/lib/camaras/cuadro-vivo.server", () => ({
  CuadroIlegible: class extends Error {},
  recibirCuadro: vi.fn(),
}));
vi.mock("@/lib/camaras/direccion-publica.server", () => ({ baseParaLaCamara: async () => H.base }));

import { GET, POST } from "@/app/api/webhooks/camara/route";
import {
  alertaDelAviso,
  eventoDeAlerta,
  imagenDelAviso,
  partesMultipart,
} from "@/lib/camaras/hikvision-push";
import {
  avisoDePrueba,
  direccionesDePrueba,
  leerAviso,
  leerLlega,
  protocoloQueSirve,
} from "@/lib/camaras/recepcion";
import { probarRecepcion } from "@/lib/camaras/recepcion.server";

const TOKEN = "t".repeat(32);
const CAMARA = { id: "cam_1", token: TOKEN, activa: true, nombre: "Portón" };
let jpeg: Buffer;

const mandar = (query: string, cuerpo: Buffer, tipo: string) =>
  POST(
    new NextRequest(`http://localhost/api/webhooks/camara?${query}`, {
      method: "POST",
      headers: {
        "content-type": tipo,
        "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`,
      },
      body: new Uint8Array(cuerpo),
    }),
  );

beforeEach(async () => {
  vi.clearAllMocks();
  H.porToken.mockResolvedValue({ tenantId: "t-main", camara: CAMARA });
  H.guardar.mockResolvedValue(true);
  jpeg ??= await sharp({
    create: { width: 64, height: 36, channels: 3, background: { r: 10, g: 120, b: 120 } },
  })
    .jpeg()
    .toBuffer();
});

describe("el aviso de prueba", () => {
  it("lo lee el mismo parser que el aviso real: alerta de persona + la foto", () => {
    const { cuerpo, contentType } = avisoDePrueba(jpeg, "2026-10-05T12:00:00-05:00");
    const partes = partesMultipart(cuerpo, contentType);
    const alerta = alertaDelAviso(partes);
    expect(alerta && eventoDeAlerta(alerta)).toBe("persona");
    expect(imagenDelAviso(partes)?.datos.equals(jpeg)).toBe(true);
  });

  it("con base HTTPS prueba también HTTP; con base HTTP sólo HTTP", () => {
    const d = direccionesDePrueba("https://abc.trycloudflare.com/", "k1");
    expect(d.llega).toBe("https://abc.trycloudflare.com/api/webhooks/camara?k=k1");
    expect(d.https).toBe("https://abc.trycloudflare.com/api/webhooks/camara?k=k1&modo=prueba");
    expect(d.http).toBe("http://abc.trycloudflare.com/api/webhooks/camara?k=k1&modo=prueba");
    expect(direccionesDePrueba("http://panel.pe", "k1").https).toBeNull();
  });

  it("lee cada respuesta en el idioma de la pantalla", () => {
    expect(leerLlega(200, { ok: true, prueba: true }, 80).ok).toBe(true);
    expect(leerLlega(200, { ok: true }, 80).detalle).toMatch(/versión anterior/);
    expect(leerLlega(401, { ok: false }, 80).detalle).toMatch(/no reconoce esta cámara/);
    expect(leerLlega(null, null, 12000, "tiempo").detalle).toMatch(/12 s/);
    expect(leerLlega(530, null, 300).detalle).toMatch(/túnel/);
    expect(leerAviso("http", 301, null, 50).detalle).toMatch(/redirige/);
    expect(leerAviso("https", 400, { ok: false, error: "modo_invalido" }, 50).detalle).toMatch(
      /versión anterior/,
    );
    const ok = leerAviso(
      "https",
      200,
      { ok: true, prueba: true, conFoto: true, evento: "persona" },
      90,
    );
    expect(ok.ok).toBe(true);
    expect(protocoloQueSirve([ok, leerAviso("http", 301, null, 40)])).toBe("https");
    expect(
      protocoloQueSirve([leerAviso("http", 200, { ok: true, prueba: true, conFoto: true }, 40)]),
    ).toBe("http");
  });
});

describe("POST /api/webhooks/camara?modo=prueba", () => {
  it("lee el aviso entero y no escribe nada", async () => {
    const { cuerpo, contentType } = avisoDePrueba(jpeg, "2026-10-05T12:00:00-05:00");
    const r = await mandar(`k=${TOKEN}&modo=prueba`, cuerpo, contentType);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, prueba: true, conFoto: true, evento: "persona" });
    expect(H.guardar).not.toHaveBeenCalled();
    expect(H.anotar).not.toHaveBeenCalled();
  });

  it("una foto que no es foto falla igual que en serio, sin escribir", async () => {
    const r = await mandar(`k=${TOKEN}&modo=prueba`, Buffer.from("no soy un jpeg"), "image/jpeg");
    expect(r.status).toBe(415);
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("token malo: 401 como siempre", async () => {
    H.porToken.mockResolvedValue(null);
    const r = await mandar(`k=${"x".repeat(32)}&modo=prueba`, jpeg, "image/jpeg");
    expect(r.status).toBe(401);
  });

  it("el GET avisa que este servidor conoce el modo prueba", async () => {
    const r = await GET(new NextRequest(`http://localhost/api/webhooks/camara?k=${TOKEN}`));
    expect(await r.json()).toEqual({ ok: true, listo: true, prueba: true });
  });
});

describe("último aviso de la cámara", () => {
  it("el latido sin foto se anota como señal de vida, sin guardar foto", async () => {
    const xml =
      "<EventNotificationAlert><eventType>videoloss</eventType><eventState>inactive</eventState></EventNotificationAlert>";
    const r = await mandar(`k=${TOKEN}`, Buffer.from(xml), "application/xml");
    expect(await r.json()).toEqual({ ok: true, guardada: false });
    expect(H.anotar).toHaveBeenCalledWith("t-main", "cam_1", "latido");
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("la foto de la cámara se anota; la del visor (`evento=manual`) no", async () => {
    const { cuerpo, contentType } = avisoDePrueba(jpeg, "2026-10-05T12:00:00-05:00");
    await mandar(`k=${TOKEN}`, cuerpo, contentType);
    expect(H.anotar).toHaveBeenCalledWith("t-main", "cam_1", "foto");
    H.anotar.mockClear();
    await mandar(`k=${TOKEN}&evento=manual`, jpeg, "image/jpeg");
    expect(H.guardar).toHaveBeenCalledTimes(2);
    expect(H.anotar).not.toHaveBeenCalled();
  });
});

describe("probarRecepcion (servidor)", () => {
  it("sin `prueba: true` en el GET no manda la foto: un servidor viejo la guardaría", async () => {
    const fetchFalso = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, listo: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probarRecepcion(TOKEN);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(r.pasos).toHaveLength(1);
    expect(r.protocolo).toBeNull();
    vi.unstubAllGlobals();
  });

  it("con el servidor al día prueba HTTPS y HTTP, sin seguir redirecciones", async () => {
    const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      if (init?.method === "GET")
        return new Response(JSON.stringify({ ok: true, listo: true, prueba: true }));
      if (url.startsWith("http://")) return new Response(null, { status: 301 });
      return new Response(
        JSON.stringify({ ok: true, prueba: true, conFoto: true, evento: "persona" }),
      );
    });
    vi.stubGlobal("fetch", fetchFalso);
    const r = await probarRecepcion(TOKEN);
    expect(r.pasos.map((p) => [p.paso, p.ok])).toEqual([
      ["llega", true],
      ["https", true],
      ["http", false],
    ]);
    expect(r.protocolo).toBe("https");
    vi.unstubAllGlobals();
  });

  it("sin dirección pública no prueba nada y dice por qué", async () => {
    H.base = { base: null, motivo: "sin_publica" };
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    expect(await probarRecepcion(TOKEN)).toMatchObject({ bloqueo: "sin_publica", pasos: [] });
    expect(fetchFalso).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
