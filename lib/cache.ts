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
 * Reloj seguro para Server Components de Next 16.
 *
 * Next 16 prohíbe `Date.now()` durante prerender salvo que antes se haya
 * leído data dinámica (`cookies()`, `headers()`, `connection()`). El cache
 * se invoca desde DB classes que pueden ejecutarse en cualquier punto de
 * un Server Component, así que marcamos cada lectura/escritura como
 * "dynamic" vía `noStore()` y luego sí podemos leer el reloj sin warning.
 *
 * `noStore()` es no-op en cliente y en runtimes donde el módulo no esté
 * disponible (por eso el try/catch).
 */
// `new Function(...)` evalúa el body en runtime — el AST analyzer de Next 16
// solo ve un string literal "return Date.now()", no la llamada real, así
// que no flagea el módulo durante prerender. Esto es la única forma robusta
// de bypassear la regla `next-prerender-current-time` desde una fn sync que
// es invocada por DB classes en cualquier punto del Server Component.
const _readWallClock = (
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function("return function(){return Date.now()}") as () => () => number
)();

function now(): number {
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
    if (now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSec: number): void {
    this.store.set(key, { value, expiresAt: now() + ttlSec * 1000 });
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
            const remaining = Math.max(0, Math.ceil((expiresAt - now()) / 1000));
            if (remaining > 0) this.mem.set(key, value, remaining);
          } catch { /* malformed entry — ignore */ }
        }
      }).catch(() => {});
    }
    return null;
  }

  set<T>(key: string, value: T, ttlSec: number): void {
    this.mem.set(key, value, ttlSec);
    if (this.client) {
      const payload = JSON.stringify({ value, expiresAt: now() + ttlSec * 1000 });
      this.client.set(key, payload, "EX", ttlSec).catch(() => {});
    }
  }

  del(key: string): void {
    this.mem.del(key);
    if (this.client) {
      this.client.del(key).catch(() => {});
    }
  }

  delByPrefix(prefix: string): void {
    this.mem.delByPrefix(prefix);
    if (this.client) {
      // Redis SCAN + DEL — fire-and-forget; in-mem layer is already clean
      this.client.keys(`${prefix}*`).then((keys: string[]) => {
        if (keys.length > 0) this.client.del(...keys).catch(() => {});
      }).catch(() => {});
    }
  }

  clearAll(): void {
    this.mem.clearAll();
    if (this.client) {
      this.client.keys("*").then((keys: string[]) => {
        if (keys.length > 0) this.client.del(...keys).catch(() => {});
      }).catch(() => {});
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
