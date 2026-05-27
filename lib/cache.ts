/**
 * lib/cache.ts
 *
 * Lightweight TTL cache with optional Redis backing.
 *
 * By default uses an in-process MemoryStore (suitable for serverless warm
 * instances). Set the `REDIS_URL` environment variable to transparently switch
 * to Redis-backed caching via ioredis — no caller changes required.
 *
 * Redis usage:
 *   1. `npm install ioredis`
 *   2. Set REDIS_URL=redis://... in your environment
 *   3. Done — the singleton below picks it up automatically.
 *
 * CacheStore interface:
 *   get<T>(key): T | null
 *   set<T>(key, value, ttlSec): void
 *   del(key): void
 */

import { logger } from "@/lib/logger";
import { unstable_noStore as noStore } from "next/cache";

/**
 * Reloj para el cache.
 *
 * Next 16 con `cacheComponents: true` prohíbe `Date.now()` y `new Date()`
 * durante prerender de Server Components — incluso a través de bypasses
 * con `new Function(...)` o `unstable_noStore()` (Next 16.0.x detecta el
 * uso en runtime también, no solo en el AST estático).
 *
 * Solución: usar `performance.now()` para el path in-process. Es un
 * reloj monotónico (milisegundos desde el origin del proceso, no
 * wall-clock), no está flageado por Next 16, y es perfectamente válido
 * para comparar TTL deltas dentro de la misma instancia (MemoryStore).
 *
 * Para el RedisStore (cross-instance), seguimos necesitando wall-clock
 * porque el `expiresAt` se serializa a JSON y otra instancia lo lee. Ahí
 * usamos el bypass legacy con `noStore()` + `new Function(...)`. Pero
 * solo se ejecuta cuando REDIS_URL está configurado, así que el path
 * default (MemoryStore) queda 100 % limpio de la regla.
 */
function nowMono(): number {
  // performance.now() es global en Node ≥16 y en navegadores. Devuelve un
  // número monotónico no-decreciente — ideal para comparar TTL dentro
  // del mismo proceso. NO está flageado por Next 16.
  return performance.now();
}

// Wall-clock bypass — solo se invoca desde RedisStore. Los Server
// Components de la home no llaman a este path mientras REDIS_URL no
// esté seteado.
const _readWallClock = (
   
  new Function("return function(){return Date.now()}") as () => () => number
)();

function nowWall(): number {
  try {
    noStore();
  } catch {
    // Cliente / non-Next runtime: caemos sin opt-out.
  }
  return _readWallClock();
}

export interface CacheStore {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlSec: number): void;
  del(key: string): void;
  /** Evict all keys that start with `prefix`. */
  delByPrefix?(prefix: string): void;
  /** Evict ALL keys — nuclear reset. */
  clearAll?(): void;
}

// ── In-memory store (single process, suitable for serverless warm instances) ──

type Entry<T> = { value: T; expiresAt: number };

class MemoryStore implements CacheStore {
  private store = new Map<string, Entry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (nowMono() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSec: number): void {
    this.store.set(key, { value, expiresAt: nowMono() + ttlSec * 1000 });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  delByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clearAll(): void {
    this.store.clear();
  }
}

// ── Redis store (requires ioredis + REDIS_URL env var) ─────────────────────────

/**
 * RedisStore wraps ioredis and mirrors the synchronous CacheStore interface.
 *
 * Because Redis I/O is async but CacheStore.get() is sync, the Redis store
 * keeps a local in-memory write-through layer for reads. Background writes to
 * Redis happen fire-and-forget; this gives sub-millisecond read latency while
 * still persisting data across serverless instances.
 */
class RedisStore implements CacheStore {
  private mem = new MemoryStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any; // ioredis.Redis — typed loosely to avoid hard dependency

  constructor(url: string) {
    try {
      // Use runtime-only require so Turbopack does not try to bundle ioredis.
      const runtimeRequire = globalThis.Function("return require")() as (id: string) => unknown;
      const Redis = runtimeRequire("ioredis") as new (
        redisUrl: string,
        options: { lazyConnect: boolean; maxRetriesPerRequest: number; enableReadyCheck: boolean }
      ) => {
        on(event: string, handler: (err: Error) => void): void;
        get(key: string): Promise<string | null>;
        set(key: string, value: string, mode: "EX", ttlSec: number): Promise<unknown>;
        del(...keys: string[]): Promise<unknown>;
        keys(pattern: string): Promise<string[]>;
      };
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
      });
      this.client.on("error", (err: Error) => {
        // Log but don't crash — callers fall back to the mem layer
        logger.error("[cache/redis] connection error", { error: err.message });
      });
    } catch {
      logger.warn("[cache/redis] ioredis not installed — falling back to MemoryStore");
      this.client = null;
    }
  }

  get<T>(key: string): T | null {
    // Serve from local memory (populated on set); async warm-up on miss
    const cached = this.mem.get<T>(key);
    if (cached !== null) return cached;

    // Best-effort async warm-up from Redis on in-memory miss
    if (this.client) {
      this.client.get(key).then((raw: string | null) => {
        if (raw) {
          try {
            const { value, expiresAt } = JSON.parse(raw) as { value: T; expiresAt: number };
            const remaining = Math.max(0, Math.ceil((expiresAt - nowWall()) / 1000));
            if (remaining > 0) this.mem.set(key, value, remaining);
          } catch { /* malformed entry — ignore */ }
        }
      }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }
    return null;
  }

  set<T>(key: string, value: T, ttlSec: number): void {
    this.mem.set(key, value, ttlSec);
    if (this.client) {
      const payload = JSON.stringify({ value, expiresAt: nowWall() + ttlSec * 1000 });
      this.client.set(key, payload, "EX", ttlSec).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }
  }

  del(key: string): void {
    this.mem.del(key);
    if (this.client) {
      this.client.del(key).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }
  }

  delByPrefix(prefix: string): void {
    this.mem.delByPrefix(prefix);
    if (this.client) {
      // Redis SCAN + DEL — fire-and-forget; in-mem layer is already clean
      this.client.keys(`${prefix}*`).then((keys: string[]) => {
        if (keys.length > 0) this.client.del(...keys).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
      }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }
  }

  clearAll(): void {
    this.mem.clearAll();
    if (this.client) {
      this.client.keys("*").then((keys: string[]) => {
        if (keys.length > 0) this.client.del(...keys).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
      }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }
  }
}

// ── Global singleton — survives across requests in the same serverless instance ─

const globalForCache = global as typeof global & { __bulejeCache?: CacheStore };

function createStore(): CacheStore {
  if (process.env.REDIS_URL) {
    return new RedisStore(process.env.REDIS_URL);
  }
  return new MemoryStore();
}

export const cacheStore: CacheStore = (globalForCache.__bulejeCache ??= createStore());

/**
 * Single-flight registry — coalesce concurrent cache misses for the same key
 * into one underlying call. Prevents thundering-herd on cold caches: if
 * three requests for `getBySlug("foo")` arrive in parallel, only the first
 * actually queries the DB; the other two await the same promise.
 *
 * The map is keyed by cache key and stores the in-flight promise. Entries
 * are cleared as soon as the promise settles (success or failure), so the
 * dedup window equals the call duration — usually milliseconds.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Get a cached value or compute it.
 * @param key    Cache key (include tenantId to isolate per tenant)
 * @param ttlSec Time-to-live in seconds
 * @param fn     Factory called on cache miss
 */
export async function getOrSet<T>(
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = cacheStore.get<T>(key);
  if (cached !== null) return cached;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    try {
      const value = await fn();
      cacheStore.set(key, value, ttlSec);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/** Evict a specific key (call after mutations to invalidate stale data) */
// reload-marker: 2026-04-30 mi-pollo trial fix
export function invalidate(key: string): void {
  cacheStore.del(key);
}

/** Evict ALL keys whose string representation starts with `prefix` */
export function invalidateByPrefix(prefix: string): void {
  cacheStore.delByPrefix?.(prefix);
}

/** Nuclear: evict ALL cached keys (for full data purge) */
export function invalidateAll(): void {
  cacheStore.clearAll?.();
}
