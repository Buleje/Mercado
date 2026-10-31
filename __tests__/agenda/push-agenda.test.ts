/**
 * Aviso de la agenda al celular por Web Push (Brandon 20-10).
 *
 * Puro: ventana (ahora − 10 min, ahora], las sin hora en UN aviso a las 09:00,
 * lo resuelto no se avisa, dedupe por actividad + día + persona, topes.
 * Envío (`enviarPushAgenda`): dos disparos seguidos mandan una vez, el resumen
 * se pide con el rol VIGENTE de cada persona, 404/410 borra el celular, un
 * aviso que no llegó se reintenta, y un negocio nunca recibe lo de otro.
 * Ruta: 401 sin sesión, el dueño del celular sale de la sesión (nunca del
 * cuerpo), la vista de tienda no da de alta, nadie apaga el celular de otro.
 *
 * KV en memoria con candado en fila (como el advisory lock). Ningún push sale.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  fila: Promise.resolve() as Promise<unknown>,
  enviados: [] as { endpoint: string; carga: { title: string; body: string; url: string; tag: string } }[],
  codigo: new Map<string, number>(),
  usuarios: new Map<string, { active: boolean; role: string }>(),
  /** `${tenantId}:${rol}` → ocurrencias de hoy que ve ese rol. */
  resumenes: new Map<string, unknown[]>(),
  pedidosResumen: [] as string[],
  auth: null as unknown,
  /** Negocios suspendidos: `listActiveIds` no los devuelve. */
  suspendidos: new Set<string>(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/db/tenants.db", () => ({
  TenantsDB: {
    listActiveIds: async () =>
      ((H.kv.get("interno:agenda-celulares-indice") as string[] | undefined) ?? []).filter((id) => !H.suspendidos.has(id)),
  },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    get: async (key: string) => structuredClone(H.kv.get(key) ?? null),
    actualizar: (key: string, cambio: (actual: unknown) => { valor?: unknown; resultado: unknown }) => {
      const turno = H.fila.then(async () => {
        await new Promise((ok) => setTimeout(ok, 1));
        const r = await cambio(structuredClone(H.kv.get(key) ?? null));
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
vi.mock("@/lib/db/agenda.db", () => ({
  AgendaDB: {
    resumenHoy: async (tenantId: string, rol: string) => {
      H.pedidosResumen.push(`${tenantId}:${rol}`);
      const hoy = (H.resumenes.get(`${tenantId}:${rol}`) ?? []) as { estado: string }[];
      return { fecha: "2026-10-20", hoy, atrasadas: [], cuenta: { total: hoy.length, hechas: 0, pendientes: hoy.length, atrasadas: 0 }, alertas: [] };
    },
  },
}));
vi.mock("web-push", async (real) => {
  const wp = ((await real()) as { default: Record<string, unknown> }).default;
  return {
    default: {
      ...wp,
      sendNotification: async (sub: { endpoint: string }, carga: string) => {
        await new Promise((ok) => setTimeout(ok, 2));
        const statusCode = H.codigo.get(sub.endpoint) ?? 201;
        if (statusCode >= 400) throw Object.assign(new Error(`push ${statusCode}`), { statusCode });
        H.enviados.push({ endpoint: sub.endpoint, carga: JSON.parse(carga) });
        return { statusCode, body: "", headers: {} };
      },
    },
  };
});
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async () => H.auth ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
}));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));

import webpushReal from "web-push";
import {
  CLAVE_SIN_HORA,
  MAX_DISPOSITIVOS_POR_PERSONA,
  URL_AGENDA_HOY,
  altaDispositivo,
  avisosQueTocan,
  bajaDispositivo,
  claveAvisado,
  liberarAvisos,
  reservarAvisos,
  type DispositivoAgenda,
  type EstadoAgendaCelulares,
} from "@/lib/agenda/push-agenda";
import { enviarPushAgenda } from "@/lib/agenda/push-agenda.server";
import { idDeEndpointServidor } from "@/lib/db/camaras-celulares.db";
import { PREFIJO_SUPLANTACION } from "@/lib/auth/suplantacion";
import type { OcurrenciaDTO, ResumenAgendaHoy } from "@/lib/agenda/tipos";
import * as ruta from "@/app/api/admin/agenda/celular/route";

const HOY = "2026-10-20";
/** Hora de Lima del 20-10 → instante. */
const a = (hhmm: string, seg = 0) => new Date(Date.parse(`${HOY}T${hhmm}:00.000-05:00`) + seg * 1000);
const FCM = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;
const T = "t-blas";
const OTRO = "t-otro";

function oc(extra: Partial<OcurrenciaDTO> = {}): OcurrenciaDTO {
  return {
    actividadId: "asis",
    nombre: "Marcar la asistencia",
    regla: "asistencia",
    fecha: HOY,
    hora: "09:00",
    estado: "pendiente",
    origen: "fuente",
    detalle: "0 de 8 marcados",
    avance: { hecho: 0, total: 8 },
    href: "/admin?tab=rrhh",
    nota: null,
    marcadoPor: null,
    posponerA: null,
    ...extra,
  };
}

function resumen(hoy: OcurrenciaDTO[], fecha = HOY): ResumenAgendaHoy {
  return { fecha, hoy, atrasadas: [], cuenta: { total: hoy.length, hechas: 0, pendientes: hoy.length, atrasadas: 0 }, alertas: [] };
}

function celular(endpoint: string, username: string, role: DispositivoAgenda["role"] = "owner"): DispositivoAgenda {
  return {
    id: idDeEndpointServidor(endpoint),
    endpoint,
    keys: { p256dh: "BPkey-de-prueba-123", auth: "authkey1" },
    username,
    role,
    nombre: "Chrome en Android",
    creado: "2026-10-19T00:00:00Z",
  };
}

function sembrar(tenantId: string, dispositivos: DispositivoAgenda[]) {
  H.kv.set(`interno:agenda-celulares:${tenantId}`, { dispositivos, avisados: {} });
  const indice = (H.kv.get("interno:agenda-celulares-indice") as string[] | undefined) ?? [];
  if (!indice.includes(tenantId)) H.kv.set("interno:agenda-celulares-indice", [...indice, tenantId]);
}

const estadoDe = (tenantId: string) => H.kv.get(`interno:agenda-celulares:${tenantId}`) as EstadoAgendaCelulares;
const llegaron = () => H.enviados.map((e) => e.endpoint).sort();

beforeEach(() => {
  H.suspendidos.clear();
  H.kv.clear();
  H.enviados.length = 0;
  H.codigo.clear();
  H.usuarios.clear();
  H.resumenes.clear();
  H.pedidosResumen.length = 0;
  H.auth = null;
  for (const t of [T, OTRO]) {
    H.usuarios.set(`${t}:dueno`, { active: true, role: "owner" });
    H.usuarios.set(`${t}:caja`, { active: true, role: "cajero" });
  }
  const { publicKey, privateKey } = webpushReal.generateVAPIDKeys();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
  process.env.VAPID_EMAIL = "avisos@buleje.pe";
});

describe("qué toca avisar (puro)", () => {
  it("a su hora: (ahora − 10 min, ahora], ni antes ni después", () => {
    const r = resumen([oc()]);
    expect(avisosQueTocan(r, a("08:59", 59))).toEqual([]);
    expect(avisosQueTocan(r, a("09:00"))).toHaveLength(1);
    expect(avisosQueTocan(r, a("09:09", 59))).toHaveLength(1);
    expect(avisosQueTocan(r, a("09:10"))).toEqual([]);
  });

  it("título = la actividad, cuerpo = el detalle o «Te toca ahora», lleva a Hoy", () => {
    const [con] = avisosQueTocan(resumen([oc()]), a("09:03"));
    expect(con).toMatchObject({ clave: "asis", title: "Marcar la asistencia", body: "0 de 8 marcados", url: URL_AGENDA_HOY, tag: "agenda-asis" });
    const [sin] = avisosQueTocan(resumen([oc({ detalle: null })]), a("09:03"));
    expect(sin.body).toBe("Te toca ahora");
  });

  it("las sin hora salen en UN aviso a las 09:00 con sus nombres", () => {
    const r = resumen([oc({ actividadId: "caja", nombre: "Revisar la caja", hora: null }), oc({ actividadId: "luz", nombre: "Pagar la luz", hora: null })]);
    expect(avisosQueTocan(r, a("08:55"))).toEqual([]);
    const avisos = avisosQueTocan(r, a("09:05"));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ clave: CLAVE_SIN_HORA, title: "Hoy también: Revisar la caja, Pagar la luz" });
    expect(avisosQueTocan(r, a("10:00"))).toEqual([]);
  });

  it("lo hecho, omitido o pospuesto no se avisa; lo parcial sí", () => {
    for (const estado of ["hecha", "omitida", "pospuesta"] as const) {
      expect(avisosQueTocan(resumen([oc({ estado })]), a("09:01"))).toEqual([]);
      expect(avisosQueTocan(resumen([oc({ estado, hora: null })]), a("09:01"))).toEqual([]);
    }
    expect(avisosQueTocan(resumen([oc({ estado: "parcial", detalle: "3 de 8 marcados" })]), a("09:01"))[0].body).toBe("3 de 8 marcados");
  });

  it("un resumen de otro día no avisa (el cron cruzó la medianoche)", () => {
    expect(avisosQueTocan(resumen([oc()], "2026-10-19"), a("09:01"))).toEqual([]);
  });

  it("dedupe: el segundo disparo no aparta nada; otra persona sí; poda lo de ayer", () => {
    const aviso = avisosQueTocan(resumen([oc()]), a("09:00"))[0];
    const viejo: EstadoAgendaCelulares = { dispositivos: [], avisados: { [claveAvisado("2026-10-19", "dueno", "asis")]: "x" } };
    const uno = reservarAvisos(viejo, HOY, [{ username: "dueno", aviso }], "t1");
    expect(uno.reservados).toHaveLength(1);
    expect(Object.keys(uno.siguiente.avisados)).toEqual([claveAvisado(HOY, "dueno", "asis")]);
    const dos = reservarAvisos(uno.siguiente, HOY, [{ username: "dueno", aviso }, { username: "caja", aviso }], "t2");
    expect(dos.reservados.map((p) => p.username)).toEqual(["caja"]);
  });

  it("liberar devuelve sólo el turno propio (nadie lo tomó después)", () => {
    const k = claveAvisado(HOY, "dueno", "asis");
    const e: EstadoAgendaCelulares = { dispositivos: [], avisados: { [k]: "t1" } };
    expect(liberarAvisos(e, [k], "t2")).toBeNull();
    expect(liberarAvisos(e, [k], "t1")?.avisados).toEqual({});
  });

  it("alta: tope por persona, y el mismo navegador pasa a quien lo prendió; baja sólo la propia", () => {
    let e: EstadoAgendaCelulares = { dispositivos: [], avisados: {} };
    for (let i = 0; i < MAX_DISPOSITIVOS_POR_PERSONA; i++) {
      const r = altaDispositivo(e, celular(FCM(`d${i}`), "dueno"), a("08:00"));
      if (!r.ok) throw new Error(r.motivo);
      e = r.estado;
    }
    expect(altaDispositivo(e, celular(FCM("extra"), "dueno"), a("08:00")).ok).toBe(false);
    const re = altaDispositivo(e, celular(FCM("d0"), "caja", "cajero"), a("08:00"));
    expect(re.ok && re.estado.dispositivos.find((d) => d.endpoint === FCM("d0"))?.username).toBe("caja");
    expect(bajaDispositivo(e, idDeEndpointServidor(FCM("d1")), "caja")).toBeNull();
    expect(bajaDispositivo(e, idDeEndpointServidor(FCM("d1")), "dueno")?.dispositivos).toHaveLength(MAX_DISPOSITIVOS_POR_PERSONA - 1);
  });
});

describe("enviarPushAgenda", () => {
  it("dos disparos seguidos (09:00 y 09:05) mandan UNA vez por celular", async () => {
    sembrar(T, [celular(FCM("dueno-1"), "dueno"), celular(FCM("dueno-2"), "dueno")]);
    H.resumenes.set(`${T}:owner`, [oc()]);
    expect(await enviarPushAgenda(a("09:00"))).toEqual({ enviados: 2 });
    expect(await enviarPushAgenda(a("09:05"))).toEqual({ enviados: 0 });
    expect(llegaron()).toEqual([FCM("dueno-1"), FCM("dueno-2")]);
    expect(H.enviados[0].carga).toMatchObject({ title: "Marcar la asistencia", body: "0 de 8 marcados", url: URL_AGENDA_HOY });
  });

  it("dos disparos A LA VEZ tampoco duplican (el dedupe va bajo candado antes de mandar)", async () => {
    sembrar(T, [celular(FCM("dueno-1"), "dueno")]);
    H.resumenes.set(`${T}:owner`, [oc()]);
    const [x, y] = await Promise.all([enviarPushAgenda(a("09:00")), enviarPushAgenda(a("09:01"))]);
    expect(x.enviados + y.enviados).toBe(1);
  });

  it("el resumen se pide con el rol VIGENTE de cada persona (el cajero recibe sólo lo suyo)", async () => {
    sembrar(T, [celular(FCM("dueno"), "dueno"), celular(FCM("caja"), "caja", "owner")]);
    H.resumenes.set(`${T}:owner`, [oc(), oc({ actividadId: "gastos", nombre: "Anotar los gastos", detalle: null })]);
    H.resumenes.set(`${T}:cajero`, [oc({ actividadId: "gastos", nombre: "Anotar los gastos", detalle: null })]);
    await enviarPushAgenda(a("09:02"));
    expect(H.pedidosResumen.sort()).toEqual([`${T}:cajero`, `${T}:owner`]);
    expect(H.enviados.filter((e) => e.endpoint === FCM("caja")).map((e) => e.carga.title)).toEqual(["Anotar los gastos"]);
    expect(H.enviados.filter((e) => e.endpoint === FCM("dueno"))).toHaveLength(2);
  });

  it("usuario dado de baja: no recibe", async () => {
    sembrar(T, [celular(FCM("caja"), "caja", "cajero")]);
    H.usuarios.set(`${T}:caja`, { active: false, role: "cajero" });
    H.resumenes.set(`${T}:cajero`, [oc()]);
    expect(await enviarPushAgenda(a("09:00"))).toEqual({ enviados: 0 });
  });

  it("410 borra el celular; 500 devuelve el turno y el próximo disparo reintenta", async () => {
    sembrar(T, [celular(FCM("muerto"), "dueno"), celular(FCM("caido"), "caja", "cajero")]);
    H.resumenes.set(`${T}:owner`, [oc()]);
    H.resumenes.set(`${T}:cajero`, [oc()]);
    H.codigo.set(FCM("muerto"), 410);
    H.codigo.set(FCM("caido"), 500);
    expect(await enviarPushAgenda(a("09:00"))).toEqual({ enviados: 0 });
    expect(estadoDe(T).dispositivos.map((d) => d.endpoint)).toEqual([FCM("caido")]);
    H.codigo.delete(FCM("caido"));
    expect(await enviarPushAgenda(a("09:05"))).toEqual({ enviados: 1 });
    expect(llegaron()).toEqual([FCM("caido")]);
  });

  it("multi-negocio: cada celular recibe lo de SU negocio", async () => {
    sembrar(T, [celular(FCM("blas"), "dueno")]);
    sembrar(OTRO, [celular(FCM("otro"), "dueno")]);
    H.resumenes.set(`${T}:owner`, [oc({ actividadId: "aserrio", nombre: "Servicio de aserrío" })]);
    H.resumenes.set(`${OTRO}:owner`, [oc()]);
    await enviarPushAgenda(a("09:00"));
    const de = (ep: string) => H.enviados.filter((e) => e.endpoint === ep).map((e) => e.carga.title);
    expect(de(FCM("blas"))).toEqual(["Servicio de aserrío"]);
    expect(de(FCM("otro"))).toEqual(["Marcar la asistencia"]);
  });

  it("negocio suspendido: sus celulares no reciben", async () => {
    sembrar(T, [celular(FCM("blas"), "dueno")]);
    sembrar(OTRO, [celular(FCM("otro"), "dueno")]);
    H.resumenes.set(`${T}:owner`, [oc()]);
    H.resumenes.set(`${OTRO}:owner`, [oc()]);
    H.suspendidos.add(OTRO);
    await enviarPushAgenda(a("09:00"));
    expect(llegaron()).toEqual([FCM("blas")]);
  });

  it("sin claves VAPID no manda nada", async () => {
    sembrar(T, [celular(FCM("dueno"), "dueno")]);
    H.resumenes.set(`${T}:owner`, [oc()]);
    process.env.VAPID_PRIVATE_KEY = "xx";
    expect(await enviarPushAgenda(a("09:00"))).toEqual({ enviados: 0 });
    expect(H.enviados).toEqual([]);
  });
});

describe("ruta /api/admin/agenda/celular", () => {
  const URL_RUTA = "http://localhost/api/admin/agenda/celular";
  const req = (metodo: string, cuerpo?: unknown, q = "") =>
    new NextRequest(`${URL_RUTA}${q}`, {
      method: metodo,
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130.0" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  const sub = (n: string) => ({ subscription: { endpoint: FCM(n), keys: { p256dh: "BPkey-de-prueba-123", auth: "authkey1" } } });
  const como = (tenantId: string, username: string, role = "owner") => {
    H.auth = { tenantId, username, role };
  };

  it("sin sesión: 401 en todas", async () => {
    for (const r of [ruta.GET(req("GET")), ruta.POST(req("POST", sub("a"))), ruta.DELETE(req("DELETE", { id: "0123456789abcdef" }))]) {
      expect((await r).status).toBe(401);
    }
  });

  it("alta: el dueño es el usuario de la sesión (no el del cuerpo) y GET sólo muestra los míos", async () => {
    como(T, "caja", "cajero");
    const r = await ruta.POST(req("POST", { ...sub("caja"), username: "dueno" }));
    expect(r.status).toBe(200);
    expect(estadoDe(T).dispositivos[0]).toMatchObject({ username: "caja", role: "cajero", nombre: "Chrome en Android" });
    expect(H.kv.get("interno:agenda-celulares-indice")).toEqual([T]);
    como(T, "dueno");
    const j = (await (await ruta.GET(req("GET"))).json()) as { mios: unknown[]; clavePublica: string | null };
    expect(j.mios).toEqual([]);
    expect(j.clavePublica).toBeTruthy();
  });

  it("otro negocio no ve ni apaga mis celulares", async () => {
    como(T, "dueno");
    await ruta.POST(req("POST", sub("blas")));
    como(OTRO, "dueno");
    expect(((await (await ruta.GET(req("GET"))).json()) as { mios: unknown[] }).mios).toEqual([]);
    expect((await ruta.DELETE(req("DELETE", { id: idDeEndpointServidor(FCM("blas")) }))).status).toBe(404);
    expect(estadoDe(T).dispositivos).toHaveLength(1);
  });

  it("nadie apaga el celular de otra persona del mismo negocio", async () => {
    como(T, "dueno");
    await ruta.POST(req("POST", sub("dueno")));
    como(T, "caja", "cajero");
    expect((await ruta.DELETE(req("DELETE", { id: idDeEndpointServidor(FCM("dueno")) }))).status).toBe(404);
    como(T, "dueno");
    expect((await ruta.DELETE(req("DELETE", { id: idDeEndpointServidor(FCM("dueno")) }))).status).toBe(200);
    expect(estadoDe(T).dispositivos).toEqual([]);
  });

  it("la vista de tienda del superadmin no da de alta; un endpoint que no es de push, 400", async () => {
    como(T, `${PREFIJO_SUPLANTACION}brandon`, "admin");
    expect((await ruta.POST(req("POST", sub("x")))).status).toBe(403);
    como(T, "dueno");
    const malo = { subscription: { endpoint: "https://169.254.169.254/latest", keys: sub("x").subscription.keys } };
    expect((await ruta.POST(req("POST", malo))).status).toBe(400);
    expect(H.kv.get(`interno:agenda-celulares:${T}`)).toBeUndefined();
  });

  it("prueba: sólo a MIS celulares", async () => {
    sembrar(T, [celular(FCM("mio"), "dueno"), celular(FCM("ajeno"), "caja", "cajero")]);
    como(T, "dueno");
    const r = await ruta.POST(req("POST", undefined, "?prueba=1"));
    expect(r.status).toBe(200);
    expect(llegaron()).toEqual([FCM("mio")]);
  });

  it("prueba a un celular que el servicio dio de baja: 502 «muerto» y sale de la lista", async () => {
    sembrar(T, [celular(FCM("viejo"), "dueno")]);
    H.codigo.set(FCM("viejo"), 410);
    como(T, "dueno");
    const r = await ruta.POST(req("POST", undefined, "?prueba=1"));
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ ok: false, motivo: "muerto" });
    expect((await (await ruta.GET(req("GET"))).json()).mios).toEqual([]);
  });

  it("prueba con un 500 del servicio: 502 «no_salio» y el celular queda", async () => {
    sembrar(T, [celular(FCM("lento"), "dueno")]);
    H.codigo.set(FCM("lento"), 500);
    como(T, "dueno");
    const r = await ruta.POST(req("POST", undefined, "?prueba=1"));
    expect(await r.json()).toMatchObject({ ok: false, motivo: "no_salio" });
    expect((await (await ruta.GET(req("GET"))).json()).mios).toHaveLength(1);
  });
});
