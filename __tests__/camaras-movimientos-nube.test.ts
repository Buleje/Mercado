import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

/**
 * Avisos de movimiento SIN la cámara abierta (2026-10-23): la cola de alarmas
 * de Hik-Connect for Teams → lo guardado por negocio → la cabecera. Lote con
 * la forma REAL medida en Blas (ids y URL cambiados). Cubre: leer el lote,
 * pasarlo a las cámaras del panel, deduplicar, suscribirse sola (OPEN000016),
 * guardar ANTES de confirmar, no ir a la nube más de una vez cada 20 s, que la
 * URL firmada no salga al navegador y que la foto de otro negocio dé 404.
 * Revisión de seguridad 23-10: candado con dueño, no confirmar si Upstash
 * falló, detección dudosa recordada 1 min, foto con tope y formato real, y
 * quién vio cada foto en el registro.
 */

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  ttl: new Map<string, number>(),
  respaldo: false,
  aparatos: 0,
  despues: [] as (() => unknown)[],
  registros: [] as unknown[][],
  orden: [] as string[],
  hik: ((): unknown => ({ ok: true, valor: {} })) as (ruta: string, cuerpo: unknown) => unknown,
  payload: null as null | { username: string; role: string; tenantId: string },
  cuentas: {} as Record<string, { enlaces: Record<string, { resourceId: string; deviceSerial: string }> }>,
  camarasPorTenant: {} as Record<string, { id: string; nombre: string }[]>,
  deteccion: {} as Record<string, boolean | null>,
}));

vi.mock("@/lib/camaras/kv-efimero.server", () => ({
  kvLeer: async (k: string) => (H.kv.has(k) ? structuredClone(H.kv.get(k)) : null),
  kvEscribir: async (k: string, v: unknown, s: number, o: { soloSiNueva?: boolean } = {}) => {
    if (o.soloSiNueva && H.kv.has(k)) return false;
    H.orden.push(`kv:${k.split(":")[2] === "candado" ? "candado" : "guardar"}`);
    H.kv.set(k, structuredClone(v));
    H.ttl.set(k, s);
    return true;
  },
  kvEscribirDonde: async (k: string, v: unknown) => {
    H.orden.push("kv:guardar");
    H.kv.set(k, structuredClone(v));
    return H.respaldo ? "respaldo" : "memoria";
  },
  kvBorrar: async (k: string) => H.kv.delete(k),
  kvBorrarSiEs: async (k: string, v: string) => H.kv.get(k) === v && H.kv.delete(k),
}));
vi.mock("next/server", async (real) => ({
  ...(await real<typeof import("next/server")>()),
  after: (f: () => unknown) => void H.despues.push(f),
}));
vi.mock("@/lib/activity-logger", () => ({
  logActivity: async (...a: unknown[]) => void H.registros.push(a),
}));
vi.mock("@/lib/camaras/hik-connect-api.server", () => ({
  llamarConToken: async (_t: string, _c: unknown, ruta: string, cuerpo: unknown) => {
    H.orden.push(`hik:${ruta.split("/").slice(-2).join("/")}`);
    return H.hik(ruta, cuerpo);
  },
}));
vi.mock("@/lib/camaras/ezviz-control.server", () => ({
  estadoDelAparato: async (_t: string, _c: unknown, serie: string) => {
    H.aparatos += 1;
    return H.deteccion[serie] === null
      ? { ok: false, error: { codigo: "20007", tipo: "red", mensaje: "la cámara no contestó" } }
      : { ok: true, valor: { enLinea: true, deteccion: H.deteccion[serie] ?? true, modelo: null } };
  },
}));
vi.mock("@/lib/db/camaras-hik-connect.db", () => ({
  CamarasHikConnectDB: {
    leer: async (t: string) => H.cuentas[t] ?? null,
    credenciales: async (t: string) =>
      H.cuentas[t] ? { ok: true, valor: { appKey: "ak", secretKey: "sk", region: "sa" } } : { ok: false, motivo: "sin cuenta" },
    enlaceParaVideo: async () => ({ resourceId: "r", deviceSerial: "s", codigo: null }),
  },
}));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: { list: async (t: string) => H.camarasPorTenant[t] ?? [] },
}));
/* El aviso al celular lee la base (ajustes + dispositivos): acá no interesa. */
vi.mock("@/lib/camaras/vigia-movimientos.server", () => ({ celularParaCabecera: async () => null }));
vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "200.0.0.1",
  createDistributedRateLimiter: (cfg: { windowMs: number }) => ({ check: async () => true, windowMs: cfg.windowMs }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  aMovimientos,
  esUrlDeFotoAlarma,
  leerLoteAlarmas,
  mezclarMovimientos,
  paraCliente,
  type MovimientoGuardado,
} from "@/lib/camaras/alarmas-hik";
import {
  anotarVistos,
  leerRespuestaMovimientos,
  leerVistos,
  movimientosNuevos,
  pedirDesde,
  recordarVistos,
  type MovimientoNube,
} from "@/lib/camaras/movimientos-nube";
import { registrarSenal, ESTADO_AVISOS_INICIAL } from "@/lib/camaras/avisos-segundo-plano";
import {
  ACCION_FOTO_MOVIMIENTO,
  CANDADO_S,
  deteccionDe,
  movimientosRecientes,
  fotoDeMovimiento,
} from "@/lib/camaras/movimientos-nube.server";
import { GET } from "@/app/api/admin/camaras/movimientos/route";
import { GET as GET_FOTO } from "@/app/api/admin/camaras/movimientos/foto/route";

const T0 = Date.parse("2026-10-23T12:26:27Z");
const URL_FOTO = "https://apiisa.ezvizlife.com/v3/unifiedmsg/alarm/pic?sig=FIRMA-SECRETA";

const alarma = (guid: string, extra: Record<string, unknown> = {}) => ({
  guid,
  msgType: "1",
  alarmState: "1",
  timeInfo: { startTime: "2026-10-23T12:26:27Z", endTime: "2026-10-23T12:26:37Z" },
  eventSource: {
    eventType: "10002",
    sourceID: "res-entrada",
    sourceName: "DS-2CFSP4-4G",
    deviceInfo: { deviceSerial: "BF0000001", devName: "DS-2CFSP4-4G" },
  },
  alarmRule: { name: "DS-2CFSP4-4G-Detección movim." },
  fileInfo: { file: [{ type: "1", url: URL_FOTO, encrypted: "0" }] },
  ...extra,
});

const LOTE_REAL = {
  batchId: "lote-1",
  remainingNumber: 0,
  alarmMsg: [
    alarma("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"),
    /* La misma alarma terminando: no es otro movimiento. */
    alarma("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d7", { alarmState: "0" }),
    /* Otro tipo de mensaje de la cola. */
    alarma("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d8", { msgType: "2" }),
    /* Otra cámara, sólo por serie, más tarde. */
    alarma("b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", {
      timeInfo: { startTime: "2026-10-23T12:28:00Z" },
      eventSource: { sourceID: "", eventType: "10002", deviceInfo: { deviceSerial: "BF0000002" } },
      fileInfo: { file: [] },
    }),
  ],
};

const CAMARAS = [
  { id: "cam_entrada", nombre: "Entrada", resourceId: "res-entrada", deviceSerial: "BF0000001" },
  { id: "cam_patio", nombre: "Patio de trozas", resourceId: "res-patio", deviceSerial: "BF0000002" },
];

const mov = (id: string, at: number, extra: Partial<MovimientoGuardado> = {}): MovimientoGuardado => ({
  id,
  camaraId: "cam_entrada",
  nombre: "Entrada",
  at,
  conFoto: true,
  foto: URL_FOTO,
  fotoCifrada: false,
  ...extra,
});

describe("leer el lote de la cola", () => {
  it("la forma real: sólo las alarmas que empiezan, con hora, cámara y foto", () => {
    const l = leerLoteAlarmas(LOTE_REAL);
    expect(l.lote).toBe("lote-1");
    expect(l.quedan).toBe(0);
    expect(l.alarmas.map((a) => a.id)).toEqual([
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
      "b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    ]);
    expect(l.alarmas[0]).toMatchObject({ fuenteId: "res-entrada", serie: "BF0000001", at: T0, foto: URL_FOTO, fotoCifrada: false });
    expect(l.alarmas[1].foto).toBeNull();
  });

  it("lote vacío o basura: nada que confirmar", () => {
    expect(leerLoteAlarmas({ batchId: "0", remainingNumber: "0", alarmMsg: [] })).toEqual({ lote: null, quedan: 0, alarmas: [] });
    expect(leerLoteAlarmas(null).alarmas).toEqual([]);
    expect(leerLoteAlarmas({ alarmMsg: [{ guid: "x" }, "y", 3] }).alarmas).toEqual([]);
  });

  it("alarma → cámara del panel por resourceId o serie; la no enlazada no sale", () => {
    const l = leerLoteAlarmas(LOTE_REAL);
    const m = aMovimientos(l.alarmas, CAMARAS);
    expect(m.map((x) => [x.camaraId, x.nombre, x.conFoto])).toEqual([
      ["cam_entrada", "Entrada", true],
      ["cam_patio", "Patio de trozas", false],
    ]);
    expect(aMovimientos(l.alarmas, CAMARAS.slice(0, 1))).toHaveLength(1);
  });

  it("mezclar: sin repetidos, sin lo de más de 24 h, del más nuevo, con tope", () => {
    const ahora = T0 + 60_000;
    const m = mezclarMovimientos(
      [mov("a", T0), mov("viejo", T0 - 25 * 3_600_000)],
      [mov("a", T0, { nombre: "otro" }), mov("b", T0 + 30_000)],
      ahora,
    );
    expect(m.map((x) => x.id)).toEqual(["b", "a"]);
    expect(m[1].nombre).toBe("Entrada");
    expect(mezclarMovimientos([], [mov("1", T0), mov("2", T0 + 1), mov("3", T0 + 2)], ahora, undefined, 2).map((x) => x.id)).toEqual(["3", "2"]);
  });

  it("al navegador no le llega la URL firmada", () => {
    const c = paraCliente(mov("a", T0));
    expect(c).toEqual({ id: "a", camaraId: "cam_entrada", nombre: "Entrada", at: T0, conFoto: true });
    expect(JSON.stringify(c)).not.toContain("FIRMA");
  });

  it("la foto sólo se baja de EZVIZ y su almacén (anti-SSRF)", () => {
    expect(esUrlDeFotoAlarma(URL_FOTO)).toBe(true);
    expect(esUrlDeFotoAlarma("http://apiisa.ezvizlife.com/x")).toBe(false);
    expect(esUrlDeFotoAlarma("https://u:p@apiisa.ezvizlife.com/x")).toBe(false);
    expect(esUrlDeFotoAlarma("https://ezvizlife.com.atacante.pe/x")).toBe(false);
    expect(esUrlDeFotoAlarma("https://falsoezvizlife.com/x")).toBe(false);
    const oci = "https://alarm-oracle-sa.objectstorage.sa-saopaulo-1.oci.customer-oci.com/p/x.jpg";
    /* El almacén, sólo como redirección de EZVIZ. */
    expect(esUrlDeFotoAlarma(oci)).toBe(false);
    expect(esUrlDeFotoAlarma(oci, false)).toBe(true);
    expect(esUrlDeFotoAlarma("https://169.254.169.254/latest", false)).toBe(false);
    /* Sólo el almacén medido: otros no, aunque sean nubes conocidas. */
    expect(esUrlDeFotoAlarma("https://x.s3.amazonaws.com/p.jpg", false)).toBe(false);
    expect(esUrlDeFotoAlarma("https://objectstorage.x.oraclecloud.com/p.jpg", false)).toBe(false);
  });
});

describe("lo que la cabecera avisa", () => {
  const ev = (id: string, at: number): MovimientoNube => ({ id, camaraId: "cam_entrada", nombre: "Entrada", at, conFoto: false });

  it("sólo lo no visto y posterior a `desde`, del más viejo al más nuevo", () => {
    const n = movimientosNuevos([ev("c", T0 + 2), ev("a", T0), ev("b", T0 + 1), ev("c", T0 + 2), ev("viejo", T0 - 10)], new Set(["b"]), T0 - 1);
    expect(n.map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("vistos: los nuevos al final, con tope; lo guardado roto = nada visto", () => {
    expect(recordarVistos(["x", "y", "z"], [ev("y", 1), ev("w", 2)], 3)).toEqual(["z", "y", "w"]);
    expect(leerVistos("{roto")).toEqual({ hasta: 0, ids: [] });
    expect(leerVistos(JSON.stringify({ hasta: 5, ids: ["a", 3, "b"] }))).toEqual({ hasta: 5, ids: ["a", "b"] });
    expect(anotarVistos({ hasta: T0, ids: ["a"] }, [ev("b", T0 + 9), ev("c", T0 + 4)])).toEqual({ hasta: T0 + 9, ids: ["a", "b", "c"] });
  });

  it("desde: 2 min antes del último avisado, nunca más de 15 min atrás", () => {
    const ahora = T0 + 3_600_000;
    expect(pedirDesde({ hasta: 0, ids: [] }, ahora)).toBe(ahora - 15 * 60_000);
    expect(pedirDesde({ hasta: ahora - 60_000, ids: [] }, ahora)).toBe(ahora - 3 * 60_000);
    /* Una hora futura (reloj adelantado) no deja la ventana cerrada. */
    expect(pedirDesde({ hasta: ahora + 3_600_000, ids: [] }, ahora)).toBe(ahora - 2 * 60_000);
  });

  it("la respuesta del servidor se valida; lo raro no entra", () => {
    const ok = { vinculado: true, eventos: [ev("a", T0)], deteccion: [{ camaraId: "c", nombre: "E", armada: null }], puedeConfigurar: true, consultadoAt: T0, aviso: null };
    expect(leerRespuestaMovimientos(ok)).toEqual(ok);
    expect(leerRespuestaMovimientos({ ...ok, eventos: [{ id: "a" }] })).toBeNull();
    expect(leerRespuestaMovimientos("hola")).toBeNull();
  });

  it("una señal de la nube ya es movimiento; una del mosaico sola, no (parpadeo)", () => {
    const base = { camaraId: "cam_entrada", nombre: "Entrada", at: T0, movimiento: true, aparicion: false, personas: 0, aLaVista: false };
    const delMosaico = registrarSenal(ESTADO_AVISOS_INICIAL, base);
    expect(delMosaico.evento).toBeNull();
    const deLaNube = registrarSenal(ESTADO_AVISOS_INICIAL, { ...base, origen: "nube" });
    expect(deLaNube.evento?.tipo).toBe("movimiento");
    expect(deLaNube.mensaje?.camaras).toEqual([{ id: "cam_entrada", nombre: "Entrada" }]);
    /* Con el mosaico expandido mirando esa cámara, no avisa. */
    expect(registrarSenal(ESTADO_AVISOS_INICIAL, { ...base, origen: "nube", aLaVista: true }).evento).toBeNull();
  });

  it("la de la nube llega tarde: no hace retroceder la última señal del mosaico", () => {
    const base = { camaraId: "cam_entrada", nombre: "Entrada", movimiento: true, aparicion: false, personas: 0, aLaVista: false };
    const a = registrarSenal(ESTADO_AVISOS_INICIAL, { ...base, at: T0 + 50_000 });
    const b = registrarSenal(a.estado, { ...base, at: T0, origen: "nube" });
    expect(b.estado.camaras.cam_entrada.ultimaSenal).toBe(T0 + 50_000);
  });
});

const CRED = { appKey: "ak", secretKey: "sk", region: "sa" } as never;

const JPEG = sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 40, g: 90, b: 60 } } })
  .jpeg()
  .toBuffer();
const CANDADO = "camaras:movimientos:candado:t-blas";

describe("el servidor vacía la cola", () => {
  beforeEach(() => {
    H.kv.clear();
    H.ttl.clear();
    H.orden.length = 0;
    H.respaldo = false;
    H.aparatos = 0;
    H.deteccion = {};
  });

  it("sin suscripción se suscribe sola, guarda ANTES de confirmar y no vuelve antes de 20 s", async () => {
    let suscrito = false;
    H.hik = (ruta, cuerpo) => {
      if (ruta.endsWith("/mq/subscribe")) {
        expect(cuerpo).toEqual({ subscribeType: 1, subscribeMode: 0 });
        suscrito = true;
        return { ok: true, valor: {} };
      }
      if (ruta.endsWith("/mq/messages"))
        return suscrito
          ? { ok: true, valor: LOTE_REAL }
          : { ok: false, error: { codigo: "OPEN000016", tipo: "otro", mensaje: "suscríbete" } };
      return { ok: true, valor: {} };
    };
    const r = await movimientosRecientes("t-blas", CRED, CAMARAS, T0 + 60_000);
    expect(r.movimientos.map((m) => m.camaraId)).toEqual(["cam_patio", "cam_entrada"]);
    expect(r.aviso).toBeNull();
    expect(H.orden).toEqual([
      "kv:candado",
      "hik:mq/messages",
      "hik:mq/subscribe",
      "hik:mq/messages",
      "kv:guardar",
      "hik:messages/complete",
      "kv:guardar",
    ]);
    H.orden.length = 0;
    const otra = await movimientosRecientes("t-blas", CRED, CAMARAS, T0 + 70_000);
    expect(H.orden).toEqual([]);
    expect(otra.movimientos).toHaveLength(2);
    /* Otro negocio tiene lo suyo (vacío). */
    H.hik = () => ({ ok: true, valor: { batchId: "0", alarmMsg: [] } });
    expect((await movimientosRecientes("t-otro", CRED, CAMARAS, T0 + 70_000)).movimientos).toEqual([]);
  });

  it("el candado tiene dueño: dura más que la peor vuelta y no borra el de otra", async () => {
    expect(CANDADO_S).toBeGreaterThan(52);
    /* Otra vuelta en curso: ni se toca la nube ni se borra su candado. */
    H.kv.set(CANDADO, "ajeno");
    H.hik = () => ({ ok: true, valor: LOTE_REAL });
    await movimientosRecientes("t-blas", CRED, CAMARAS, T0 + 60_000);
    expect(H.orden).toEqual([]);
    expect(H.kv.get(CANDADO)).toBe("ajeno");
    /* El mío venció a mitad de vuelta y lo tomó otra: al terminar, el suyo queda. */
    H.kv.delete(CANDADO);
    H.hik = (ruta) => {
      if (ruta.endsWith("/mq/messages")) H.kv.set(CANDADO, "la-siguiente");
      return ruta.endsWith("/mq/messages") ? { ok: true, valor: LOTE_REAL } : { ok: true, valor: {} };
    };
    await movimientosRecientes("t-blas", CRED, CAMARAS, T0 + 60_000);
    expect(H.kv.get(CANDADO)).toBe("la-siguiente");
    /* Lo normal: termina y borra el suyo. */
    H.kv.delete(CANDADO);
    H.hik = (ruta) => (ruta.endsWith("/mq/messages") ? { ok: true, valor: LOTE_REAL } : { ok: true, valor: {} });
    await movimientosRecientes("t-blas", CRED, CAMARAS, T0 + 90_000);
    expect(H.kv.has(CANDADO)).toBe(false);
  });

  it("si Upstash falló y quedó sólo en memoria, NO confirma el lote (la cola lo vuelve a dar)", async () => {
    H.respaldo = true;
    H.hik = (ruta) => (ruta.endsWith("/mq/messages") ? { ok: true, valor: LOTE_REAL } : { ok: true, valor: {} });
    const r = await movimientosRecientes("t-blas", CRED, CAMARAS, T0 + 60_000);
    expect(r.movimientos).toHaveLength(2);
    expect(H.orden).not.toContain("hik:messages/complete");
  });

  it("la detección de una cámara dormida se recuerda 1 min, no se pregunta en cada vuelta", async () => {
    H.deteccion = { BF0000002: null };
    const d = await deteccionDe("t-blas", CRED, CAMARAS);
    expect(d.map((x) => x.armada)).toEqual([true, null]);
    expect(H.aparatos).toBe(2);
    expect(H.ttl.get("camaras:movimientos:deteccion:t-blas")).toBe(60);
    await deteccionDe("t-blas", CRED, CAMARAS);
    expect(H.aparatos).toBe(2);
    /* Todas conocidas: 5 min. */
    H.kv.clear();
    H.deteccion = {};
    await deteccionDe("t-blas", CRED, CAMARAS);
    expect(H.ttl.get("camaras:movimientos:deteccion:t-blas")).toBe(300);
  });

  it("si la nube falla, devuelve lo guardado con el aviso", async () => {
    H.kv.set("camaras:movimientos:t-blas", { movimientos: [mov("a", T0)], consultadoAt: T0, aviso: null });
    H.hik = () => ({ ok: false, error: { codigo: "X", tipo: "red", mensaje: "Hik-Connect no contestó" } });
    const r = await movimientosRecientes("t-blas", CRED, CAMARAS, T0 + 60_000);
    expect(r.movimientos.map((m) => m.id)).toEqual(["a"]);
    expect(r.aviso).toBe("Hik-Connect no contestó");
    expect(H.kv.has("camaras:movimientos:candado:t-blas")).toBe(false);
  });

  it("la foto de un movimiento de otro negocio: 404 sin tocar la red", async () => {
    H.kv.set("camaras:movimientos:t-blas", { movimientos: [mov("a1b2c3d4", T0)], consultadoAt: T0, aviso: null });
    const red = vi.spyOn(globalThis, "fetch");
    const r = await fotoDeMovimiento("t-otro", "a1b2c3d4");
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(red).not.toHaveBeenCalled();
    red.mockRestore();
  });

  it("la foto sigue UNA redirección y sólo al almacén; a otro lado no va", async () => {
    H.kv.set("camaras:movimientos:t-blas", { movimientos: [mov("a1b2c3d4", T0)], consultadoAt: T0, aviso: null });
    const jpeg = new Uint8Array(await JPEG);
    let destino = "https://alarm-oracle-sa.objectstorage.sa-saopaulo-1.oci.customer-oci.com/p/x.jpg";
    const red = vi.spyOn(globalThis, "fetch").mockImplementation(async (u) => {
      const url = String(u);
      if (url.startsWith("https://apiisa.ezvizlife.com")) return new Response(null, { status: 302, headers: { location: destino } });
      return new Response(jpeg, { status: 200 });
    });
    const ok = await fotoDeMovimiento("t-blas", "a1b2c3d4");
    expect(ok.ok && ok.valor.subarray(0, 2).toString("hex")).toBe("ffd8");
    destino = "https://169.254.169.254/latest/meta-data";
    expect(await fotoDeMovimiento("t-blas", "a1b2c3d4")).toMatchObject({ ok: false, status: 502 });
    expect(red.mock.calls.map((c) => new URL(String(c[0])).host)).not.toContain("169.254.169.254");
    red.mockRestore();
  });

  it("la foto sin tamaño declarado se corta a los 8 MB; la que no es imagen no se sirve", async () => {
    H.kv.set("camaras:movimientos:t-blas", { movimientos: [mov("a1b2c3d4", T0)], consultadoAt: T0, aviso: null });
    let entregados = 0;
    let cuerpo: () => BodyInit = () =>
      new ReadableStream<Uint8Array>({
        pull(c) {
          entregados += 1;
          c.enqueue(new Uint8Array(1024 * 1024));
        },
      });
    const red = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(cuerpo(), { status: 200 }));
    expect(await fotoDeMovimiento("t-blas", "a1b2c3d4")).toMatchObject({ ok: false, status: 502, error: "La foto es demasiado grande." });
    expect(entregados).toBeLessThanOrEqual(12);
    /* Empieza como JPEG pero no lo es: sharp no la abre. */
    cuerpo = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
    expect(await fotoDeMovimiento("t-blas", "a1b2c3d4")).toMatchObject({ ok: false, status: 502, error: "La foto llegó dañada. Vuelve a intentar." });
    red.mockRestore();
  });
});

const como = (role: string, tenantId = "t-blas") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};
const pedir = (url: string) =>
  new NextRequest(`http://localhost${url}`, { headers: { cookie: "buleje-admin-sess=x" } });

describe("GET /api/admin/camaras/movimientos", () => {
  beforeEach(() => {
    H.kv.clear();
    H.orden.length = 0;
    H.payload = null;
    H.deteccion = {};
    H.camarasPorTenant = {
      "t-blas": [
        { id: "cam_entrada", nombre: "Entrada" },
        { id: "cam_patio", nombre: "Patio de trozas" },
      ],
      "t-otro": [{ id: "cam_ajena", nombre: "Ajena" }],
    };
    H.cuentas = {
      "t-blas": {
        enlaces: {
          cam_entrada: { resourceId: "res-entrada", deviceSerial: "BF0000001" },
          cam_patio: { resourceId: "res-patio", deviceSerial: "BF0000002" },
        },
      },
    };
    H.hik = (ruta) => (ruta.endsWith("/mq/messages") ? { ok: true, valor: LOTE_REAL } : { ok: true, valor: {} });
    /* El servidor guarda «las últimas 24 h» desde la hora real: con el lote fechado
       el 23-10 el test venció solo el 24-10 a las 12:26 UTC. Se fija la hora (sólo Date). */
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0 + 5 * 60_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sin sesión: 401 (no 404, que sacaría del panel)", async () => {
    const r = await GET(pedir("/api/admin/camaras/movimientos"));
    expect(r.status).toBe(401);
  });

  it("con cámaras enlazadas: eventos desde `desde`, detección y sin la URL firmada", async () => {
    como("almacenero");
    H.deteccion = { BF0000002: false };
    const r = await GET(pedir(`/api/admin/camaras/movimientos?desde=${T0}`));
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).not.toContain("FIRMA");
    const d = leerRespuestaMovimientos(JSON.parse(texto));
    expect(d?.vinculado).toBe(true);
    /* El de las 12:26:27 es == desde: ya no entra. */
    expect(d?.eventos.map((e) => e.camaraId)).toEqual(["cam_patio"]);
    expect(d?.deteccion).toEqual([
      { camaraId: "cam_entrada", nombre: "Entrada", armada: true },
      { camaraId: "cam_patio", nombre: "Patio de trozas", armada: false },
    ]);
    /* El almacenero ve, pero no prende la detección. */
    expect(d?.puedeConfigurar).toBe(false);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("otro negocio sin cuenta: vinculado false y nada de Blas", async () => {
    como("admin");
    await GET(pedir("/api/admin/camaras/movimientos"));
    como("owner", "t-otro");
    H.orden.length = 0;
    const d = leerRespuestaMovimientos(await (await GET(pedir("/api/admin/camaras/movimientos"))).json());
    expect(d).toMatchObject({ vinculado: false, eventos: [], puedeConfigurar: true });
    expect(H.orden).toEqual([]);
  });

  it("`desde` que no es número: 400", async () => {
    como("admin");
    expect((await GET(pedir("/api/admin/camaras/movimientos?desde=ayer"))).status).toBe(400);
  });

  it("foto: id raro 400, de otro negocio 404, sin sesión 401", async () => {
    como("admin");
    await GET(pedir("/api/admin/camaras/movimientos"));
    expect((await GET_FOTO(pedir("/api/admin/camaras/movimientos/foto?id=../../x"))).status).toBe(400);
    como("admin", "t-otro");
    expect((await GET_FOTO(pedir("/api/admin/camaras/movimientos/foto?id=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"))).status).toBe(404);
    H.payload = null;
    expect((await GET_FOTO(pedir("/api/admin/camaras/movimientos/foto?id=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"))).status).toBe(401);
  });

  it("foto vista: sale la imagen y queda quién la vio (sin la URL firmada)", async () => {
    H.kv.set("camaras:movimientos:t-blas", { movimientos: [mov("a1b2c3d4", T0)], consultadoAt: T0, aviso: null });
    H.despues.length = 0;
    H.registros.length = 0;
    const jpeg = new Uint8Array(await JPEG);
    const red = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(jpeg, { status: 200 }));
    como("almacenero");
    const r = await GET_FOTO(pedir("/api/admin/camaras/movimientos/foto?id=a1b2c3d4"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(H.registros).toEqual([]);
    await Promise.all(H.despues.map((f) => f()));
    expect(H.registros).toHaveLength(1);
    const [accion, entidad, detalle, camaraId, usuario, , tenantId] = H.registros[0] as string[];
    expect({ accion, entidad, camaraId, usuario, tenantId }).toEqual({
      accion: ACCION_FOTO_MOVIMIENTO,
      entidad: "camara",
      camaraId: "cam_entrada",
      usuario: "qa-almacenero",
      tenantId: "t-blas",
    });
    expect(detalle).toContain("a1b2c3d4");
    expect(detalle).not.toContain("FIRMA");
    red.mockRestore();
  });
});
