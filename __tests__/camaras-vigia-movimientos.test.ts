/**
 * El vigía de movimientos (2026-10-23): qué es nuevo para el celular, los
 * frenos, el agrupado, el interruptor y el cron. Lo puro sin mocks; la vuelta
 * del servidor con la cola, la base y el push falsos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CelularSuscrito } from "@/lib/camaras/avisar-push";
import type { MovimientoNube } from "@/lib/camaras/movimientos-nube";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  movimientos: [] as Array<Record<string, unknown>>,
  fuenteOk: true,
  camarasActivas: ["cam-entrada", "cam-patio"] as string[],
  dispositivos: [] as Array<Record<string, unknown>>,
  ajustes: null as unknown,
  vigentes: null as Set<string> | null,
  statusPush: 201 as number | null,
  mandar: [] as Array<{ id: string; carga: Record<string, unknown>; topic: string }>,
  campana: [] as Array<Record<string, unknown>>,
  olvidados: [] as string[][],
  indice: {} as Record<string, { tenantId?: string }>,
}));

vi.mock("@/lib/camaras/kv-efimero.server", () => ({
  kvLeer: async (k: string) => (H.kv.has(k) ? structuredClone(H.kv.get(k)) : null),
  kvEscribir: async (k: string, v: unknown, _s: number, o: { soloSiNueva?: boolean } = {}) => {
    if (o.soloSiNueva && H.kv.has(k)) return false;
    H.kv.set(k, structuredClone(v));
    return true;
  },
  kvBorrarSiEs: async (k: string, v: string) => {
    if (H.kv.get(k) !== v) return false;
    H.kv.delete(k);
    return true;
  },
}));
vi.mock("@/lib/camaras/movimientos-nube.server", () => ({
  fuenteDeMovimientos: async () =>
    H.fuenteOk
      ? {
          ok: true,
          camaras: [],
          lista: [
            { id: "cam-entrada", nombre: "Entrada", activa: H.camarasActivas.includes("cam-entrada") },
            { id: "cam-patio", nombre: "Patio", activa: H.camarasActivas.includes("cam-patio") },
          ],
          cred: {},
        }
      : { ok: false, motivo: null },
  movimientosRecientes: async () => ({ movimientos: structuredClone(H.movimientos), consultadoAt: 1, aviso: null }),
}));
vi.mock("@/lib/db/camaras-celulares.db", () => ({
  CamarasCelularesDB: {
    /* La caché de 5 min todavía no ve a nadie: el vigía tiene que leer fresco para mandar. */
    listar: async () => ({ dispositivos: [], ultimoPush: {} }),
    listarFresco: async () => ({ dispositivos: structuredClone(H.dispositivos), ultimoPush: {} }),
    olvidarEndpoints: async (_t: string, endpoints: string[]) => {
      H.olvidados.push(endpoints);
    },
  },
}));
vi.mock("@/lib/db/notification-center.db", () => ({
  NotificationCenterDB: {
    createOrReuse: async (n: Record<string, unknown>) => {
      H.campana.push(n);
      return { created: H.campana.length === 1 };
    },
  },
}));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (k: string) => (k === "camaras-token-index" ? H.indice : H.ajustes),
    actualizar: async (_k: string, fn: (v: unknown) => { valor: unknown; resultado: unknown }) => {
      const r = fn(H.ajustes);
      H.ajustes = r.valor;
      return r.resultado;
    },
  },
}));
vi.mock("@/lib/camaras/avisar-push.server", () => ({
  clavesVapid: () => ({ publicKey: "pub", privateKey: "priv", email: "mailto:x@y.z" }),
  esPushMuerto: (e: { status: number | null }) => e.status === 404 || e.status === 410,
  soloUsuariosVigentes: async (_t: string, ds: Array<{ usuario: string }>) =>
    H.vigentes ? ds.filter((d) => H.vigentes?.has(d.usuario)) : ds,
  mandarPush: async (_v: unknown, d: { id: string; endpoint: string }, carga: Record<string, unknown>, topic: string) => {
    H.mandar.push({ id: d.id, carga, topic });
    return { endpoint: d.endpoint, status: H.statusPush, error: null };
  },
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: async () => undefined }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  AJUSTES_CELULAR_INICIAL,
  PUSH_POR_CAMARA_MS,
  VENTANA_PUSH_MS,
  VIGIA_INICIAL,
  decidirAvisos,
  devolverTurnos,
  fijarSilencio,
  leerAjustesCelular,
  leerEstadoVigia,
  pushParaDispositivo,
} from "@/lib/camaras/vigia-movimientos";
import { cambiarAjustesCelular, vigilarNegocio, vigilarTodos } from "@/lib/camaras/vigia-movimientos.server";
import { GET as CRON } from "@/app/api/cron/camaras-movimientos/route";

/** 07:44 en Lima (de día). */
const AHORA = Date.parse("2026-10-23T12:44:00Z");
/** 22:00 en Lima (de noche). */
const NOCHE = Date.parse("2026-10-23T03:00:00Z");
const MIN = 60_000;
const T = "tenant-blas";

const mov = (id: string, camaraId: string, haceMin: number, conFoto = true, base = AHORA): MovimientoNube => ({
  id,
  camaraId,
  nombre: camaraId === "cam-entrada" ? "Entrada" : "Patio",
  at: base - haceMin * MIN,
  conFoto,
});
const ACTIVAS = new Set(["cam-entrada", "cam-patio"]);
const celular = (
  id: string,
  usuario: string,
  camaras: CelularSuscrito["camaras"],
): Pick<CelularSuscrito, "usuario" | "camaras"> & Record<string, unknown> => ({
  id,
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  keys: { p256dh: "p", auth: "a" },
  usuario,
  dispositivo: "Chrome en Android",
  camaras,
  creadoEn: "2026-10-23T00:00:00Z",
});

describe("qué movimiento es nuevo para el celular", () => {
  it("sólo lo no decidido y de los últimos 10 min; lo viejo y lo del futuro no", () => {
    const d = decidirAvisos(
      { avisados: ["ya"], ultimoPorCamara: {} },
      [mov("ya", "cam-entrada", 1), mov("viejo", "cam-entrada", 11), mov("bueno", "cam-entrada", 2), mov("futuro", "cam-patio", -5)],
      AHORA,
      ACTIVAS,
    );
    expect(d.nuevos).toBe(1);
    expect(d.grupo?.camaras.map((c) => c.id)).toEqual(["cam-entrada"]);
    expect(d.estado.avisados).toEqual(["ya", "bueno"]);
    expect(VENTANA_PUSH_MS).toBe(10 * MIN);
  });

  it("la misma lista dos veces: la segunda no avisa nada", () => {
    const lista = [mov("a", "cam-entrada", 1)];
    const primera = decidirAvisos(VIGIA_INICIAL, lista, AHORA, ACTIVAS);
    const segunda = decidirAvisos(primera.estado, lista, AHORA + 30_000, ACTIVAS);
    expect(primera.grupo).not.toBeNull();
    expect(segunda).toMatchObject({ nuevos: 0, grupo: null });
  });

  it("la cámara apagada en el panel: se da por visto sin avisar", () => {
    const d = decidirAvisos(VIGIA_INICIAL, [mov("a", "cam-patio", 1)], AHORA, new Set(["cam-entrada"]));
    expect(d).toMatchObject({ nuevos: 1, grupo: null });
    expect(d.estado.avisados).toEqual(["a"]);
  });

  it("lo guardado roto = nada decidido; los ajustes rotos = prendido", () => {
    expect(leerEstadoVigia("basura")).toEqual(VIGIA_INICIAL);
    expect(leerEstadoVigia({ avisados: [1, "x"], ultimoPorCamara: { c: "no" } })).toEqual({ avisados: ["x"], ultimoPorCamara: {} });
    expect(leerAjustesCelular(null)).toEqual(AJUSTES_CELULAR_INICIAL);
    expect(leerAjustesCelular({ prendido: false }).prendido).toBe(false);
  });
});

describe("frenos y agrupado", () => {
  it("una cámara cada 5 min: lo de antes queda visto pero no avisa", () => {
    const primera = decidirAvisos(VIGIA_INICIAL, [mov("a", "cam-entrada", 4)], AHORA, ACTIVAS);
    const frenada = decidirAvisos(primera.estado, [mov("a", "cam-entrada", 4), mov("b", "cam-entrada", 1)], AHORA, ACTIVAS);
    expect(frenada).toMatchObject({ nuevos: 1, grupo: null, frenadas: ["cam-entrada"] });
    expect(frenada.estado.avisados).toContain("b");
    const pasada = decidirAvisos(frenada.estado, [mov("c", "cam-entrada", 4 - PUSH_POR_CAMARA_MS / MIN - 0.5)], AHORA + 6 * MIN, ACTIVAS);
    expect(pasada.grupo?.camaras.map((c) => c.id)).toEqual(["cam-entrada"]);
  });

  it("lo de la misma vuelta va junto, del más viejo al más nuevo, con la última foto", () => {
    const d = decidirAvisos(
      VIGIA_INICIAL,
      [mov("p1", "cam-patio", 3), mov("e1", "cam-entrada", 2), mov("e2", "cam-entrada", 1, false)],
      AHORA,
      ACTIVAS,
    );
    expect(d.grupo?.camaras).toEqual([
      { id: "cam-patio", nombre: "Patio", at: AHORA - 3 * MIN, cuantos: 1, fotoId: "p1" },
      { id: "cam-entrada", nombre: "Entrada", at: AHORA - 1 * MIN, cuantos: 2, fotoId: "e1" },
    ]);
  });

  it("si no salió ningún push, las cámaras vuelven a su turno anterior", () => {
    const antes = { avisados: [], ultimoPorCamara: { "cam-patio": AHORA - 20 * MIN } };
    const d = decidirAvisos(antes, [mov("p", "cam-patio", 1), mov("e", "cam-entrada", 1)], AHORA, ACTIVAS);
    const vuelto = devolverTurnos(d.estado, antes, d.grupo!);
    expect(vuelto.ultimoPorCamara).toEqual({ "cam-patio": AHORA - 20 * MIN });
    expect(vuelto.avisados).toEqual(d.estado.avisados);
  });
});

describe("el aviso de cada celular", () => {
  const grupo = decidirAvisos(VIGIA_INICIAL, [mov("p1", "cam-patio", 3), mov("e1", "cam-entrada", 2)], AHORA, ACTIVAS).grupo!;

  it("«Movimiento en Entrada · 07:44» sólo con sus cámaras; abre el panel con ese movimiento y la foto va sin imagen salvo que el dueño la acepte", () => {
    const solo = decidirAvisos(VIGIA_INICIAL, [mov("x/1", "cam-entrada", 0)], AHORA, ACTIVAS).grupo!;
    const d = celular("d", "ana", { "cam-entrada": "siempre" });
    expect(pushParaDispositivo(solo, d, new Date(AHORA), AJUSTES_CELULAR_INICIAL)).toEqual({
      title: "Movimiento en Entrada · 07:44",
      body: "Toca para ver la foto.",
      url: "/admin?tab=camaras&movimiento=x%2F1",
      tag: "camaras-movimiento",
      foto: "/api/admin/camaras/movimientos/foto?id=x%2F1&origen=aviso",
      fotoEnAviso: false,
    });
    const acepto = { ...d, fotoEnAviso: { por: "ana", en: new Date(AHORA).toISOString() } };
    expect(pushParaDispositivo(solo, acepto, new Date(AHORA), AJUSTES_CELULAR_INICIAL)?.fotoEnAviso).toBe(true);
    const deUna = pushParaDispositivo(grupo, celular("d", "ana", { "cam-patio": "siempre" }), new Date(AHORA), AJUSTES_CELULAR_INICIAL);
    expect(deUna?.title).toBe("Movimiento en Patio · 07:41");
    const deDos = pushParaDispositivo(
      grupo,
      celular("d", "ana", { "cam-patio": "siempre", "cam-entrada": "siempre" }),
      new Date(AHORA),
      AJUSTES_CELULAR_INICIAL,
    );
    expect(deDos).toMatchObject({ title: "Movimiento en Patio y Entrada · 07:42", body: "2 detecciones. Toca para ver la foto.", foto: expect.stringContaining("id=e1") });
  });

  it("«sólo de noche» de día no avisa; de noche sí", () => {
    const d = celular("d", "ana", { "cam-entrada": "noche" });
    expect(pushParaDispositivo(grupo, d, new Date(AHORA), AJUSTES_CELULAR_INICIAL)).toBeNull();
    const deNoche = decidirAvisos(VIGIA_INICIAL, [mov("n", "cam-entrada", 1, false, NOCHE)], NOCHE, ACTIVAS).grupo!;
    expect(pushParaDispositivo(deNoche, d, new Date(NOCHE), AJUSTES_CELULAR_INICIAL)).toMatchObject({
      title: "Movimiento en Entrada · 21:59",
      foto: null,
      body: "Toca para abrir las cámaras.",
    });
  });

  it("interruptor apagado o «Silenciar 1 h»: nada; el silencio de otro no calla al mío", () => {
    const d = celular("d", "ana", { "cam-entrada": "siempre" });
    expect(pushParaDispositivo(grupo, d, new Date(AHORA), { prendido: false, silencios: {} })).toBeNull();
    const callada = fijarSilencio(AJUSTES_CELULAR_INICIAL, "ana", AHORA + 60 * MIN, AHORA);
    expect(pushParaDispositivo(grupo, d, new Date(AHORA), callada)).toBeNull();
    expect(pushParaDispositivo(grupo, celular("e", "luis", { "cam-entrada": "siempre" }), new Date(AHORA), callada)).not.toBeNull();
    expect(pushParaDispositivo(grupo, d, new Date(AHORA + 61 * MIN), callada)).not.toBeNull();
  });
});

describe("la vuelta del servidor", () => {
  beforeEach(() => {
    H.kv.clear();
    H.movimientos = [mov("e1", "cam-entrada", 1) as unknown as Record<string, unknown>];
    H.fuenteOk = true;
    H.camarasActivas = ["cam-entrada", "cam-patio"];
    H.dispositivos = [
      celular("d1", "ana", { "cam-entrada": "siempre" }),
      celular("d2", "luis", { "cam-patio": "siempre" }),
    ];
    H.ajustes = null;
    H.vigentes = null;
    H.statusPush = 201;
    H.mandar = [];
    H.campana = [];
    H.olvidados = [];
    H.indice = {};
  });

  it("avisa una vez a quien tiene la cámara, con campana; la vuelta siguiente no repite", async () => {
    const r = await vigilarNegocio(T, AHORA);
    expect(r).toMatchObject({ resultado: "avisado", nuevos: 1, camaras: 1, enviados: 1, destinos: 1, campana: true });
    expect(H.mandar).toEqual([
      { id: "d1", topic: "cam-movimiento", carga: expect.objectContaining({ title: "Movimiento en Entrada · 07:43", tag: "camaras-movimiento" }) },
    ]);
    expect(H.campana[0]).toMatchObject({ tenantId: T, type: "camaras", entityId: "movimiento-nube", dedupWindowHours: 5 / 60 });
    const otra = await vigilarNegocio(T, AHORA + 30_000);
    expect(otra.resultado).toBe("nada_nuevo");
    expect(H.mandar).toHaveLength(1);
    expect([...H.kv.keys()].some((k) => k.includes("candado"))).toBe(false);
  });

  it("interruptor apagado: ni push ni campana, y lo de ahora no sale al prenderlo", async () => {
    await cambiarAjustesCelular(T, "dueno", { prendido: false }, AHORA);
    expect(await vigilarNegocio(T, AHORA)).toMatchObject({ resultado: "apagado", nuevos: 1, enviados: 0 });
    expect(H.mandar).toHaveLength(0);
    expect(H.campana).toHaveLength(0);
    await cambiarAjustesCelular(T, "dueno", { prendido: true }, AHORA);
    expect((await vigilarNegocio(T, AHORA + 30_000)).resultado).toBe("nada_nuevo");
    expect(H.mandar).toHaveLength(0);
  });

  it("usuario silenciado o dado de baja: no le llega; el endpoint muerto se olvida", async () => {
    H.movimientos = [mov("e1", "cam-entrada", 1), mov("p1", "cam-patio", 1)] as unknown as Array<Record<string, unknown>>;
    await cambiarAjustesCelular(T, "ana", { silencioHasta: AHORA + 60 * MIN }, AHORA);
    H.statusPush = 410;
    const r = await vigilarNegocio(T, AHORA);
    expect(H.mandar.map((m) => m.id)).toEqual(["d2"]);
    expect(r).toMatchObject({ resultado: "avisado", camaras: 2, enviados: 0, destinos: 1 });
    expect(H.olvidados).toEqual([["https://fcm.googleapis.com/fcm/send/d2"]]);
  });

  it("ningún push salió: la próxima vuelta con movimiento nuevo sí avisa (sin esperar 5 min)", async () => {
    H.statusPush = 500;
    await vigilarNegocio(T, AHORA);
    H.statusPush = 201;
    H.movimientos = [mov("e1", "cam-entrada", 1), mov("e2", "cam-entrada", 0.5)] as unknown as Array<Record<string, unknown>>;
    const r = await vigilarNegocio(T, AHORA + 30_000);
    expect(r).toMatchObject({ resultado: "avisado", enviados: 1 });
    expect(H.mandar).toHaveLength(2);
  });

  it("otro vigía con el candado: no avisa dos veces", async () => {
    H.kv.set(`camaras:movimientos:push:candado:${T}`, "otro");
    expect((await vigilarNegocio(T, AHORA)).resultado).toBe("ocupado");
    expect(H.mandar).toHaveLength(0);
  });

  it("sin cámaras enlazadas: no hace nada; vigilarTodos recorre el índice sin repetir", async () => {
    H.fuenteOk = false;
    expect((await vigilarNegocio(T, AHORA)).resultado).toBe("sin_camaras");
    H.indice = { tok1: { tenantId: T }, tok2: { tenantId: T }, tok3: {} };
    const todos = await vigilarTodos(AHORA);
    expect(todos.map((r) => r.tenantId)).toEqual([T]);
  });
});

describe("GET /api/cron/camaras-movimientos", () => {
  const pedir = (auth?: string) =>
    CRON(new NextRequest("http://localhost/api/cron/camaras-movimientos", { headers: auth ? { authorization: auth } : {} }));

  beforeEach(() => {
    process.env.CRON_SECRET = "secreto-de-prueba";
    H.indice = {};
    H.mandar = [];
  });

  it("sin token o con otro: 401 y no vacía nada", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir("Bearer otro")).status).toBe(401);
    expect(H.mandar).toHaveLength(0);
  });

  it("con el token: 200 con lo que pasó por negocio", async () => {
    const res = await pedir("Bearer secreto-de-prueba");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ negocios: 0, nuevos: 0, enviados: 0, destinos: 0, detalle: [] });
  });
});
