/**
 * client-cache-fetch: dedup en vuelo, TTL, invalidación por prefijo y el
 * sondeo compartido (un timer y un pedido por vuelta para N suscriptores,
 * pausa con la pestaña oculta). Nació con el carril de velocidad del panel
 * (16-10): la campana, el banner y el chat sondeaban cada uno por su lado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedJson,
  cachedJsonVigente,
  instalarInvalidacionPorEscritura,
  intervaloVisible,
  invalidateCachedJson,
  invalidateCachedJsonPrefijo,
  recursoDe,
  refrescarSondeo,
  suscribirSondeo,
} from "@/lib/client-cache-fetch";

let pedidos: string[] = [];
let visibilidad: DocumentVisibilityState = "visible";

function responder(url: string) {
  pedidos.push(url);
  return Promise.resolve(new Response(JSON.stringify({ url, n: pedidos.length }), { status: 200 }));
}

/** Deja correr las promesas encadenadas de fetch → json → oyentes. */
async function drenar() {
  for (let i = 0; i < 3; i++) await new Promise((ok) => setImmediate(ok));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
  pedidos = [];
  visibilidad = "visible";
  invalidateCachedJson();
  vi.stubGlobal("fetch", vi.fn((u: string) => responder(u)));
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilidad });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("cachedJson", () => {
  it("dos lectores a la vez comparten un pedido; dentro del TTL no se pide de nuevo", async () => {
    const [a, b] = await Promise.all([cachedJson("/api/x", 30_000), cachedJson("/api/x", 30_000)]);
    expect(a).toEqual(b);
    await cachedJson("/api/x", 30_000);
    expect(pedidos).toEqual(["/api/x"]);
  });

  it("invalidar por prefijo borra todas las consultas del recurso y nada más", async () => {
    await cachedJson("/api/fiados?status=ACTIVO");
    await cachedJson("/api/fiados?status=VENCIDO");
    await cachedJson("/api/goals");
    invalidateCachedJsonPrefijo("/api/fiados");
    await cachedJson("/api/fiados?status=ACTIVO");
    await cachedJson("/api/goals");
    expect(pedidos).toEqual(["/api/fiados?status=ACTIVO", "/api/fiados?status=VENCIDO", "/api/goals", "/api/fiados?status=ACTIVO"]);
  });

  it("un pedido que vuelve DESPUÉS de una invalidación no deja guardado el dato viejo", async () => {
    let soltar: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((ok) => (soltar = ok))));
    const viejo = cachedJson("/api/auth/me");
    invalidateCachedJson(); // salir o cambiar de sesión a mitad del pedido
    soltar(new Response(JSON.stringify({ username: "anterior" }), { status: 200 }));
    await viejo;
    expect(cachedJsonVigente("/api/auth/me")).toBeUndefined();
  });
});

describe("suscribirSondeo", () => {
  it("N suscriptores = 1 pedido al montar y 1 por vuelta", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const bajaA = suscribirSondeo("/api/campana", 30_000, a);
    const bajaB = suscribirSondeo("/api/campana", 30_000, b);
    await drenar();
    expect(pedidos).toHaveLength(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(pedidos).toHaveLength(2);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
    bajaA();
    bajaB();
  });

  it("el doble montaje de StrictMode (alta, baja, alta) no duplica el pedido ni el timer", async () => {
    const oyente = vi.fn();
    suscribirSondeo("/api/sm", 20_000, oyente)();
    const baja = suscribirSondeo("/api/sm", 20_000, oyente);
    await drenar();
    expect(pedidos).toEqual(["/api/sm"]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(pedidos).toEqual(["/api/sm", "/api/sm"]);
    baja();
  });

  it("con la pestaña oculta no pide; al volver pide al instante si lo último venció", async () => {
    const baja = suscribirSondeo("/api/oculta", 10_000, vi.fn());
    await drenar();
    visibilidad = "hidden";
    await vi.advanceTimersByTimeAsync(50_000);
    expect(pedidos).toHaveLength(1);
    visibilidad = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await drenar();
    expect(pedidos).toHaveLength(2);
    baja();
  });

  it("dado de baja el último, el timer se apaga", async () => {
    suscribirSondeo("/api/baja", 5_000, vi.fn())();
    await drenar();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pedidos).toEqual(["/api/baja"]);
  });

  it("refrescarSondeo tras una escritura pide ya y avisa a todos", async () => {
    const oyente = vi.fn();
    const baja = suscribirSondeo("/api/w", 60_000, oyente);
    await drenar();
    refrescarSondeo("/api/w");
    await drenar();
    expect(pedidos).toHaveLength(2);
    expect(oyente).toHaveBeenCalledTimes(2);
    baja();
  });
});

describe("intervaloVisible", () => {
  it("no corre con la pestaña oculta; al volver corre una vez si ya venció", async () => {
    const fn = vi.fn();
    const baja = intervaloVisible(fn, 10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fn).toHaveBeenCalledTimes(1);
    visibilidad = "hidden";
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(1);
    visibilidad = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fn).toHaveBeenCalledTimes(2);
    // Ir y volver enseguida no repite el pedido.
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fn).toHaveBeenCalledTimes(2);
    baja();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("invalidación al escribir", () => {
  it("recursoDe saca el recurso de la ruta", () => {
    expect(recursoDe("/api/fiados/x/pagar")).toBe("/api/fiados");
    expect(recursoDe("/api/admin/caja/abrir")).toBe("/api/admin/caja");
    expect(recursoDe("/api/settings?_t=main")).toBe("/api/settings");
    expect(recursoDe("/admin?tab=plata")).toBeNull();
  });

  // Van al final: el envoltorio queda instalado en window por el resto del archivo.
  // beforeEach pone un fetch nuevo encima: se vuelve a envolver el de cada test.
  function instalarSobreElFetchDelTest() {
    vi.stubEnv("NODE_ENV", "development");
    Reflect.deleteProperty(window, Symbol.for("bsm.cachedJson.invalidaAlEscribir"));
    instalarInvalidacionPorEscritura();
  }

  it("un POST al recurso borra lo guardado de ese recurso; un GET y otro recurso no", async () => {
    instalarSobreElFetchDelTest();
    await cachedJson("/api/fiados?status=ACTIVO");
    await cachedJson("/api/goals");
    await window.fetch("/api/goals?x=1");
    await cachedJson("/api/goals");
    await window.fetch("/api/fiados/abc/pagar", { method: "POST" });
    await cachedJson("/api/fiados?status=ACTIVO");
    await cachedJson("/api/goals");
    expect(pedidos).toEqual([
      "/api/fiados?status=ACTIVO",
      "/api/goals",
      "/api/goals?x=1",
      "/api/fiados/abc/pagar",
      "/api/fiados?status=ACTIVO",
    ]);
  });

  it("rotar el token no borra nada; salir de la sesión borra todo", async () => {
    instalarSobreElFetchDelTest();
    await cachedJson("/api/auth/me");
    await cachedJson("/api/goals");
    await window.fetch("/api/auth/refresh", { method: "POST" });
    await cachedJson("/api/auth/me");
    expect(pedidos).toEqual(["/api/auth/me", "/api/goals", "/api/auth/refresh"]);
    await window.fetch("/api/auth/logout", { method: "POST" });
    await cachedJson("/api/auth/me");
    await cachedJson("/api/goals");
    expect(pedidos.slice(3)).toEqual(["/api/auth/logout", "/api/auth/me", "/api/goals"]);
  });

  it("vender o cobrar borra también las cifras del tablero; cambiar el plan, /api/plan", async () => {
    instalarSobreElFetchDelTest();
    await cachedJson("/api/admin/stats");
    await cachedJson("/api/admin/dashboard");
    await cachedJson("/api/plan");
    await window.fetch("/api/sales", { method: "POST" });
    await window.fetch("/api/admin/plan/checkout/confirm", { method: "POST" });
    await cachedJson("/api/admin/stats");
    await cachedJson("/api/admin/dashboard");
    await cachedJson("/api/plan");
    expect(pedidos.slice(3)).toEqual([
      "/api/sales",
      "/api/admin/plan/checkout/confirm",
      "/api/admin/stats",
      "/api/admin/dashboard",
      "/api/plan",
    ]);
  });
});
