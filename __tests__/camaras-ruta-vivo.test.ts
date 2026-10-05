import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * La ruta del video en vivo (05-10): quién la ve, de qué negocio, y que el
 * reproductor no se quede sin cupo a mitad de la tarde.
 */
const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  camarasPorTenant: {} as Record<string, unknown[]>,
  leer: vi.fn(),
  abrir: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: { list: async (tenantId: string) => H.camarasPorTenant[tenantId] ?? [] },
}));
vi.mock("@/lib/cripto-secretos", () => ({ descifrarSecreto: (c: string) => (c === "roto" ? null : "clave-de-verdad") }));
vi.mock("@/lib/camaras/hls", async (real) => ({
  ...(await real<typeof import("@/lib/camaras/hls")>()),
  hayFfmpeg: async () => true,
  abrirVivo: (...a: unknown[]) => H.abrir(...a),
  leerOReabrir: (...a: unknown[]) => H.leer(...a),
}));

import { GET } from "@/app/api/admin/camaras/[id]/vivo/[[...archivo]]/route";

const conexion = (claveCifrada = "cifrada") => ({
  host: "192.168.1.64",
  puerto: 80,
  usuario: "visor",
  claveCifrada,
  https: false,
  canal: 1,
});
const como = (role: string, tenantId = "t-main") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};
let ip = 0;
const pedir = (id: string, archivo?: string[], ipFija?: string) =>
  GET(
    new NextRequest(`http://localhost/api/admin/camaras/${id}/vivo${archivo ? `/${archivo.join("/")}` : ""}`, {
      headers: { cookie: "buleje-admin-sess=x", "x-forwarded-for": ipFija ?? `10.0.0.${++ip % 250}` },
    }),
    { params: Promise.resolve({ id, archivo }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  como("almacenero");
  H.camarasPorTenant = {
    "t-main": [{ id: "cam_main", conexion: conexion() }, { id: "cam_rota", conexion: conexion("roto") }],
    "t-otro": [{ id: "cam_otro", conexion: conexion() }],
  };
  H.abrir.mockResolvedValue({ ok: true });
  H.leer.mockResolvedValue({ ok: true, datos: Buffer.from("#EXTM3U\n"), tipo: "application/vnd.apple.mpegurl" });
});

describe("GET /api/admin/camaras/[id]/vivo", () => {
  it("sin sesión → 401", async () => {
    H.payload = null;
    expect((await pedir("cam_main")).status).toBe(401);
    expect(H.abrir).not.toHaveBeenCalled();
  });

  it("la cámara de otro negocio → 404 y nunca se abre ni se lee su video", async () => {
    expect((await pedir("cam_otro")).status).toBe(404);
    expect((await pedir("cam_otro", ["vivo.m3u8"])).status).toBe(404);
    expect(H.abrir).not.toHaveBeenCalled();
    expect(H.leer).not.toHaveBeenCalled();
  });

  it("el arranque usa el flujo secundario (102) con la clave descifrada y la clave del stream lleva el tenant", async () => {
    const r = await pedir("cam_main");
    expect(await r.json()).toEqual({ disponible: true, lista: "/api/admin/camaras/cam_main/vivo/vivo.m3u8" });
    expect(H.abrir).toHaveBeenCalledWith("t-main:cam_main", expect.stringMatching(/clave-de-verdad@192\.168\.1\.64:554\/Streaming\/Channels\/102$/));
  });

  it("la lista pasa un RTSP perezoso: sólo arma la URL si hay que revivir el stream", async () => {
    const r = await pedir("cam_main", ["vivo.m3u8"]);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toMatch(/no-store/);
    const [clave, nombre, perezoso] = H.leer.mock.calls[0]!;
    expect([clave, nombre]).toEqual(["t-main:cam_main", "vivo.m3u8"]);
    expect((perezoso as () => string)()).toMatch(/Channels\/102$/);
  });

  it("clave guardada ilegible → 409 en el arranque, sin ffmpeg", async () => {
    const r = await pedir("cam_rota");
    expect(r.status).toBe(409);
    expect(H.abrir).not.toHaveBeenCalled();
  });

  it("un archivo con otro nombre → 400 sin leer nada", async () => {
    expect((await pedir("cam_main", ["..%2F.env"])).status).toBe(400);
    expect(H.leer).not.toHaveBeenCalled();
  });

  it("dos pestañas mirando (130 pedidos en el minuto, misma IP) no rebotan: antes el 101 daba 429", async () => {
    const estados = new Set<number>();
    for (let i = 0; i < 130; i++) estados.add((await pedir("cam_main", [`s${String(i).padStart(3, "0")}.ts`], "10.9.9.9")).status);
    expect([...estados]).toEqual([200]);
  });
});
