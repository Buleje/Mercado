/**
 * lib/rate-limit/index.ts
 *
 * Factory principal. Crea limiters reutilizables por scope.
 *
 * Uso en un route handler:
 *
 *   const limiter = rateLimit({ scope: "api:payments", capacity: 10, refillRate: 1 });
 *   const result = await limiter({ tenantId: "mi-tienda", id: req.ip ?? "anon" });
 *   if (!result.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
 */

import { RateLimitKey, RateLimitResult } from "./types";
import { RateLimitStore, InMemoryStore, UpstashStore } from "./store";
import { type TokenBucketConfig } from "./token-bucket";

export type { RateLimitKey, RateLimitResult, RateLimitStore };
export { InMemoryStore, UpstashStore } from "./store";
export { TokenBucket } from "./token-bucket";

// ── Factory config ────────────────────────────────────────────────────────────

export interface RateLimitConfig extends TokenBucketConfig {
  /** Área funcional. Se añade automáticamente a cada key. */
  scope: string;
  /**
   * Store a usar. Si se omite:
   *   - prod: UpstashStore (lanza si no hay env vars)
   *   - dev/test: InMemoryStore
   */
  store?: RateLimitStore;
}

/**
 * Crea un limiter acotado a un `scope` específico.
 * El caller solo pasa tenantId + id — el scope queda encapsulado.
 */
export function rateLimit(
  config: RateLimitConfig,
): (key: Omit<RateLimitKey, "scope">) => Promise<RateLimitResult> {
  const store: RateLimitStore =
    config.store ??
    (process.env.NODE_ENV === "production"
      ? new UpstashStore()
      : new InMemoryStore({
          capacity: config.capacity,
          refillRate: config.refillRate,
          refillIntervalMs: config.refillIntervalMs,
        }));

  return async (key: Omit<RateLimitKey, "scope">) => {
    const fullKey: RateLimitKey = { ...key, scope: config.scope };
    return store.consume(fullKey, 1);
  };
}

/**
 * Crea un limiter con costo variable por llamada.
 * Útil para endpoints con peso diferente (p.ej. búsqueda = 1, export = 5).
 */
export function rateLimitWithCost(
  config: RateLimitConfig,
): (key: Omit<RateLimitKey, "scope">, cost: number) => Promise<RateLimitResult> {
  const store: RateLimitStore =
    config.store ??
    (process.env.NODE_ENV === "production"
      ? new UpstashStore()
      : new InMemoryStore({
          capacity: config.capacity,
          refillRate: config.refillRate,
          refillIntervalMs: config.refillIntervalMs,
        }));

  return async (key: Omit<RateLimitKey, "scope">, cost: number) => {
    const fullKey: RateLimitKey = { ...key, scope: config.scope };
    return store.consume(fullKey, cost);
  };
}
