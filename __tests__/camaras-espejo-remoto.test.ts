/**
 * Espejo del celular visto desde otro equipo (24-10):
 *  · lo puro: medidas, huella, reenvío y la línea del visor;
 *  · /api/admin/camaras/espejo/cuadro con el `requireAdmin` y el CSRF REALES
 *    (sólo se simula el JWT), sharp de verdad y la memoria efímera sin
 *    Upstash: tope de bytes, tipo real, vencimiento a los 10 s, que el GET de
 *    un negocio (o de otra persona) no ve el cuadro de otro, 401/403.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  anotado: vi.fn(),
  mirada: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
/* `vitest.setup.ts` lo apaga para todos: acá va el de verdad. */
vi.mock("@/lib/auth/csrf", async (real) => await real<typeof import("@/lib/auth/csrf")>());
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => (H.anotado(...a), Promise.resolve()) }));
vi.mock("@/lib/camaras/registro-miradas", () => ({
  VENTANA_MIRADA_MS: 5 * 60_000,
  registrarMirada: (...a: unknown[]) => (H.mirada(...a), Promise.resolve()),
}));

import { DELETE, GET, POST } from "@/app/api/admin/camaras/espejo/cuadro/route";
import { __reiniciarKvEfimero } from "@/lib/camaras/kv-efimero.server";
import { __reiniciarMiradasEspejo } from "@/lib/camaras/espejo-remoto.server";
import {
  MAX_BYTES_CUADRO,
  REENVIO_SIN_CAMBIO_MS,
  cambioDeHuella,
  huellaGris,
  medidasReducidas,
  textoVisor,
  tocaEnviar,
} from "@/lib/camaras/espejo-remoto";

const BASE = "http://localhost/api/admin/camaras/espejo/cuadro";
const EMISOR = "emisor-pc-oficina-1";
const como = (role: string, tenantId = "t-main", username = `qa-${role}`) => {
  H.payload = { username, role, tenantId };
};
const cookies = "buleje-admin-sess=x; csrf-token=T";

const subir = (cuerpo: Uint8Array<ArrayBuffer>, tipo = "image/jpeg", extra: Record<string, string> = {}) =>
  POST(
    new NextRequest(BASE, {
      method: "POST",
      headers: { cookie: cookies, "x-csrf-token": "T", "content-type": tipo, "x-espejo-emisor": EMISOR, ...extra },
      body: cuerpo,
    }),
  );
const mirar = (extra: Record<string, string> = {}) => GET(new NextRequest(BASE, { headers: { cookie: cookies, ...extra } }));
const apagar = (emisor = EMISOR) =>
  DELETE(new NextRequest(BASE, { method: "DELETE", headers: { cookie: cookies, "x-csrf-token": "T", "x-espejo-emisor": emisor } }));

let jpeg: Uint8Array<ArrayBuffer>;
let webp: Uint8Array<ArrayBuffer>;
const comoBytes = (b: Buffer) => new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) as Uint8Array<ArrayBuffer>;

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  __reiniciarKvEfimero();
  __reiniciarMiradasEspejo();
  como("admin");
  const lienzo = sharp({ create: { width: 540, height: 1170, channels: 3, background: { r: 30, g: 120, b: 140 } } });
  jpeg ??= comoBytes(await lienzo.clone().jpeg({ quality: 60 }).toBuffer());
  webp ??= comoBytes(await lienzo.clone().webp({ quality: 60 }).toBuffer());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("lo puro", () => {
  it("reduce al lado mayor de 720 sin agrandar; sin cuadro → null", () => {
    expect(medidasReducidas(1080, 2340)).toEqual({ ancho: 332, alto: 720 });
    expect(medidasReducidas(400, 300)).toEqual({ ancho: 400, alto: 300 });
    expect(medidasReducidas(0, 0)).toBeNull();
  });

  it("la huella ve un bloque que cambia y no el mismo cuadro; el reenvío no deja vencer", () => {
    const gris = huellaGris([10, 10, 10, 255, 200, 200, 200, 255]);
    expect(Array.from(gris)).toEqual([10, 200]);
    expect(cambioDeHuella(null, gris)).toBe(true);
    expect(cambioDeHuella(gris, Uint8Array.from([10, 200]))).toBe(false);
    expect(cambioDeHuella(gris, Uint8Array.from([10, 196]))).toBe(true);
    expect(tocaEnviar(false, 1500)).toBe(false);
    expect(tocaEnviar(false, REENVIO_SIN_CAMBIO_MS)).toBe(true);
    expect(tocaEnviar(true, 0)).toBe(true);
  });

  it("la línea del visor: nadie, al día, lento y cortado", () => {
    expect(textoVisor(null, false, 0).tono).toBe("neutro");
    expect(textoVisor(10_000, true, 12_000)).toEqual({ texto: "Hace 2 s", tono: "ok" });
    expect(textoVisor(10_000, true, 18_000)).toEqual({ texto: "Hace 8 s · llega lento", tono: "aviso" });
    expect(textoVisor(10_000, false, 40_000)).toEqual({ texto: "Se cortó hace 30 s", tono: "aviso" });
    expect(textoVisor(0, false, 5 * 60_000).texto).toBe("Se cortó hace 5 min");
  });
});

describe("/api/admin/camaras/espejo/cuadro", () => {
  it("sin sesión: GET 401; POST/DELETE también 401 (el CSRF pasa, la sesión no)", async () => {
    H.payload = null;
    expect((await mirar()).status).toBe(401);
    expect((await subir(jpeg)).status).toBe(401);
    expect((await apagar()).status).toBe(401);
  });

  it("un rol que no mira cámaras (cajero) → 403 en las tres", async () => {
    como("cajero");
    expect((await mirar()).status).toBe(403);
    expect((await subir(jpeg)).status).toBe(403);
    expect((await apagar()).status).toBe(403);
  });

  it("POST sin el token CSRF → 403 y no guarda nada", async () => {
    const r = await POST(
      new NextRequest(BASE, {
        method: "POST",
        headers: { cookie: "buleje-admin-sess=x", "content-type": "image/jpeg", "x-espejo-emisor": EMISOR },
        body: jpeg,
      }),
    );
    expect(r.status).toBe(403);
    expect((await mirar()).status).toBe(204);
  });

  it("tope de bytes: más de 200 KB → 413, también por partes y sin content-length", async () => {
    const r = await subir(new Uint8Array(MAX_BYTES_CUADRO + 1));
    expect(r.status).toBe(413);
    expect((await r.json()).error).toBe("muy_grande");
    const flujo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(150 * 1024));
        c.enqueue(new Uint8Array(150 * 1024));
        c.close();
      },
    });
    const porPartes = new NextRequest(BASE, {
      method: "POST",
      headers: { cookie: cookies, "x-csrf-token": "T", "content-type": "image/jpeg", "x-espejo-emisor": EMISOR },
      body: flujo,
      duplex: "half",
    } as NonNullable<ConstructorParameters<typeof NextRequest>[1]> & { duplex: "half" });
    expect(porPartes.headers.get("content-length")).toBeNull();
    expect((await POST(porPartes)).status).toBe(413);
  });

  it("tipo: PNG declarado → 415; un PNG con content-type jpeg → 415 (formato real); basura → 415; sin emisor → 400", async () => {
    const png = comoBytes(await sharp({ create: { width: 20, height: 20, channels: 3, background: "#000" } }).png().toBuffer());
    expect((await subir(png, "image/png")).status).toBe(415);
    const r = await subir(png, "image/jpeg");
    expect(r.status).toBe(415);
    expect((await r.json()).error).toBe("formato_no_permitido");
    expect((await subir(new Uint8Array([1, 2, 3, 4]), "image/jpeg")).status).toBe(415);
    expect((await subir(jpeg, "image/jpeg", { "x-espejo-emisor": "x" })).status).toBe(400);
    expect((await mirar()).status).toBe(204);
  });

  it("medidas que no son de un espejo (2000 px de lado) → 413", async () => {
    const grande = comoBytes(await sharp({ create: { width: 2000, height: 100, channels: 3, background: "#000" } }).jpeg().toBuffer());
    const r = await subir(grande);
    expect(r.status).toBe(413);
    expect((await r.json()).error).toBe("cuadro_muy_grande");
  });

  it("un cuadro válido se sirve re-codificado (webp ≤ 720 px, private no-store, edad); se anota el prender y quién miró", async () => {
    const r = await subir(webp, "image/webp");
    expect(r.status).toBe(200);
    const g = await mirar();
    expect(g.status).toBe(200);
    expect(g.headers.get("content-type")).toBe("image/webp");
    expect(g.headers.get("cache-control")).toBe("private, no-store");
    expect(g.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Number(g.headers.get("x-cuadro-edad-ms"))).toBeGreaterThanOrEqual(0);
    const meta = await sharp(Buffer.from(await g.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(720);
    expect(H.anotado).toHaveBeenCalledTimes(1);
    expect(H.anotado.mock.calls[0]?.slice(0, 2)).toEqual(["camara.espejo_compartir_prendido", "camara"]);
    expect(H.anotado.mock.calls[0]?.[6]).toBe("t-main");
    /* Seguir mandando no vuelve a anotar el prender; mirar de nuevo no anota otra mirada (1 cada 5 min). */
    await subir(jpeg);
    await mirar();
    expect(H.anotado).toHaveBeenCalledTimes(1);
    expect(H.mirada).toHaveBeenCalledTimes(1);
    expect(H.mirada.mock.calls[0]?.[0]).toBe("t-main");
  });

  it("vencimiento: a los 10 s el cuadro ya no se sirve (204)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T20:00:00Z"));
    expect((await subir(jpeg)).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-24T20:00:09Z"));
    expect((await mirar()).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-24T20:00:10.500Z"));
    const r = await mirar();
    expect(r.status).toBe(204);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });

  it("otro negocio no lo ve (ni con su header); otra persona del mismo negocio tampoco", async () => {
    expect((await subir(jpeg)).status).toBe(200);
    como("admin", "t-otro");
    expect((await mirar()).status).toBe(204);
    como("admin", "t-main", "otra-persona");
    expect((await mirar()).status).toBe(204);
    /* Un almacenero con el header de otro negocio: requireAdmin corta antes de leer nada. */
    como("almacenero", "t-main", "qa-admin");
    expect((await mirar({ "x-tenant-id": "t-otro" })).status).toBe(403);
    como("admin");
    expect((await mirar()).status).toBe(200);
  });

  it("otra pestaña del mismo usuario no pisa a la que comparte (409); el DELETE ajeno no la corta; el propio sí (204) y se anota", async () => {
    expect((await subir(jpeg)).status).toBe(200);
    expect((await subir(jpeg, "image/jpeg", { "x-espejo-emisor": "otra-pestana-123" })).status).toBe(409);
    expect((await apagar("otra-pestana-123")).status).toBe(204);
    expect((await mirar()).status).toBe(200);
    expect((await apagar()).status).toBe(204);
    expect((await mirar()).status).toBe(204);
    expect(H.anotado.mock.calls.map((c) => c[0])).toEqual(["camara.espejo_compartir_prendido", "camara.espejo_compartir_apagado"]);
  });
});
