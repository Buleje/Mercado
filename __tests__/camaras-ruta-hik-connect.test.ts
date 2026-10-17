import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Rutas de Hik-Connect for Teams (ADR-471): quién vincula, que una clave falsa
 * NO se guarda, que las claves no vuelven nunca, y que el video de una cámara
 * de otro negocio no sale. La «base» es un KV en memoria y Hikvision un fetch
 * simulado con las respuestas reales medidas el 05-10.
 */
const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  kv: new Map<string, unknown>(),
  camarasPorTenant: {} as Record<string, { id: string; nombre: string }[]>,
  hik: (() => ({})) as (url: string, body: unknown) => unknown,
  llamadas: [] as string[],
  pedidoVideo: null as unknown,
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => null,
  createRateLimiter: () => ({ check: () => true, windowMs: 60_000 }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/camaras/registro-miradas", () => ({ registrarMirada: vi.fn(async () => {}) }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: { list: async (tenantId: string) => H.camarasPorTenant[tenantId] ?? [] },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (k: string) => structuredClone(H.kv.get(k) ?? null),
    delete: async (k: string) => void H.kv.delete(k),
    actualizar: async (
      k: string,
      cambio: (a: unknown) => { valor?: unknown; resultado: unknown },
    ) => {
      const r = cambio(structuredClone(H.kv.get(k) ?? null));
      if (r.valor !== undefined) H.kv.set(k, structuredClone(r.valor));
      return r.resultado;
    },
  },
}));

process.env.AUTH_SECRET ??= "secreto-de-prueba-de-32-caracteres!!";

import { DELETE, GET, PATCH, POST } from "@/app/api/admin/camaras/hik-connect/route";
import { GET as LISTA } from "@/app/api/admin/camaras/hik-connect/camaras/route";
import { POST as VIDEO } from "@/app/api/admin/camaras/[id]/en-vivo-nube/route";

const AK_NOT_FOUND = { message: "AK_NOT_FOUND{OPEN000001}", errorCode: "OPEN000001" };
const CLAVE_KV = "interno:camaras-hik-connect:t-main";
const APP_KEY = "appkey-verdadera-123456";
const SECRET = "secret-verdadero-abcdef";

const como = (role: string, tenantId = "t-main") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { cookie: "buleje-admin-sess=x", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** Hikvision que conoce UNA AppKey (región Norteamérica) y tiene una cámara. */
function hikvisionReal(url: string, body: unknown) {
  const b = body as Record<string, unknown> | undefined;
  if (url.endsWith("/token/get")) {
    if (b?.appKey !== APP_KEY || !url.startsWith("https://ius.")) return AK_NOT_FOUND;
    return {
      errorCode: "0",
      data: {
        accessToken: "tok-1",
        expireTime: Date.now() / 1000 + 86400,
        areaDomain: "https://ius.hikcentralconnect.com",
      },
    };
  }
  if (url.endsWith("/cameras/get"))
    return {
      errorCode: "0",
      data: {
        camera: [
          {
            id: "res-porton",
            name: "Portón Hik",
            device: { devInfo: { serialNo: "FX9876543" } },
            onlineStatus: 1,
          },
        ],
      },
    };
  if (url.endsWith("/streamtoken/get"))
    return {
      errorCode: "0",
      data: {
        appKey: "x",
        appToken: "at.video",
        streamAreaDomain: "https://iusopen.ezvizlife.com",
      },
    };
  if (url.endsWith("/live/address/get")) {
    H.pedidoVideo = b;
    return { errorCode: "0", data: { url: "ezopen://open.ezviz.com/FX9876543/1.live" } };
  }
  return { errorCode: "OPEN000010", message: "?" };
}

beforeEach(() => {
  H.kv.clear();
  H.llamadas.length = 0;
  H.camarasPorTenant = {
    "t-main": [{ id: "cam_porton", nombre: "Portón" }],
    "t-otro": [{ id: "cam_otro", nombre: "Ajena" }],
  };
  H.hik = hikvisionReal;
  como("admin");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      H.llamadas.push(url);
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      return new Response(JSON.stringify(H.hik(url, body)), { status: 200 });
    }),
  );
});

async function vincular() {
  const r = await POST(
    req("/api/admin/camaras/hik-connect", "POST", {
      appKey: APP_KEY,
      secretKey: SECRET,
      region: "auto",
    }),
  );
  expect(r.status).toBe(200);
}

describe("vincular", () => {
  it("sin sesión → 401 (nunca 404)", async () => {
    H.payload = null;
    expect((await GET(req("/api/admin/camaras/hik-connect"))).status).toBe(401);
    expect((await POST(req("/api/admin/camaras/hik-connect", "POST", {}))).status).toBe(401);
  });

  it("una AppKey falsa devuelve el error de Hikvision traducido y NO se guarda nada", async () => {
    const r = await POST(
      req("/api/admin/camaras/hik-connect", "POST", {
        appKey: "falsa-12345678",
        secretKey: "falsa-12345678",
      }),
    );
    expect(r.status).toBe(422);
    const j = await r.json();
    expect(j).toMatchObject({ error: "hikvision", codigo: "OPEN000001" });
    expect(j.message).toMatch(/no reconoce esa AppKey/);
    expect(H.kv.size).toBe(0);
    /* «auto» probó las 4 regiones antes de rendirse. */
    expect(H.llamadas).toHaveLength(4);
  });

  it("la buena se prueba, se guarda CIFRADA y la respuesta no trae ninguna clave", async () => {
    const r = await POST(
      req("/api/admin/camaras/hik-connect", "POST", { appKey: APP_KEY, secretKey: SECRET }),
    );
    const j = await r.json();
    expect(j).toMatchObject({ vinculado: true, region: "us", ultimos4: "3456" });
    const texto =
      JSON.stringify(j) +
      JSON.stringify(await (await GET(req("/api/admin/camaras/hik-connect"))).json());
    expect(texto).not.toContain(APP_KEY);
    expect(texto).not.toContain(SECRET);
    const guardado = JSON.stringify(H.kv.get(CLAVE_KV));
    expect(guardado).not.toContain(APP_KEY);
    expect(guardado).not.toContain(SECRET);
    expect(guardado).toMatch(/"appKeyCifrada":"v1:/);
  });

  it("almacenero mira el estado pero no vincula; el encargado (manager) tampoco, aunque requireAdmin lo deje pasar", async () => {
    como("almacenero");
    expect((await GET(req("/api/admin/camaras/hik-connect"))).status).toBe(200);
    expect(
      (
        await POST(
          req("/api/admin/camaras/hik-connect", "POST", { appKey: APP_KEY, secretKey: SECRET }),
        )
      ).status,
    ).toBe(403);
    como("manager");
    expect(
      (
        await POST(
          req("/api/admin/camaras/hik-connect", "POST", { appKey: APP_KEY, secretKey: SECRET }),
        )
      ).status,
    ).toBe(403);
    expect((await LISTA(req("/api/admin/camaras/hik-connect/camaras"))).status).toBe(403);
    expect(H.kv.size).toBe(0);
  });

  it("desvincular borra claves y enlaces", async () => {
    await vincular();
    const r = await DELETE(req("/api/admin/camaras/hik-connect", "DELETE"));
    expect(await r.json()).toMatchObject({ vinculado: false, enlaces: {} });
    expect(H.kv.size).toBe(0);
  });
});

describe("enlazar y ver", () => {
  it("lista sin serie completa; enlazar toma nombre y serie de Hikvision, no del pedido", async () => {
    await vincular();
    const lista = await (await LISTA(req("/api/admin/camaras/hik-connect/camaras"))).json();
    expect(lista.camaras).toEqual([
      {
        resourceId: "res-porton",
        nombre: "Portón Hik",
        serieFinal: "6543",
        enLinea: true,
        enlazadaA: null,
      },
    ]);
    const r = await PATCH(
      req("/api/admin/camaras/hik-connect", "PATCH", {
        accion: "enlazar",
        camaraId: "cam_porton",
        resourceId: "res-porton",
        codigo: "abcdef",
        deviceSerial: "INVENTADA",
      }),
    );
    expect(await r.json()).toMatchObject({
      enlaces: { cam_porton: { nombreHik: "Portón Hik", serieFinal: "6543", conCodigo: true } },
    });
    const guardado = JSON.stringify(H.kv.get(CLAVE_KV));
    expect(guardado).toContain("FX9876543");
    expect(guardado).not.toContain("INVENTADA");
    expect(guardado).not.toContain("ABCDEF");
  });

  it("no se enlaza una cámara de otro negocio ni un recurso que Hikvision no tiene", async () => {
    await vincular();
    const ajena = await PATCH(
      req("/api/admin/camaras/hik-connect", "PATCH", {
        accion: "enlazar",
        camaraId: "cam_otro",
        resourceId: "res-porton",
      }),
    );
    expect(ajena.status).toBe(404);
    const inventado = await PATCH(
      req("/api/admin/camaras/hik-connect", "PATCH", {
        accion: "enlazar",
        camaraId: "cam_porton",
        resourceId: "res-xx",
      }),
    );
    expect(inventado.status).toBe(404);
  });

  it("el video: URL EZOPEN con el código adentro + appToken + dominio de la región; sin caché", async () => {
    await vincular();
    await PATCH(
      req("/api/admin/camaras/hik-connect", "PATCH", {
        accion: "enlazar",
        camaraId: "cam_porton",
        resourceId: "res-porton",
        codigo: "ABCDEF",
      }),
    );
    como("almacenero");
    const r = await VIDEO(
      req("/api/admin/camaras/cam_porton/en-vivo-nube", "POST", { tipo: "vivo", calidad: "sd" }),
      ctx("cam_porton"),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toMatchObject({
      url: "ezopen://ABCDEF@open.ezviz.com/FX9876543/1.live",
      accessToken: "at.video",
      dominio: "https://iusopen.ezvizlife.com",
      tipo: "vivo",
    });
    /* El código va también como `code` del pedido a Hikvision (es la clave del video cifrado). */
    expect(H.pedidoVideo).toMatchObject({ code: "ABCDEF", type: "1", protocol: "1" });
  });

  it("cámara de otro tenant → 404; sin enlace → 409; sin sesión → 401", async () => {
    await vincular();
    como("admin", "t-otro");
    expect(
      (
        await VIDEO(
          req("/api/admin/camaras/cam_porton/en-vivo-nube", "POST", {}),
          ctx("cam_porton"),
        )
      ).status,
    ).toBe(404);
    expect(
      (await VIDEO(req("/api/admin/camaras/cam_otro/en-vivo-nube", "POST", {}), ctx("cam_otro")))
        .status,
    ).toBe(409);
    H.payload = null;
    expect(
      (
        await VIDEO(
          req("/api/admin/camaras/cam_porton/en-vivo-nube", "POST", {}),
          ctx("cam_porton"),
        )
      ).status,
    ).toBe(401);
  });

  it("grabación sin rango → 400 antes de llamar a Hikvision", async () => {
    await vincular();
    await PATCH(
      req("/api/admin/camaras/hik-connect", "PATCH", {
        accion: "enlazar",
        camaraId: "cam_porton",
        resourceId: "res-porton",
      }),
    );
    const antes = H.llamadas.length;
    const r = await VIDEO(
      req("/api/admin/camaras/cam_porton/en-vivo-nube", "POST", { tipo: "grabacion" }),
      ctx("cam_porton"),
    );
    expect(r.status).toBe(400);
    expect(H.llamadas.length).toBe(antes);
  });
});
