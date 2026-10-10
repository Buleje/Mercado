/**
 * Modo TV (ADR-473) — emparejar por código:
 *  · POST /api/tv/emparejar → código del alfabeto + secreto.
 *  · GET /api/tv/estado (secreto en header): esperando · vencido (también con
 *    secreto malo: no revela qué códigos viven) · vinculada UNA sola vez con la
 *    cookie `buleje-tv`, también con otro TV del negocio en el caché.
 *  · /api/admin/camaras/pantallas con el `requireAdmin` REAL (sólo se simula el
 *    JWT): roles, cámaras de otro negocio, código usado, tope de 10, revocar.
 * Redis va por el respaldo en memoria; `platform_settings`, por un Map.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  process.env.UPSTASH_REDIS_REST_URL = "";
  process.env.UPSTASH_REDIS_REST_TOKEN = "";
  return {
    kv: new Map<string, unknown>(),
    payload: null as null | { username: string; role: string; tenantId: string },
    camaras: {} as Record<string, { id: string; nombre: string }[]>,
    enlaces: {} as Record<string, Record<string, unknown>>,
  };
});

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/db/camaras.db", () => ({ CamarasDB: { list: async (t: string) => H.camaras[t] ?? [] } }));
vi.mock("@/lib/db/camaras-hik-connect.db", () => ({
  CamarasHikConnectDB: { leer: async (t: string) => ({ enlaces: H.enlaces[t] ?? {} }) },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (k: string) => structuredClone(H.kv.get(k) ?? null),
    actualizar: async (
      k: string,
      cambio: (a: unknown, tx: unknown) => Promise<{ valor?: unknown; resultado: unknown }> | { valor?: unknown; resultado: unknown },
    ) => {
      const r = await cambio(structuredClone(H.kv.get(k) ?? null), {});
      if (r.valor !== undefined) H.kv.set(k, structuredClone(r.valor));
      return r.resultado;
    },
  },
}));

import { POST as emparejar } from "@/app/api/tv/emparejar/route";
import { GET as estado } from "@/app/api/tv/estado/route";
import { DELETE as desconectar, GET as listar, POST as vincular } from "@/app/api/admin/camaras/pantallas/route";
import { __reiniciarKvEfimero } from "@/lib/camaras/kv-efimero.server";
import { PantallasTvDB } from "@/lib/db/pantallas-tv.db";
import { verificarTokenTv } from "@/lib/camaras/tv-token.server";
import { marcarParVinculado } from "@/lib/camaras/tv-emparejar.server";
import {
  TV_ALFABETO,
  TV_HEADER_SECRETO,
  TV_CODIGO_LARGO,
  TV_CODIGO_VIDA_S,
  type PantallaTv,
  type TvEmparejarRespuesta,
} from "@/lib/camaras/pantallas-tv";

const CSRF = { cookie: "csrf-token=tok", "x-csrf-token": "tok" };
let ip = 0;
/* El cupo del panel es por IP (MODERATE 20/5 min): una IP por test. */
let ipPanel = "10.1.0.0";
const como = (role: string, tenantId = "t-a") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

async function pedirCodigo(): Promise<TvEmparejarRespuesta> {
  ip++;
  const r = await emparejar(
    new NextRequest("http://localhost/api/tv/emparejar", {
      method: "POST",
      headers: { ...CSRF, "x-forwarded-for": `10.0.0.${ip}` },
    }),
  );
  expect(r.status).toBe(201);
  return (await r.json()) as TvEmparejarRespuesta;
}
const preguntar = (codigo: string, secreto: string) =>
  estado(
    new NextRequest(`http://localhost/api/tv/estado?codigo=${encodeURIComponent(codigo)}`, {
      headers: { [TV_HEADER_SECRETO]: secreto },
    }),
  );
const vincularCon = (cuerpo: Record<string, unknown>) =>
  vincular(
    new NextRequest("http://localhost/api/admin/camaras/pantallas", {
      method: "POST",
      headers: {
        cookie: "csrf-token=tok; buleje-admin-sess=x",
        "x-csrf-token": "tok",
        "content-type": "application/json",
        "x-forwarded-for": ipPanel,
      },
      body: JSON.stringify(cuerpo),
    }),
  );
const cookieTv = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith("buleje-tv="));

beforeEach(() => {
  vi.useRealTimers();
  H.kv.clear();
  ipPanel = `10.1.${++ip}.1`;
  __reiniciarKvEfimero();
  PantallasTvDB.__olvidarTodo();
  H.enlaces = {};
  H.camaras = {
    "t-a": [
      { id: "cam_a1", nombre: "Portón" },
      { id: "cam_a2", nombre: "Patio" },
    ],
    "t-b": [{ id: "cam_b1", nombre: "Ajena" }],
  };
  como("owner");
});

describe("POST /api/tv/emparejar", () => {
  it("da un código del alfabeto del contrato y un secreto largo", async () => {
    const r = await pedirCodigo();
    expect(r.codigo).toHaveLength(TV_CODIGO_LARGO);
    expect([...r.codigo].every((c) => TV_ALFABETO.includes(c))).toBe(true);
    expect(r.secreto.length).toBeGreaterThanOrEqual(40);
    expect(new Date(r.expiraEn).getTime()).toBeGreaterThan(Date.now());
    /* En Redis queda el hash, nunca el secreto. */
    expect(JSON.stringify([...H.kv.values()])).not.toContain(r.secreto);
  });

  it("cupo estricto por IP: el 11.º en 10 min → 429", async () => {
    const pedir = () =>
      emparejar(
        new NextRequest("http://localhost/api/tv/emparejar", {
          method: "POST",
          headers: { ...CSRF, "x-forwarded-for": "10.9.9.9" },
        }),
      );
    for (let i = 0; i < 10; i++) expect((await pedir()).status).toBe(201);
    expect((await pedir()).status).toBe(429);
  });
});

describe("GET /api/tv/estado", () => {
  it("esperando mientras nadie lo vincula", async () => {
    const p = await pedirCodigo();
    const r = await preguntar(p.codigo, p.secreto);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ estado: "esperando" });
    expect(cookieTv(r)).toBeUndefined();
  });

  it("secreto malo = lo mismo que un código inexistente: «vencido», sin cookie", async () => {
    const p = await pedirCodigo();
    const malo = await preguntar(p.codigo, "x".repeat(43));
    const inventado = await preguntar("ZZZZZZ", "x".repeat(43));
    expect(malo.status).toBe(200);
    expect(await malo.json()).toEqual({ estado: "vencido" });
    expect(await inventado.json()).toEqual({ estado: "vencido" });
    expect(cookieTv(malo)).toBeUndefined();
    /* El dueño del código sigue esperando: el intento ajeno no lo quemó. */
    expect(await (await preguntar(p.codigo, p.secreto)).json()).toEqual({ estado: "esperando" });
  });

  it("el secreto en la URL no sirve: sólo el header", async () => {
    const p = await pedirCodigo();
    const r = await estado(
      new NextRequest(`http://localhost/api/tv/estado?codigo=${p.codigo}&secreto=${encodeURIComponent(p.secreto)}`),
    );
    expect(r.status).toBe(400);
  });

  it("con otro TV del mismo negocio activo (lista en caché), el nuevo igual se vincula", async () => {
    const p1 = await pedirCodigo();
    expect((await vincularCon({ codigo: p1.codigo, nombre: "TV 1", camaras: null, horas: 8 })).status).toBe(201);
    expect(cookieTv(await preguntar(p1.codigo, p1.secreto))).toBeDefined();
    /* El caché de esta instancia ya tiene [TV 1]. Otra instancia vincula TV 2
       (escribe la base y el par) sin poder limpiar este caché. */
    const p2 = await pedirCodigo();
    const tv2: PantallaTv = {
      id: "tv_otra_instancia",
      nombre: "TV 2",
      camaras: null,
      creadaPor: "qa",
      creadaEn: new Date().toISOString(),
      expiraEn: new Date(Date.now() + 3_600_000).toISOString(),
      ultimaVez: null,
    };
    H.kv.set("interno:tv:pantallas:t-a", [...(H.kv.get("interno:tv:pantallas:t-a") as PantallaTv[]), tv2]);
    expect(await marcarParVinculado(p2.codigo, { tid: "t-a", pid: tv2.id, nombre: tv2.nombre, expiraEn: tv2.expiraEn })).toBe(true);
    const r = await preguntar(p2.codigo, p2.secreto);
    expect(await r.json()).toEqual({ estado: "vinculada", pantalla: { nombre: "TV 2", expiraEn: tv2.expiraEn } });
    expect(cookieTv(r)).toBeDefined();
  });

  it("código que no existe o venció → vencido", async () => {
    const p = await pedirCodigo();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + (TV_CODIGO_VIDA_S + 1) * 1000);
    expect(await (await preguntar(p.codigo, p.secreto)).json()).toEqual({ estado: "vencido" });
  });

  it("parámetros raros → 400", async () => {
    expect((await preguntar("ABC", "y".repeat(43))).status).toBe(400);
    expect((await preguntar("ABCDE0", "y".repeat(43))).status).toBe(400); // 0 no está en el alfabeto
  });

  it("vinculada: la primera vez deja la cookie firmada; la segunda ya es vencido (un solo uso)", async () => {
    const p = await pedirCodigo();
    const v = await vincularCon({ codigo: p.codigo.toLowerCase(), nombre: "TV del local", camaras: ["cam_a1"], horas: 8 });
    expect(v.status).toBe(201);
    const { pantalla } = (await v.json()) as { pantalla: { id: string; expiraEn: string } };

    const r1 = await preguntar(p.codigo, p.secreto);
    expect(await r1.json()).toEqual({ estado: "vinculada", pantalla: { nombre: "TV del local", expiraEn: pantalla.expiraEn } });
    const c = cookieTv(r1)!;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=lax/i);
    expect(c).toMatch(/Path=\//);
    const token = c.split(";")[0]!.slice("buleje-tv=".length);
    expect(verificarTokenTv(token)).toMatchObject({ typ: "tv", tid: "t-a", pid: pantalla.id });

    const r2 = await preguntar(p.codigo, p.secreto);
    expect(await r2.json()).toEqual({ estado: "vencido" });
    expect(cookieTv(r2)).toBeUndefined();
  });

  it("la revocaron antes de que el TV preguntara → vencido, sin cookie", async () => {
    const p = await pedirCodigo();
    const v = (await (await vincularCon({ codigo: p.codigo, nombre: "TV", camaras: null, horas: 24 })).json()) as {
      pantalla: { id: string };
    };
    await PantallasTvDB.revocar("t-a", v.pantalla.id, "qa");
    const r = await preguntar(p.codigo, p.secreto);
    expect(await r.json()).toEqual({ estado: "vencido" });
    expect(cookieTv(r)).toBeUndefined();
  });
});

describe("/api/admin/camaras/pantallas", () => {
  it("avisa si eligió cámaras de Hik-Connect sueltas (en el TV no se verán por la nube)", async () => {
    H.enlaces = { "t-a": { cam_a1: {}, cam_a2: {} } };
    const sueltas = (await (await vincularCon({ codigo: (await pedirCodigo()).codigo, nombre: "TV", camaras: ["cam_a1"], horas: 8 })).json()) as {
      aviso?: string;
    };
    expect(sueltas.aviso).toMatch(/Portón es de Hik-Connect.*todas/);
    const todasNube = (await (
      await vincularCon({ codigo: (await pedirCodigo()).codigo, nombre: "TV", camaras: ["cam_a1", "cam_a2"], horas: 8 })
    ).json()) as { aviso?: string };
    expect(todasNube.aviso).toBeUndefined();
    const todas = (await (await vincularCon({ codigo: (await pedirCodigo()).codigo, nombre: "TV", camaras: null, horas: 8 })).json()) as {
      aviso?: string;
    };
    expect(todas.aviso).toBeUndefined();
  });

  it("almacenero y encargado no conectan pantallas (403); sin sesión 401", async () => {
    const p = await pedirCodigo();
    como("almacenero");
    expect((await vincularCon({ codigo: p.codigo, nombre: "TV", camaras: null, horas: 8 })).status).toBe(403);
    como("manager");
    expect((await vincularCon({ codigo: p.codigo, nombre: "TV", camaras: null, horas: 8 })).status).toBe(403);
    H.payload = null;
    expect((await vincularCon({ codigo: p.codigo, nombre: "TV", camaras: null, horas: 8 })).status).toBe(401);
  });

  it("cámaras de otro negocio → 404 y el código sigue libre", async () => {
    const p = await pedirCodigo();
    const r = await vincularCon({ codigo: p.codigo, nombre: "TV", camaras: ["cam_a1", "cam_b1"], horas: 8 });
    expect(r.status).toBe(404);
    expect(await PantallasTvDB.listar("t-a")).toHaveLength(0);
    expect(await (await preguntar(p.codigo, p.secreto)).json()).toEqual({ estado: "esperando" });
  });

  it("horas fuera de las ofrecidas → 400; código usado → 409; inventado → 404", async () => {
    const p = await pedirCodigo();
    expect((await vincularCon({ codigo: p.codigo, nombre: "TV", camaras: null, horas: 5 })).status).toBe(400);
    expect((await vincularCon({ codigo: p.codigo, nombre: "TV", camaras: null, horas: 8 })).status).toBe(201);
    expect((await vincularCon({ codigo: p.codigo, nombre: "TV 2", camaras: null, horas: 8 })).status).toBe(409);
    expect((await vincularCon({ codigo: "ZZZZZZ", nombre: "TV", camaras: null, horas: 8 })).status).toBe(404);
  });

  it("tope de 10 pantallas por negocio", async () => {
    for (let i = 0; i < 10; i++) {
      const p = await pedirCodigo();
      expect((await vincularCon({ codigo: p.codigo, nombre: `TV ${i}`, camaras: null, horas: 8 })).status).toBe(201);
    }
    const p = await pedirCodigo();
    expect((await vincularCon({ codigo: p.codigo, nombre: "TV 11", camaras: null, horas: 8 })).status).toBe(409);
  });

  it("GET lista sólo las del negocio de la sesión; DELETE de otro negocio → 404", async () => {
    const p = await pedirCodigo();
    const { pantalla } = (await (await vincularCon({ codigo: p.codigo, nombre: "TV A", camaras: null, horas: 8 })).json()) as {
      pantalla: { id: string };
    };
    const req = (url: string, method = "GET") =>
      new NextRequest(url, {
        method,
        headers: { cookie: "csrf-token=tok; buleje-admin-sess=x", "x-csrf-token": "tok", "x-forwarded-for": ipPanel },
      });

    como("owner", "t-b");
    expect(await (await listar(req("http://localhost/api/admin/camaras/pantallas"))).json()).toEqual({ pantallas: [] });
    expect((await desconectar(req(`http://localhost/api/admin/camaras/pantallas?id=${pantalla.id}`, "DELETE"))).status).toBe(404);

    como("admin", "t-a");
    const lista = (await (await listar(req("http://localhost/api/admin/camaras/pantallas"))).json()) as { pantallas: { id: string }[] };
    expect(lista.pantallas.map((x) => x.id)).toEqual([pantalla.id]);
    expect((await desconectar(req(`http://localhost/api/admin/camaras/pantallas?id=${pantalla.id}`, "DELETE"))).status).toBe(200);
    expect(await PantallasTvDB.listar("t-a")).toHaveLength(0);
  });
});
