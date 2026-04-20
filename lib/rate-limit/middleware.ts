/**
 * lib/rate-limit/middleware.ts
 *
 * Helper para rutas Next.js 16 (App Router).
 * Retorna NextResponse 429 con header Retry-After si excede el límite,
 * null si la request puede continuar.
 *
 * Uso en app/api/marketplace/payments/route.ts:
 *
 *   import { enforceRateLimit } from "@/lib/rate-limit/middleware";
 *
 *   export async function POST(req: NextRequest) {
 *     const limited = await enforceRateLimit(req, {
 *       tenantId: "mi-tienda",
 *       scope: "api:payments",
 *       capacity: 10,
 *       refillRate: 1,
 *     });
 *     if (limited) return limited;
 *     // ... lógica del endpoint
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { InMemoryStore, UpstashStore, type RateLimitStore } from "./store";
import { type RateLimitKey } from "./types";
import { type TokenBucketConfig } from "./token-bucket";

export interface EnforceRateLimitConfig extends TokenBucketConfig {
  /** ID del tenant. */
  tenantId: string;
  /** Scope funcional (p.ej. "api:payments"). */
  scope: string;
  /**
   * Extrae el "id" del actor (IP, userId, etc.) de la request.
   * Default: X-Forwarded-For o x-real-ip o "anon".
   */
  getActorId?: (req: NextRequest) => string;
  /**
   * Store a usar. Si se omite, usa UpstashStore en prod e InMemoryStore en dev.
   */
  store?: RateLimitStore;
  /**
   * Mensaje de error en el cuerpo JSON del 429.
   * Default: "Too Many Requests".
   */
  errorMessage?: string;
}

function defaultActorId(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

// Stores singleton por scope para evitar instanciar en cada request
const storeCache = new Map<string, RateLimitStore>();

function getStore(config: EnforceRateLimitConfig): RateLimitStore {
  const cacheKey = `${config.scope}::${config.tenantId}`;
  let store = storeCache.get(cacheKey);
  if (!store) {
    if (config.store) {
      store = config.store;
    } else if (process.env.NODE_ENV === "production") {
      store = new UpstashStore();
    } else {
      store = new InMemoryStore({
        capacity: config.capacity,
        refillRate: config.refillRate,
        refillIntervalMs: config.refillIntervalMs,
      });
    }
    storeCache.set(cacheKey, store);
  }
  return store;
}

/**
 * Evalúa el rate limit para la request entrante.
 *
 * - Retorna `null` si la request está dentro del límite.
 * - Retorna `NextResponse` (429) si excede el límite.
 */
export async function enforceRateLimit(
  req: NextRequest,
  config: EnforceRateLimitConfig,
): Promise<NextResponse | null> {
  const store = getStore(config);
  const actorId = (config.getActorId ?? defaultActorId)(req);

  const key: RateLimitKey = {
    tenantId: config.tenantId,
    scope: config.scope,
    id: actorId,
  };

  const result = await store.consume(key, 1);

  if (result.allowed) {
    return null;
  }

  const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);

  return NextResponse.json(
    { error: config.errorMessage ?? "Too Many Requests", retryAfterMs: result.retryAfterMs },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Retry-After-Ms": String(result.retryAfterMs),
      },
    },
  );
}

/**
 * Limpia el cache de stores (util en tests para aislar suites).
 */
export function _clearStoreCache(): void {
  storeCache.clear();
}
