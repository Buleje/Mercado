/**
 * lib/rate-limit/store.ts
 *
 * Abstracción de almacenamiento para buckets de rate limiting.
 *
 * Implementaciones:
 *   - InMemoryStore  → tests / dev. Aislado por proceso.
 *   - UpstashStore   → producción. Distribuido. Requiere env vars.
 */

import { RateLimitKey, RateLimitResult } from "./types";
import { TokenBucket, TokenBucketState, type TokenBucketConfig } from "./token-bucket";

// ── Interface pública ─────────────────────────────────────────────────────────

export interface RateLimitStore {
  /**
   * Consume `cost` tokens del bucket identificado por `key`.
   * Si el bucket no existe aún, se crea con el estado inicial lleno.
   */
  consume(key: RateLimitKey, cost: number): Promise<RateLimitResult>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function compositeKey(key: RateLimitKey): string {
  return `${key.tenantId}::${key.scope}::${key.id}`;
}

// ── InMemoryStore ─────────────────────────────────────────────────────────────

interface BucketEntry {
  state: TokenBucketState;
  bucket: TokenBucket;
  /** Timestamp ms de la última actividad — para cleanup. */
  lastAccessAt: number;
}

export interface InMemoryStoreConfig extends TokenBucketConfig {
  /**
   * Tiempo de inactividad tras el cual se elimina un bucket (ms).
   * Default: 60_000 (1 minuto).
   */
  ttlMs?: number;
}

export class InMemoryStore implements RateLimitStore {
  private readonly entries = new Map<string, BucketEntry>();
  private readonly bucketConfig: TokenBucketConfig;
  private readonly ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: InMemoryStoreConfig) {
    this.bucketConfig = {
      capacity: config.capacity,
      refillRate: config.refillRate,
      refillIntervalMs: config.refillIntervalMs,
    };
    this.ttlMs = config.ttlMs ?? 60_000;

    // Cleanup cada ttlMs para evitar memory leaks en procesos de larga vida
    this.cleanupTimer = setInterval(() => this._cleanup(), this.ttlMs);

    // No bloquear el proceso si este timer es el único pendiente
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  async consume(key: RateLimitKey, cost: number): Promise<RateLimitResult> {
    const k = compositeKey(key);
    const nowMs = Date.now();
    const bucket = new TokenBucket(this.bucketConfig);

    let entry = this.entries.get(k);
    if (!entry) {
      entry = {
        bucket,
        state: bucket.initialState(nowMs),
        lastAccessAt: nowMs,
      };
    }

    const { state, allowed } = entry.bucket.consume(entry.state, cost, nowMs);
    entry.state = state;
    entry.lastAccessAt = nowMs;
    this.entries.set(k, entry);

    if (allowed) {
      return {
        allowed: true,
        remaining: Math.floor(state.tokens),
        resetAt: entry.bucket.resetAt(state, nowMs),
      };
    } else {
      return {
        allowed: false,
        retryAfterMs: entry.bucket.msUntilAvailable(
          // estado ANTES del intento fallido para calcular tiempo
          { tokens: state.tokens, lastRefillAt: nowMs },
          cost,
          nowMs,
        ),
      };
    }
  }

  /** Limpia entradas inactivas. Llamado internamente por el timer. */
  _cleanup(nowMs = Date.now()): void {
    for (const [k, entry] of this.entries) {
      if (nowMs - entry.lastAccessAt > this.ttlMs) {
        this.entries.delete(k);
      }
    }
  }

  /** Libera el timer de cleanup. Útil en tests. */
  destroy(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Para inspección en tests. */
  get size(): number {
    return this.entries.size;
  }
}

// ── UpstashStore (STUB) ───────────────────────────────────────────────────────
//
// TODO: cuando se instale @upstash/redis:
//   import { Redis } from "@upstash/redis";
//   const redis = new Redis({
//     url: process.env.UPSTASH_REDIS_REST_URL!,
//     token: process.env.UPSTASH_REDIS_REST_TOKEN!,
//   });
//
// El algoritmo recomendado para Upstash es "sliding window" vía
// Upstash Ratelimit SDK (@upstash/ratelimit):
//   const ratelimit = new Ratelimit({
//     redis,
//     limiter: Ratelimit.tokenBucket(capacity, `${refillIntervalMs} ms`, refillRate),
//   });
//
// Referencia: https://upstash.com/docs/redis/sdks/ratelimit-ts/algorithms

export class UpstashStore implements RateLimitStore {
  private readonly configured: boolean;

  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    this.configured = Boolean(url && token);
  }

  async consume(_key: RateLimitKey, _cost: number): Promise<RateLimitResult> {
    if (!this.configured) {
      // Fallar abierto con warning — el caller decide si bloquear o no
      throw new Error(
        "[UpstashStore] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured. " +
          "Set ALLOW_IN_MEMORY_RATELIMIT=true to use InMemoryStore as fallback, " +
          "or provision Upstash Redis credentials.",
      );
    }
    // TODO: implementar con @upstash/ratelimit cuando se instale el SDK
    throw new Error("[UpstashStore] not yet implemented — install @upstash/ratelimit");
  }
}
