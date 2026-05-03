"use client";

/**
 * client-fetch.ts — wrapper liviano de fetch para client components.
 *
 * Resuelve 3 issues que el designer audit detectó:
 *   1. 503 sin handling visible al usuario → retry con backoff exponencial
 *   2. Requests duplicados (e.g. /api/auth/customer/me llamado 9 veces) → dedup
 *      por URL+method en una ventana de 2s
 *   3. Sin error feedback → canal interno (no window.dispatchEvent) que toasts
 *      pueden escuchar — evita que terceros disparen mensajes phishing.
 *
 * Sin dependencias nuevas (no SWR, no React Query). Pensado para client
 * components que solo necesitan GET con cache de corta vida. Para mutaciones
 * o flujos complejos usar fetch nativo.
 *
 * SECURITY (audit P9):
 *   - "use client" — el cache es per-tab, no compartido entre usuarios SSR
 *   - URLs validadas same-origin: solo paths que empiezan con "/" se aceptan,
 *     evita SSRF latente si un caller pasa user input.
 *   - emitError limpia la URL a path-only antes de emitir (no leakea query
 *     params con tokens).
 *   - NetworkErrorBus es un EventTarget privado, no window — terceros no
 *     pueden disparar toasts maliciosos.
 */

const inflight = new Map<string, Promise<Response>>();
const cache = new Map<string, { data: unknown; expires: number }>();

interface FetchOpts {
  /** Cache TTL en ms — durante este tiempo se reutiliza la respuesta. Default 0 (no cache). */
  cacheTTL?: number;
  /** Reintentos en errores 5xx + network. Default 2. */
  retries?: number;
  /** Backoff base en ms. Cada intento: base * 2^n. Default 400. */
  backoffMs?: number;
  /** Si true, suprime el evento de error. Default false. */
  silent?: boolean;
  /** Para extender comportamiento de fetch nativo. */
  init?: RequestInit;
}

const DEFAULTS = { cacheTTL: 0, retries: 2, backoffMs: 400, silent: false } as const;

/**
 * Bus privado de eventos de red. Exportado para que NetworkErrorListener
 * lo suscriba directo. Antes usábamos window.dispatchEvent(CustomEvent) lo
 * cual permitía que terceros (analytics, tag manager, XSS) dispararan
 * toasts con mensajes phishing.
 */
export const NetworkErrorBus = typeof window !== "undefined" ? new EventTarget() : null;

interface NetworkErrorDetail {
  url: string;
  status?: number;
  message: string;
}

function emitError(detail: NetworkErrorDetail) {
  if (!NetworkErrorBus) return;
  // Strip query params — no leakear tokens / IDs sensibles
  let safeUrl = detail.url;
  try {
    const u = new URL(detail.url, "http://localhost");
    safeUrl = u.pathname;
  } catch { /* malformed url, leave as-is */ }
  NetworkErrorBus.dispatchEvent(
    new CustomEvent("network-error", {
      detail: { ...detail, url: safeUrl },
    }),
  );
}

/** Validación same-origin: solo aceptamos paths internos. */
function assertSameOrigin(url: string): void {
  if (url.startsWith("/")) return;
  // Permitir URLs absolutas a la misma origin
  if (typeof window !== "undefined") {
    try {
      const u = new URL(url);
      if (u.origin === window.location.origin) return;
    } catch { /* malformed */ }
  }
  throw new Error(`clientFetch: URL no permitida (solo same-origin): ${url}`);
}

function buildKey(url: string, init?: RequestInit): string {
  return `${init?.method ?? "GET"}:${url}`;
}

/**
 * Fetch con retry + dedup + cache opcional.
 *
 * Retorna directamente los datos parseados como JSON. Si querés la Response
 * cruda usá fetch nativo.
 */
export async function clientFetch<T = unknown>(
  url: string,
  opts: FetchOpts = {},
): Promise<T> {
  // SECURITY: bloquear URLs externas (SSRF / data exfiltration)
  assertSameOrigin(url);

  const { cacheTTL, retries, backoffMs, silent, init } = { ...DEFAULTS, ...opts };
  const key = buildKey(url, init);

  // Cache hit
  if (cacheTTL > 0) {
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }
  }

  // Dedup: si ya hay una promesa en vuelo para esta misma key, devolverla.
  // Importante: propagar errores también — antes el caller secundario quedaba
  // colgado si el request original rechazaba (no se ejecutaba .then).
  const existing = inflight.get(key);
  if (existing) {
    return existing.then(
      (r) => r.clone().json() as Promise<T>,
      (err) => Promise.reject(err),
    );
  }

  const exec = async (attempt: number): Promise<Response> => {
    try {
      const res = await fetch(url, init);
      // 5xx → retry
      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)));
        return exec(attempt + 1);
      }
      if (!res.ok && !silent) {
        emitError({
          url,
          status: res.status,
          message:
            res.status >= 500
              ? "Tuvimos un problema temporal. Probá refrescar."
              : "No pudimos cargar esta sección.",
        });
      }
      return res;
    } catch (err) {
      // network error
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)));
        return exec(attempt + 1);
      }
      if (!silent) {
        emitError({
          url,
          message: "Sin conexión. Revisá tu internet e intentá de nuevo.",
        });
      }
      throw err;
    }
  };

  const promise = exec(0);
  inflight.set(key, promise);

  try {
    const res = await promise;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} on ${url}`);
    }
    const data = (await res.json()) as T;
    if (cacheTTL > 0) {
      cache.set(key, { data, expires: Date.now() + cacheTTL });
    }
    return data;
  } finally {
    inflight.delete(key);
  }
}

/** Limpia cache y inflight — útil tras logout o cambio de tenant. */
export function clearClientFetchCache(): void {
  cache.clear();
  inflight.clear();
}
