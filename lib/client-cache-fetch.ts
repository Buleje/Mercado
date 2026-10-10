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

  const p = fetch(url, { credentials: "include", ...init })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      cache.set(url, { at: Date.now(), data });
      inflight.delete(url);
      return data as T;
    })
    .catch(() => {
      inflight.delete(url);
      return null;
    });

  inflight.set(url, p);
  return p as Promise<T | null>;
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
