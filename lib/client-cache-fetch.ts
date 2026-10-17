"use client";

/**
 * client-cache-fetch.ts — GET con dedup de requests en vuelo + cache TTL en
 * memoria del cliente. Resuelve el anti-patrón "cada componente/hook hace su
 * propio fetch del mismo endpoint global" (ej: /api/plan se pedía 5× por carga).
 *
 * - N consumidores que montan a la vez → comparten 1 sola request (in-flight).
 * - Dentro del TTL → 0 requests (sirve de cache en memoria).
 * - Tras un write que cambie el dato → `invalidateCachedJson(url)`.
 *
 * Scope: solo lectura de endpoints globales/idempotentes por tab del admin.
 * NO usar para datos que deben ser siempre frescos en cada render.
 */

type Entry = { at: number; data: unknown };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedJson<T = unknown>(url: string, ttlMs = 60_000, init?: RequestInit): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;

  const flying = inflight.get(url);
  if (flying) return flying as Promise<T | null>;

  // Sólo guarda si sigue siendo EL pedido vigente de esa URL: una invalidación
  // (escritura, salir, cambiar de tienda) a mitad de camino lo saca de `inflight`,
  // y su respuesta ya es vieja (revisión 16-10: un /api/auth/me del usuario
  // anterior quedaba 60 s). Tampoco borra el pedido más nuevo que lo reemplazó.
  const p: Promise<T | null> = fetch(url, { credentials: "include", ...init })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (inflight.get(url) === p) {
        cache.set(url, { at: Date.now(), data });
        inflight.delete(url);
      }
      return data as T;
    })
    .catch(() => {
      if (inflight.get(url) === p) inflight.delete(url);
      return null;
    });

  inflight.set(url, p);
  return p;
}

/**
 * Lo que ya está en el cache y sigue vigente, sin pedir nada (`undefined` si no
 * hay). Para el estado INICIAL de un hook: un componente que monta cuando su
 * padre ya leyó el dato lo tiene en el primer render, sin esperar una vuelta.
 */
export function cachedJsonVigente<T = unknown>(url: string, ttlMs = 60_000): T | undefined {
  const hit = cache.get(url);
  return hit && Date.now() - hit.at < ttlMs ? (hit.data as T) : undefined;
}

/** Invalida una URL exacta (o todo el cache si no se pasa url). */
export function invalidateCachedJson(url?: string): void {
  if (url) {
    cache.delete(url);
    inflight.delete(url);
  } else {
    cache.clear();
    inflight.clear();
  }
}

/** `url` es el recurso `prefijo` o algo debajo (`/api/fiados?…`, `/api/fiados/x`), no `/api/fiadosX`. */
function esDelRecurso(url: string, prefijo: string): boolean {
  return url === prefijo || url.startsWith(`${prefijo}?`) || url.startsWith(`${prefijo}/`);
}

/**
 * Invalida el recurso `prefijo` con todas sus consultas (`/api/fiados` borra
 * también `/api/fiados?status=ACTIVO` y `/api/fiados/resumen`). Para después de
 * una escritura cuyo recurso se lee con varias consultas.
 */
export function invalidateCachedJsonPrefijo(prefijo: string): void {
  for (const url of [...cache.keys()]) if (esDelRecurso(url, prefijo)) cache.delete(url);
  for (const url of [...inflight.keys()]) if (esDelRecurso(url, prefijo)) inflight.delete(url);
}

// ── Invalidación automática al escribir ───────────────────────────────────
// `/api/settings` se escribe desde ~10 pantallas (Ajustes, Tienda, Impuestos,
// el editor de la tienda…) y fiados/gastos/metas desde otras tantas: invalidar
// a mano en cada una se olvida. Con esto, toda escritura del panel a
// `/api/<recurso>` borra lo cacheado de ese recurso al salir y al volver.

/** «/api/fiados/x/pagar» → «/api/fiados»; «/api/admin/caja/abrir» → «/api/admin/caja». */
export function recursoDe(ruta: string): string | null {
  const m = ruta.match(/^\/api\/(admin\/)?([^/?#]+)/);
  return m ? `/api/${m[1] ?? ""}${m[2]}` : null;
}

function rutaDe(input: RequestInfo | URL): string {
  const crudo = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (crudo.startsWith("/")) return crudo;
  try {
    const u = new URL(crudo);
    return u.origin === window.location.origin ? `${u.pathname}${u.search}` : "";
  } catch {
    return "";
  }
}

const INSTALADA = Symbol.for("bsm.cachedJson.invalidaAlEscribir");

/** Rotar el token no cambia quién es la sesión (medido 16-10: el refresh del arranque re-pedía /api/auth/me). */
const NO_INVALIDA = /^\/api\/auth\/refresh(?:[/?#]|$)/;
/** Escrituras que cambian QUIÉN es la sesión o de qué tienda: todo lo leído era de la anterior. */
const CAMBIA_SESION = /^\/api\/(?:auth|superadmin\/impersonate)(?:[/?#]|$)/;

/** Escrituras que mueven las cifras del tablero: Inicio no puede quedar 30 s atrás tras vender. */
const MUEVE_TABLERO = /^\/api\/(?:admin\/)?(?:sales|orders|expenses|fiados|payables|purchases)(?:[/?#]|$)/;
const LEE_TABLERO = ["/api/admin/stats", "/api/admin/dashboard", "/api/admin/por-cobrar"] as const;
/** El plan se cambia por /api/admin/plan/… pero se lee también por /api/plan. */
const CAMBIA_PLAN = /^\/api\/admin\/plan(?:[/?#]|$)/;

/** Qué borra una escritura a `ruta` (null = nada). */
function invalidacionDe(ruta: string): (() => void) | null {
  if (!ruta || NO_INVALIDA.test(ruta)) return null;
  if (CAMBIA_SESION.test(ruta)) return () => invalidateCachedJson();
  const recurso = recursoDe(ruta);
  if (!recurso) return null;
  const extra: string[] = [];
  if (MUEVE_TABLERO.test(ruta)) extra.push(...LEE_TABLERO);
  if (CAMBIA_PLAN.test(ruta)) extra.push("/api/plan");
  return () => {
    invalidateCachedJsonPrefijo(recurso);
    for (const r of extra) invalidateCachedJsonPrefijo(r);
  };
}

/**
 * Envuelve `window.fetch` UNA vez: un POST/PUT/PATCH/DELETE a `/api/<recurso>`
 * invalida lo cacheado de ese recurso al salir y otra vez al responder (un
 * lector que corrió durante la escritura no deja guardado el dato viejo). Entrar,
 * salir o suplantar borra todo; rotar el token, nada. Los GET pasan sin tocar.
 * Lo instala el shell del panel; en tests no se instala.
 */
export function instalarInvalidacionPorEscritura(): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "test") return;
  const w = window as Window & { [INSTALADA]?: boolean };
  if (w[INSTALADA]) return;
  w[INSTALADA] = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const metodo = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const invalidar = metodo === "GET" || metodo === "HEAD" ? null : invalidacionDe(rutaDe(input));
    if (!invalidar) return original(input, init);
    invalidar();
    return original(input, init).then((res) => {
      invalidar();
      return res;
    });
  };
}

// ── Sondeo compartido ─────────────────────────────────────────────────────
// Medido 16-10 (`scripts/medir-carga.mjs`): la campana, el banner de alertas y
// el chat del panel sondeaban cada uno con su propio `setInterval`, también con
// la pestaña oculta, y el doble montaje de StrictMode o dos copias del mismo
// componente (cabecera de escritorio + de celular) sumaban timers y pedidos.

type Oyente = (data: unknown) => void;
type Sondeo = { oyentes: Set<Oyente>; timer: ReturnType<typeof setInterval> | null; ms: number; init?: RequestInit };

const sondeos = new Map<string, Sondeo>();
let escuchaVisibilidad = false;

function oculta(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** Una vuelta: pide (o reusa lo que alguien leyó hace menos de medio intervalo) y avisa a todos. */
function vuelta(url: string): void {
  const s = sondeos.get(url);
  if (!s || oculta()) return;
  void cachedJson(url, s.ms / 2, s.init).then((data) => {
    const vivo = sondeos.get(url);
    if (vivo) for (const o of [...vivo.oyentes]) o(data);
  });
}

/** Al volver a la pestaña: los sondeos cuya última lectura ya venció piden al instante. */
function alVolverALaVista(): void {
  if (oculta()) return;
  for (const [url, s] of sondeos) {
    const hit = cache.get(url);
    if (!hit || Date.now() - hit.at >= s.ms) vuelta(url);
  }
}

/**
 * Sondea `url` cada `intervaloMs` compartiendo UN timer y UN pedido por vuelta
 * entre todos los suscriptores de esa URL. Con la pestaña oculta no pide; al
 * volver, pide al instante si lo último ya venció. La primera lectura reusa lo
 * vigente del cache (o el pedido en vuelo). Devuelve la baja.
 *
 * `alLeer` recibe `null` si el pedido falló o no fue 2xx (como `cachedJson`).
 */
export function suscribirSondeo<T = unknown>(
  url: string,
  intervaloMs: number,
  alLeer: (data: T | null) => void,
  init?: RequestInit,
): () => void {
  let s = sondeos.get(url);
  if (!s) {
    s = { oyentes: new Set(), timer: null, ms: intervaloMs, init };
    sondeos.set(url, s);
  }
  const oyente = alLeer as Oyente;
  s.oyentes.add(oyente);
  // Dos suscriptores con distinto intervalo: manda el más corto.
  if (intervaloMs < s.ms) {
    s.ms = intervaloMs;
    if (s.timer) clearInterval(s.timer);
    s.timer = null;
  }
  if (!s.timer) s.timer = setInterval(() => vuelta(url), s.ms);
  if (!escuchaVisibilidad && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", alVolverALaVista);
    escuchaVisibilidad = true;
  }

  const actual = s;
  void cachedJson<T>(url, s.ms, s.init).then((data) => {
    if (actual.oyentes.has(oyente)) oyente(data);
  });

  return () => {
    actual.oyentes.delete(oyente);
    if (actual.oyentes.size > 0) return;
    if (actual.timer) clearInterval(actual.timer);
    if (sondeos.get(url) === actual) sondeos.delete(url);
  };
}

/** Pide ya (sin esperar la vuelta) y avisa a todos los suscriptores: tras una escritura. */
export function refrescarSondeo(url: string): void {
  invalidateCachedJson(url);
  vuelta(url);
}

/**
 * `setInterval` que no corre con la pestaña oculta y, al volver, corre al
 * instante si ya pasó un intervalo desde la última vez. Para los sondeos que no
 * pueden ir por `cachedJson` (leen un header, usan `tenantFetch` o son por
 * usuario y por hilo). Asume que quien lo llama ya hizo la primera lectura.
 * Devuelve la baja.
 */
export function intervaloVisible(fn: () => void, ms: number): () => void {
  let ultimo = Date.now();
  const correr = () => {
    ultimo = Date.now();
    fn();
  };
  const timer = setInterval(() => {
    if (!oculta()) correr();
  }, ms);
  const alVolver = () => {
    if (!oculta() && Date.now() - ultimo >= ms) correr();
  };
  document.addEventListener("visibilitychange", alVolver);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", alVolver);
  };
}
