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

export interface CacheStore {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlSec: number): void;
  del(key: string): void;
  /** Evict all keys that start with `prefix`. */
  delByPrefix?(prefix: string): void;
}

// ── In-memory store (single process, suitable for serverless warm instances) ──

type Entry<T> = { value: T; expiresAt: number };

class MemoryStore implements CacheStore {
  private store = new Map<string, Entry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSec: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  delByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
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
      // Dynamic require keeps ioredis optional — app works without it installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require("ioredis");
      this.client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
      });
      this.client.on("error", (err: Error) => {
        // Log but don't crash — callers fall back to the mem layer
        console.error("[cache/redis] connection error:", err.message);
      });
    } catch {
      console.warn("[cache/redis] ioredis not installed — falling back to MemoryStore");
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
            const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
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
      const payload = JSON.stringify({ value, expiresAt: Date.now() + ttlSec * 1000 });
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
}

// ── Global singleton — survives across requests in the same serverless instance ─

const globalForCache = global as typeof global & { __bsmCache?: CacheStore };

function createStore(): CacheStore {
  if (process.env.REDIS_URL) {
    return new RedisStore(process.env.REDIS_URL);
  }
  return new MemoryStore();
}

export const cacheStore: CacheStore = (globalForCache.__bsmCache ??= createStore());

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
  const value = await fn();
  cacheStore.set(key, value, ttlSec);
  return value;
}

/** Evict a specific key (call after mutations to invalidate stale data) */
export function invalidate(key: string): void {
  cacheStore.del(key);
}

/** Evict ALL keys whose string representation starts with `prefix` */
export function invalidateByPrefix(prefix: string): void {
  cacheStore.delByPrefix?.(prefix);
}
