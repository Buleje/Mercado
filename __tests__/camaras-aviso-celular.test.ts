/**
 * Avisos de cámaras al celular por Web Push (2026-10-10).
 *
 * Reglas de cuándo empujar (motivo, cámara activa, franja de cada dispositivo,
 * pausa de 10 min por cámara bajo candado), limpieza de dispositivos dados de
 * baja, y multi-negocio: un dispositivo de OTRO negocio nunca recibe el aviso
 * aunque esté suscrito a una cámara con el mismo id; la ruta da 404 a la cámara
 * ajena y no deja suscribir endpoints que no sean de un servicio de push.
 *
 * Corre con `CamarasDB` y `CamarasCelularesDB` reales sobre un KV en memoria
 * (con candado en fila, como el advisory lock). El envío de push es un doble:
 * ningún aviso sale de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  fila: Promise.resolve() as Promise<unknown>,
  enviados: [] as { endpoint: string; carga: { title: string; body: string; url: string } }[],
  /** endpoint → código que devuelve el servicio de push (default 201). */
  codigo: new Map<string, number>(),
  usuarios: new Map<string, { active: boolean; role: string }>(),
  auth: null as unknown,
}));

vi.mock("@/lib/logger", () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (key: string) => structuredClone(H.kv.get(key) ?? null),
    actualizar: (key: string, cambio: (actual: unknown) => { valor?: unknown; resultado: unknown }) => {
      const turno = H.fila.then(async () => {
        await new Promise((ok) => setTimeout(ok, 1));
        const r = cambio(structuredClone(H.kv.get(key) ?? null));
        if (r.valor !== undefined) H.kv.set(key, structuredClone(r.valor));
        return r.resultado;
      });
      H.fila = turno.catch(() => undefined);
      return turno;
    },
  },
}));
vi.mock("@/lib/db/admin-users.db", () => ({
  AdminUsersDB: {
    getByUsername: async (tenantId: string, username: string) => {
      const u = H.usuarios.get(`${tenantId}:${username}`);
      return u ? { id: username, name: username, ...u } : null;
    },
  },
}));
vi.mock("web-push", async (real) => {
  const wp = ((await real()) as { default: Record<string, unknown> }).default;
  return {
    default: {
      ...wp,
      sendNotification: async (sub: { endpoint: string }, carga: string) => {
        await new Promise((ok) => setTimeout(ok, 3));
        const statusCode = H.codigo.get(sub.endpoint) ?? 201;
        if (statusCode >= 400) throw Object.assign(new Error(`push ${statusCode}`), { statusCode });
        H.enviados.push({ endpoint: sub.endpoint, carga: JSON.parse(carga) });
        return { statusCode, body: "", headers: {} };
      },
    },
  };
});
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => H.auth }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));

import webpushReal from "web-push";
import {
  destinatariosDelPush,
  endpointDePushValido,
  etiquetaDispositivo,
  idDeEndpoint,
  type CelularSuscrito,
} from "@/lib/camaras/avisar-push";
import { avisarPersonaAlCelular, clavesVapid } from "@/lib/camaras/avisar-push.server";
import { idDeEndpointServidor } from "@/lib/db/camaras-celulares.db";
import type { Camara } from "@/lib/camaras/camaras";
import * as ruta from "@/app/api/admin/camaras/[id]/celular/route";

const T = "t-blas";
const OTRO = "t-otro";
/** 23:00 del 10-10 en Lima: de noche. */
const NOCHE = new Date("2026-10-11T04:00:00Z");
/** 12:00 del 10-10 en Lima: de día. */
const DIA = new Date("2026-10-10T17:00:00Z");

const FCM = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;

function camara(extra: Partial<Camara> = {}): Camara {
  return {
    id: "cam-patio",
    nombre: "Patio de trozas",
    lugar: "patio",
    token: "tok",
    activa: true,
    creadaEn: "2026-10-01T00:00:00Z",
    avisos: null,
    ...extra,
  } as Camara;
}

function celular(endpoint: string, usuario: string, camaras: CelularSuscrito["camaras"]): CelularSuscrito {
  return {
    id: idDeEndpointServidor(endpoint),
    endpoint,
    keys: { p256dh: "BPkey", auth: "authkey" },
    usuario,
    dispositivo: "Chrome en Android",
    camaras,
    creadoEn: "2026-10-10T00:00:00Z",
  };
}

function sembrar(tenantId: string, camaras: Camara[], dispositivos: CelularSuscrito[], ultimoPush: Record<string, string> = {}) {
  H.kv.set(`camaras:${tenantId}`, camaras);
  H.kv.set(`interno:camaras-celulares:${tenantId}`, { dispositivos, ultimoPush });
}

const llegaron = () => H.enviados.map((e) => e.endpoint).sort();

beforeEach(() => {
  H.kv.clear();
  H.enviados.length = 0;
  H.codigo.clear();
  H.usuarios.clear();
  for (const t of [T, OTRO]) {
    H.usuarios.set(`${t}:dueno`, { active: true, role: "owner" });
    H.usuarios.set(`${t}:almacen`, { active: true, role: "almacenero" });
  }
  const { publicKey, privateKey } = webpushReal.generateVAPIDKeys();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
  process.env.VAPID_EMAIL = "avisos@buleje.pe";
});

describe("reglas puras", () => {
  const d = (cuando: "siempre" | "noche", cam = "cam-patio") => celular(FCM(`${cuando}-${cam}`), "dueno", { [cam]: cuando });

  it("«siempre» avisa de día y de noche; «noche» sólo de 19 a 06 de Lima", () => {
    const lista = [d("siempre"), d("noche")];
    expect(destinatariosDelPush(camara(), lista, DIA, null).map((x) => x.endpoint)).toEqual([FCM("siempre-cam-patio")]);
    expect(destinatariosDelPush(camara(), lista, NOCHE, null)).toHaveLength(2);
  });

  it("cámara apagada, dentro de la pausa de 10 min o suscrito a otra cámara: nadie", () => {
    expect(destinatariosDelPush(camara({ activa: false }), [d("siempre")], DIA, null)).toEqual([]);
    const hace9 = new Date(DIA.getTime() - 9 * 60_000).toISOString();
    const hace10 = new Date(DIA.getTime() - 10 * 60_000).toISOString();
    expect(destinatariosDelPush(camara(), [d("siempre")], DIA, hace9)).toEqual([]);
    expect(destinatariosDelPush(camara(), [d("siempre")], DIA, hace10)).toHaveLength(1);
    expect(destinatariosDelPush(camara(), [d("siempre", "cam-porton")], DIA, null)).toEqual([]);
  });

  it("sólo acepta endpoints de servicios de push (el servidor les hace POST: nada interno)", () => {
    expect(endpointDePushValido(FCM("abc"))).toBe(true);
    expect(endpointDePushValido("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(endpointDePushValido("https://web.push.apple.com/QO"))
      .toBe(true);
    expect(endpointDePushValido("https://wns2-bl2p.notify.windows.com/w/?token=x")).toBe(true);
    expect(endpointDePushValido("https://jmt17.google.com/fcm/send/abc")).toBe(true);
    for (const malo of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com:8443/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost:3000/api/admin",
      "https://fcm.googleapis.com.evil.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "no-es-url",
    ]) {
      expect(endpointDePushValido(malo), malo).toBe(false);
    }
  });

  it("el id del navegador y el del servidor coinciden (así la pantalla sabe «este soy yo»)", async () => {
    expect(await idDeEndpoint(FCM("xyz"))).toBe(idDeEndpointServidor(FCM("xyz")));
  });

  it("nombra el dispositivo por el user-agent", () => {
    expect(etiquetaDispositivo("Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36")).toBe("Chrome en Android");
    expect(etiquetaDispositivo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari en iPhone");
    expect(etiquetaDispositivo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0")).toBe("Edge en Windows");
  });

  it("claves VAPID de relleno («xx...») cuentan como que no hay", () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "xx...";
    expect(clavesVapid()).toBeNull();
  });
});

describe("avisarPersonaAlCelular", () => {
  it("«apareció» llega a los dispositivos de la cámara, con texto y enlace a Personas, sin foto", async () => {
    sembrar(T, [camara()], [celular(FCM("dueno"), "dueno", { "cam-patio": "siempre" })]);
    const r = await avisarPersonaAlCelular(T, "cam-patio", { motivo: "aparecio", personas: 2 }, DIA);
    expect(r).toEqual({ resultado: "mandado", enviados: 1, total: 1 });
    expect(H.enviados[0].carga.title).toBe("📷 Patio de trozas (patio) · 12:00");
    expect(H.enviados[0].carga.body).toBe("Aparecieron 2 personas. Toca para ver las fotos.");
    expect(H.enviados[0].carga.url).toBe("/admin?tab=camaras&vista=personas");
    expect(JSON.stringify(H.enviados[0].carga)).not.toMatch(/https?:|storage|\.webp/);
  });

  it("«sigue en cuadro» nunca avisa", async () => {
    sembrar(T, [camara()], [celular(FCM("dueno"), "dueno", { "cam-patio": "siempre" })]);
    expect((await avisarPersonaAlCelular(T, "cam-patio", { motivo: "sigue", personas: 1 }, DIA)).resultado).toBe("no_corresponde");
    expect(H.enviados).toEqual([]);
  });

  it("un dispositivo de OTRO negocio no recibe nada aunque esté suscrito a una cámara con el mismo id", async () => {
    sembrar(T, [camara()], [celular(FCM("blas"), "dueno", { "cam-patio": "siempre" })]);
    sembrar(OTRO, [camara()], [celular(FCM("intruso"), "dueno", { "cam-patio": "siempre" })]);
    await avisarPersonaAlCelular(T, "cam-patio", { motivo: "aparecio", personas: 1 }, DIA);
    expect(llegaron()).toEqual([FCM("blas")]);
    /* Y la pausa que tomó Blas no frena al otro negocio. */
    expect(H.kv.get(`interno:camaras-celulares:${OTRO}`)).toMatchObject({ ultimoPush: {} });
  });

  it("un usuario de otro negocio con el mismo nombre no cuenta: si en ESTE negocio no existe, no recibe", async () => {
    H.usuarios.delete(`${T}:dueno`);
    sembrar(T, [camara()], [celular(FCM("dueno"), "dueno", { "cam-patio": "siempre" })]);
    const r = await avisarPersonaAlCelular(T, "cam-patio", { motivo: "aparecio", personas: 1 }, DIA);
    expect(r.resultado).toBe("no_salio");
    expect(H.enviados).toEqual([]);
  });

  it("usuario dado de baja o con un rol que no ve las fotos: no recibe", async () => {
    H.usuarios.set(`${T}:almacen`, { active: false, role: "almacenero" });
    H.usuarios.set(`${T}:caja`, { active: true, role: "cajero" });
    sembrar(T, [camara()], [
      celular(FCM("dueno"), "dueno", { "cam-patio": "siempre" }),
      celular(FCM("almacen"), "almacen", { "cam-patio": "siempre" }),
      celular(FCM("caja"), "caja", { "cam-patio": "siempre" }),
    ]);
    await avisarPersonaAlCelular(T, "cam-patio", { motivo: "aparecio", personas: 1 }, DIA);
    expect(llegaron()).toEqual([FCM("dueno")]);
  });

  it("dos fotos a la vez («apareció» + «llegó otra», o dos pantallas) = un solo aviso por dispositivo", async () => {
    sembrar(T, [camara()], [celular(FCM("dueno"), "dueno", { "cam-patio": "siempre" })]);
    const rs = await Promise.all([
      avisarPersonaAlCelular(T, "cam-patio", { motivo: "aparecio", personas: 1 }, DIA),
      avisarPersonaAlCelular(T, "cam-patio", { motivo: "mas_gente", personas: 2 }, new Date(DIA.getTime() + 1500)),
    ]);
    expect(rs.map((r) => r.resultado).sort()).toEqual(["mandado", "no_corresponde"]);
    expect(H.enviados).toHaveLength(1);
  });

  it("410 del servicio de push = el navegador se fue: se olvida, y el turno se devuelve", async () => {
    sembrar(T, [camara()], [celular(FCM("viejo"), "dueno", { "cam-patio": "siempre" })], { "cam-patio": "2026-10-09T00:00:00Z" });
    H.codigo.set(FCM("viejo"), 410);
    const r = await avisarPersonaAlCelular(T, "cam-patio", { motivo: "aparecio", personas: 1 }, DIA);
    expect(r.resultado).toBe("no_salio");
    expect(H.kv.get(`interno:camaras-celulares:${T}`)).toEqual({
      dispositivos: [],
      ultimoPush: { "cam-patio": "2026-10-09T00:00:00Z" },
    });
  });

  it("una dirección que no es de un servicio de push (escrita en el KV por otro lado) no recibe el POST y se olvida", async () => {
    sembrar(T, [camara()], [
      celular("https://169.254.169.254/latest/meta-data", "dueno", { "cam-patio": "siempre" }),
      celular(FCM("bueno"), "almacen", { "cam-patio": "siempre" }),
    ]);
    const r = await avisarPersonaAlCelular(T, "cam-patio", { motivo: "aparecio", personas: 1 }, DIA);
    expect(r).toEqual({ resultado: "mandado", enviados: 1, total: 2 });
    expect(llegaron()).toEqual([FCM("bueno")]);
    const guardado = H.kv.get(`interno:camaras-celulares:${T}`) as { dispositivos: CelularSuscrito[] };
    expect(guardado.dispositivos.map((d) => d.endpoint)).toEqual([FCM("bueno")]);
  });

  it("sin claves VAPID no toma el turno ni intenta mandar", async () => {
    process.env.VAPID_PRIVATE_KEY = "...";
    sembrar(T, [camara()], [celular(FCM("dueno"), "dueno", { "cam-patio": "siempre" })]);
    expect((await avisarPersonaAlCelular(T, "cam-patio", { motivo: "aparecio", personas: 1 }, DIA)).resultado).toBe("sin_claves");
    expect(H.kv.get(`interno:camaras-celulares:${T}`)).toMatchObject({ ultimoPush: {} });
  });
});

describe("ruta /api/admin/camaras/[id]/celular", () => {
  const sesion = (tenantId: string, username: string, role: string) => {
    H.auth = { tenantId, username, role };
  };
  const req = (metodo: string, cuerpo?: object) =>
    new NextRequest("http://localhost/api/admin/camaras/cam-patio/celular", {
      method: metodo,
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  const ctx = (id = "cam-patio") => ({ params: Promise.resolve({ id }) });
  const sub = (n: string) => ({ endpoint: FCM(n), keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });

  it("sin sesión: 401", async () => {
    H.auth = NextResponse.json({ error: "unauthorized" }, { status: 401 });
    expect((await ruta.GET(req("GET"), ctx())).status).toBe(401);
  });

  it("la cámara de otro negocio es 404 (y no se escribe nada en ninguno)", async () => {
    sembrar(OTRO, [camara()], []);
    H.kv.set(`camaras:${T}`, []);
    sesion(T, "dueno", "owner");
    expect((await ruta.GET(req("GET"), ctx())).status).toBe(404);
    expect((await ruta.PUT(req("PUT", { subscription: sub("x"), cuando: "siempre" }), ctx())).status).toBe(404);
    expect(H.kv.get(`interno:camaras-celulares:${T}`)).toBeUndefined();
    expect(H.kv.get(`interno:camaras-celulares:${OTRO}`)).toEqual({ dispositivos: [], ultimoPush: {} });
  });

  it("suscribe ESTE navegador en el negocio de la sesión y nunca devuelve el endpoint ni las claves", async () => {
    sembrar(T, [camara()], []);
    sesion(T, "dueno", "owner");
    const res = await ruta.PUT(req("PUT", { subscription: sub("mio"), cuando: "noche" }), ctx());
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.dispositivos).toEqual([
      expect.objectContaining({ id: idDeEndpointServidor(FCM("mio")), usuario: "dueno", dispositivo: "Chrome en Android", cuando: "noche", tuyo: true }),
    ]);
    expect(JSON.stringify(j)).not.toContain("fcm.googleapis.com");
    expect(JSON.stringify(j)).not.toContain("a".repeat(22));
  });

  it("tope de 5 dispositivos por usuario (409 claro); otro usuario del negocio todavía entra", async () => {
    sembrar(T, [camara()], [1, 2, 3, 4, 5].map((n) => celular(FCM(`alm-${n}`), "almacen", { "cam-patio": "siempre" })));
    sesion(T, "almacen", "almacenero");
    const lleno = await ruta.PUT(req("PUT", { subscription: sub("alm-6"), cuando: "siempre" }), ctx());
    expect(lleno.status).toBe(409);
    expect((await lleno.json()).motivo).toBe("Ya tienes 5 dispositivos recibiendo avisos. Quita alguno que ya no uses.");
    /* Re-suscribir uno que ya está (cambiar la franja) no cuenta como nuevo. */
    expect((await ruta.PUT(req("PUT", { subscription: sub("alm-1"), cuando: "noche" }), ctx())).status).toBe(200);
    sesion(T, "dueno", "owner");
    expect((await ruta.PUT(req("PUT", { subscription: sub("dueno-1"), cuando: "siempre" }), ctx())).status).toBe(200);
  });

  it("un endpoint que no es de un servicio de push: 400", async () => {
    sembrar(T, [camara()], []);
    sesion(T, "dueno", "owner");
    const malo = { endpoint: "https://169.254.169.254/latest", keys: sub("x").keys };
    expect((await ruta.PUT(req("PUT", { subscription: malo, cuando: "siempre" }), ctx())).status).toBe(400);
  });

  it("el almacenero no quita el dispositivo de otro (403); el dueño sí", async () => {
    sembrar(T, [camara()], [celular(FCM("dueno"), "dueno", { "cam-patio": "siempre", "cam-porton": "noche" })]);
    const id = idDeEndpointServidor(FCM("dueno"));
    sesion(T, "almacen", "almacenero");
    expect((await ruta.DELETE(req("DELETE", { id }), ctx())).status).toBe(403);
    sesion(T, "dueno", "owner");
    const res = await ruta.DELETE(req("DELETE", { id }), ctx());
    expect(res.status).toBe(200);
    /* Sólo se apagó esta cámara: el portón sigue avisando a ese celular. */
    const guardado = H.kv.get(`interno:camaras-celulares:${T}`) as { dispositivos: CelularSuscrito[] };
    expect(guardado.dispositivos[0].camaras).toEqual({ "cam-porton": "noche" });
  });

  it("«Probar» devuelve el código del servicio de push", async () => {
    sembrar(T, [camara()], [celular(FCM("dueno"), "dueno", { "cam-patio": "siempre" })]);
    sesion(T, "dueno", "owner");
    const res = await ruta.POST(req("POST", { id: idDeEndpointServidor(FCM("dueno")) }), ctx());
    expect(await res.json()).toMatchObject({ ok: true, status: 201 });
    expect(H.enviados[0].carga.title).toBe("📷 Patio de trozas · prueba");
  });
});
