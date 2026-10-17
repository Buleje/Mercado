/**
 * Modo TV (ADR-473) — la credencial del televisor y el espejo `/api/tv/camaras/**`:
 *  · el token: firma, tipo, `alg`, vencimiento; NO sirve como sesión del panel
 *    ni la sesión del panel sirve como token del TV;
 *  · la guardia: negocio cruzado, pantalla revocada o vencida → 401 y cookie
 *    borrada; el negocio sale del token, nunca del header; `ultimaVez` 1/min;
 *  · el espejo: sólo las cámaras permitidas, sin secretos; una cámara fuera de
 *    la lista → 404; la mirada queda como «Pantalla <nombre>».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  escrituras: [] as string[],
  camaras: {} as Record<string, Record<string, unknown>[]>,
  enlaces: {} as Record<string, Record<string, unknown>>,
  ultimo: vi.fn(),
  mirada: vi.fn(async () => undefined),
  snapshot: vi.fn(),
}));

vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/camaras/registro-miradas", () => ({ registrarMirada: H.mirada }));
vi.mock("@/lib/cripto-secretos", () => ({ descifrarSecreto: () => "clave-de-verdad" }));
vi.mock("@/lib/camaras/cuadro-vivo.server", () => ({ ultimoCuadro: (...a: unknown[]) => H.ultimo(...a) }));
vi.mock("@/lib/camaras/hls", async (real) => ({
  ...(await real<typeof import("@/lib/camaras/hls")>()),
  hayFfmpeg: async () => true,
  abrirVivo: async () => ({ ok: true }),
}));
vi.mock("@/lib/camaras/hik-connect-api.server", () => ({
  direccionDeVideo: async () => ({ ok: true, valor: { url: "ezopen://x", appToken: "at", dominioVideo: "https://isaopen.ezvizlife.com" } }),
}));
vi.mock("@/lib/db/camaras-hik-connect.db", () => ({
  CamarasHikConnectDB: {
    leer: async (t: string) => ({ enlaces: H.enlaces[t] ?? {} }),
    enlaceParaVideo: async (t: string, id: string) =>
      H.enlaces[t]?.[id] ? { resourceId: "r", deviceSerial: "SERIE", codigo: null } : null,
    credenciales: async () => ({ ok: true, valor: {} }),
  },
}));
vi.mock("@/lib/db/camaras.db", async () => {
  const { camarasParaPantalla } = await import("@/lib/camaras/camaras");
  const list = async (t: string) => H.camaras[t] ?? [];
  return {
    CamarasDB: {
      list,
      listaParaPantalla: async (t: string) => camarasParaPantalla((await list(t)) as never),
      credenciales: async () => ({ ok: false, motivo: "sin-configurar", detalle: "x" }),
    },
  };
});
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (k: string) => structuredClone(H.kv.get(k) ?? null),
    actualizar: async (
      k: string,
      cambio: (a: unknown, tx: unknown) => Promise<{ valor?: unknown; resultado: unknown }> | { valor?: unknown; resultado: unknown },
      user?: string,
    ) => {
      const r = await cambio(structuredClone(H.kv.get(k) ?? null), {});
      if (r.valor !== undefined) {
        H.kv.set(k, structuredClone(r.valor));
        H.escrituras.push(user ?? "");
      }
      return r.resultado;
    },
  },
}));

import { GET as listaTv } from "@/app/api/tv/camaras/route";
import { GET as cuadroTv } from "@/app/api/tv/camaras/[id]/cuadro/route";
import { GET as vivoTv } from "@/app/api/tv/camaras/[id]/vivo/[[...archivo]]/route";
import { GET as snapshotTv } from "@/app/api/tv/camaras/[id]/snapshot/route";
import { POST as nubeTv } from "@/app/api/tv/camaras/[id]/en-vivo-nube/route";
import { POST as salir } from "@/app/api/tv/salir/route";
import { PantallasTvDB, MICROCACHE_MS } from "@/lib/db/pantallas-tv.db";
import { firmarTokenTv, verificarTokenTv } from "@/lib/camaras/tv-token.server";
import { __olvidarTvAuth, exigirPantallaTv } from "@/lib/camaras/tv-auth.server";
import { createSessionToken, getSessionPayload } from "@/lib/session";
import { requireAdmin } from "@/lib/require-admin";

const CAMARA = (id: string, nombre: string) => ({
  id,
  nombre,
  lugar: "Patio",
  token: `tok-${id}-${"x".repeat(24)}`,
  activa: true,
  creadaEn: "2026-10-01T00:00:00.000Z",
  avisos: { whatsapp: "987654321", cuando: "siempre" },
  conexion: {
    host: "192.168.1.64",
    puerto: 80,
    usuario: "admin",
    claveCifrada: "CIFRADA-SECRETA",
    https: false,
    canal: 1,
    serie: "DS-2CD1234-SERIE",
    modelo: "DS-2CD",
    ultimaFalla: { motivo: "timeout", detalle: "no contestó 192.168.1.64", en: "2026-10-01T00:00:00.000Z" },
  },
});

let ip = 0;
const pedir = (url: string, token: string | null, extra: Record<string, string> = {}, method = "GET", body?: string) =>
  new NextRequest(url, {
    method,
    body,
    headers: {
      ...(token ? { cookie: `buleje-tv=${token}; csrf-token=tok` } : {}),
      "x-csrf-token": "tok",
      "x-forwarded-for": `10.2.0.${ip}`,
      ...extra,
    },
  });
const ctx = (id: string, archivo?: string[]) => ({ params: Promise.resolve({ id, ...(archivo ? { archivo } : {}) }) });

async function pantalla(tenantId: string, camaras: string[] | null, horas = 8, nombre = "TV del local") {
  const r = await PantallasTvDB.crear(tenantId, { nombre, camaras, horas }, "qa-owner");
  if (!r.ok) throw new Error(r.motivo);
  return { p: r.pantalla, token: firmarTokenTv({ tid: tenantId, pid: r.pantalla.id, expiraEn: r.pantalla.expiraEn }) };
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  ip++;
  H.kv.clear();
  H.escrituras = [];
  PantallasTvDB.__olvidarTodo();
  __olvidarTvAuth();
  H.camaras = {
    "t-a": [CAMARA("cam_a1", "Portón"), CAMARA("cam_a2", "Patio")],
    "t-b": [CAMARA("cam_b1", "Ajena")],
  };
  H.enlaces = { "t-a": { cam_a1: { resourceId: "r" } } };
  H.ultimo.mockResolvedValue({ imagen: Buffer.from([1, 2, 3]), ts: Date.now() });
});

describe("token del TV", () => {
  it("firma y vuelve; alterado, de otro tipo, `alg: none` o vencido → null", () => {
    const exp = new Date(Date.now() + 3_600_000).toISOString();
    const t = firmarTokenTv({ tid: "t-a", pid: "tv_1", expiraEn: exp });
    expect(verificarTokenTv(t)).toMatchObject({ typ: "tv", tid: "t-a", pid: "tv_1" });

    const [h, p, s] = t.split(".") as [string, string, string];
    const otroPayload = Buffer.from(JSON.stringify({ typ: "tv", tid: "t-b", pid: "tv_1", exp: 9e9 })).toString("base64url");
    expect(verificarTokenTv(`${h}.${otroPayload}.${s}`)).toBeNull();
    const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(verificarTokenTv(`${none}.${p}.`)).toBeNull();
    expect(verificarTokenTv(t, Date.now() + 2 * 3_600_000)).toBeNull();
    expect(verificarTokenTv("basura")).toBeNull();
  });

  it("el token del TV no es sesión del panel, y la sesión del panel no es token del TV", async () => {
    const t = firmarTokenTv({ tid: "t-a", pid: "tv_1", expiraEn: new Date(Date.now() + 3_600_000).toISOString() });
    expect(await getSessionPayload(t)).toBeNull();
    const r = await requireAdmin(
      new NextRequest("http://localhost/api/admin/camaras", { headers: { cookie: `buleje-admin-sess=${t}; buleje-tv=${t}` } }),
      ["admin", "owner", "almacenero"],
    );
    expect((r as Response).status).toBe(401);
    expect(verificarTokenTv(await createSessionToken("owner", "qa", "t-a"))).toBeNull();
  });
});

describe("guardia del TV", () => {
  it("sin cookie → 401", async () => {
    expect((await listaTv(pedir("http://localhost/api/tv/camaras", null))).status).toBe(401);
  });

  it("token de un negocio con la pantalla de otro → 401 y borra la cookie", async () => {
    const { p } = await pantalla("t-a", null);
    const cruzado = firmarTokenTv({ tid: "t-b", pid: p.id, expiraEn: p.expiraEn });
    const r = await listaTv(pedir("http://localhost/api/tv/camaras", cruzado));
    expect(r.status).toBe(401);
    expect(r.headers.getSetCookie().join(";")).toMatch(/buleje-tv=;/);
  });

  it("revocada → 401 al pedido siguiente (misma instancia)", async () => {
    const { p, token } = await pantalla("t-a", null);
    expect((await listaTv(pedir("http://localhost/api/tv/camaras", token))).status).toBe(200);
    await PantallasTvDB.revocar("t-a", p.id, "qa-owner");
    expect((await listaTv(pedir("http://localhost/api/tv/camaras", token))).status).toBe(401);
  });

  it("vencida → 401 aunque la firma siga bien", async () => {
    const { token } = await pantalla("t-a", null, 8);
    const despues = Date.now() + 9 * 3_600_000;
    const r = await exigirPantallaTv(pedir("http://localhost/api/tv/camaras", token), despues);
    expect((r as Response).status).toBe(401);
  });

  it("el negocio sale del token, no del header; `ultimaVez` se escribe una vez por minuto", async () => {
    const { p, token } = await pantalla("t-a", null);
    H.escrituras = [];
    const r = await listaTv(pedir("http://localhost/api/tv/camaras", token, { "x-tenant-id": "t-b" }));
    const cuerpo = (await r.json()) as { camaras: { id: string }[] };
    expect(cuerpo.camaras.map((c) => c.id)).toEqual(["cam_a1", "cam_a2"]);
    await listaTv(pedir("http://localhost/api/tv/camaras", token));
    await new Promise((ok) => setTimeout(ok, 0));
    expect(H.escrituras).toEqual(["tv"]);
    const guardada = (H.kv.get("interno:tv:pantallas:t-a") as { id: string; ultimaVez: string | null }[]).find((x) => x.id === p.id);
    expect(guardada?.ultimaVez).not.toBeNull();
    expect(MICROCACHE_MS).toBeLessThanOrEqual(10_000);
  });
});

describe("espejo /api/tv/camaras", () => {
  it("lista sólo las permitidas, con la forma del panel y sin secretos", async () => {
    const { token } = await pantalla("t-a", ["cam_a1"]);
    const r = await listaTv(pedir("http://localhost/api/tv/camaras", token));
    const cuerpo = (await r.json()) as { pantalla: { nombre: string }; camaras: Record<string, unknown>[] };
    expect(cuerpo.pantalla.nombre).toBe("TV del local");
    expect(cuerpo.camaras).toHaveLength(1);
    const c = cuerpo.camaras[0]!;
    expect(c).toMatchObject({ id: "cam_a1", nombre: "Portón", token: "", avisos: null, nubeEnlazada: true });
    expect(c.conexion).toMatchObject({ host: "", usuario: "", serie: null, modelo: "DS-2CD" });
    const json = JSON.stringify(cuerpo);
    for (const secreto of ["CIFRADA-SECRETA", "claveCifrada", "192.168.1.64", "987654321", "tok-cam_a1", "DS-2CD1234-SERIE"]) {
      expect(json).not.toContain(secreto);
    }
  });

  it("cámara fuera de la lista o de otro negocio → 404 en cuadro, vivo, foto y nube", async () => {
    const { token } = await pantalla("t-a", ["cam_a1"]);
    expect((await cuadroTv(pedir("http://localhost/api/tv/camaras/cam_a2/cuadro", token), ctx("cam_a2"))).status).toBe(404);
    expect((await vivoTv(pedir("http://localhost/api/tv/camaras/cam_a2/vivo", token), ctx("cam_a2"))).status).toBe(404);
    expect((await snapshotTv(pedir("http://localhost/api/tv/camaras/cam_a2/snapshot", token), ctx("cam_a2"))).status).toBe(404);
    expect((await nubeTv(pedir("http://localhost/api/tv/camaras/cam_a2/en-vivo-nube", token, {}, "POST", "{}"), ctx("cam_a2"))).status).toBe(404);

    const todas = await pantalla("t-a", null, 8, "TV 2");
    expect((await cuadroTv(pedir("http://localhost/api/tv/camaras/cam_b1/cuadro", todas.token), ctx("cam_b1"))).status).toBe(404);
    expect(H.ultimo).not.toHaveBeenCalled();
  });

  it("permitida: el cuadro sale del negocio del token y anota la mirada como «Pantalla …»", async () => {
    const { token } = await pantalla("t-a", ["cam_a1"]);
    const r = await cuadroTv(pedir("http://localhost/api/tv/camaras/cam_a1/cuadro", token), ctx("cam_a1"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(H.ultimo).toHaveBeenCalledWith("t-a", "cam_a1");
    expect(H.mirada).toHaveBeenCalledWith(
      "t-a",
      { usuario: "Pantalla TV del local", rol: "tv" },
      { id: "cam_a1", nombre: "Portón" },
      { tipo: "vivo", calidad: "sd" },
      expect.any(Date),
    );
    /* Un cuadro por segundo no es una mirada por segundo. */
    await cuadroTv(pedir("http://localhost/api/tv/camaras/cam_a1/cuadro", token), ctx("cam_a1"));
    expect(H.mirada).toHaveBeenCalledTimes(1);
  });

  it("vivo: la lista apunta al espejo del TV, no al panel", async () => {
    const { token } = await pantalla("t-a", null);
    const r = await vivoTv(pedir("http://localhost/api/tv/camaras/cam_a1/vivo", token), ctx("cam_a1"));
    expect(await r.json()).toEqual({ disponible: true, lista: "/api/tv/camaras/cam_a1/vivo/vivo.m3u8" });
  });

  it("nube: misma respuesta que el panel y la mirada con el nombre de la pantalla", async () => {
    const { token } = await pantalla("t-a", null);
    const r = await nubeTv(
      pedir("http://localhost/api/tv/camaras/cam_a1/en-vivo-nube", token, { "content-type": "application/json" }, "POST", JSON.stringify({ tipo: "vivo", calidad: "sd" })),
      ctx("cam_a1"),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ url: "ezopen://x", accessToken: "at", tipo: "vivo", calidad: "sd" });
    expect(H.mirada).toHaveBeenCalledWith("t-a", { usuario: "Pantalla TV del local", rol: "tv" }, { id: "cam_a1", nombre: "Portón" }, expect.anything());
  });

  it("nube en el TV: grabación → 400; pantalla sin todas las cámaras de Hik-Connect → 409 y la lista no la ofrece", async () => {
    const nube = (token: string, cuerpo: Record<string, unknown>) =>
      nubeTv(
        pedir("http://localhost/api/tv/camaras/cam_a1/en-vivo-nube", token, { "content-type": "application/json" }, "POST", JSON.stringify(cuerpo)),
        ctx("cam_a1"),
      );
    const todas = await pantalla("t-a", null);
    expect((await nube(todas.token, { tipo: "grabacion", calidad: "sd", desde: "2026-10-07 10:00:00", hasta: "2026-10-07 10:05:00" })).status).toBe(400);

    /* Sólo cam_a1 enlazada y elegida: todas las de la nube están en la lista → sale. */
    const una = await pantalla("t-a", ["cam_a1"], 8, "TV 2");
    expect((await nube(una.token, { tipo: "vivo" })).status).toBe(200);

    /* cam_a2 también es de la nube y NO está en la lista: el permiso abriría cam_a2. */
    H.enlaces = { "t-a": { cam_a1: { resourceId: "r" }, cam_a2: { resourceId: "r2" } } };
    const r = await nube(una.token, { tipo: "vivo" });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "nube_no_permitida", motivo: expect.stringMatching(/elige «todas»/) });
    const lista = (await (await listaTv(pedir("http://localhost/api/tv/camaras", una.token))).json()) as {
      camaras: { id: string; nubeEnlazada: boolean }[];
    };
    expect(lista.camaras).toEqual([expect.objectContaining({ id: "cam_a1", nubeEnlazada: false })]);
    expect((await nube(todas.token, { tipo: "vivo" })).status).toBe(200);
  });

  it("salir borra la cookie", async () => {
    const r = await salir(pedir("http://localhost/api/tv/salir", "x", {}, "POST"));
    expect(r.status).toBe(200);
    expect(r.headers.getSetCookie().join(";")).toMatch(/buleje-tv=;.*Max-Age=0/i);
  });
});
