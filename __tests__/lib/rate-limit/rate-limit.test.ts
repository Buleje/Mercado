/**
 * __tests__/lib/rate-limit/rate-limit.test.ts
 *
 * Suite de 13 tests para el sistema de rate limiting multi-tenant.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TokenBucket } from "@/lib/rate-limit/token-bucket";
import { InMemoryStore, UpstashStore } from "@/lib/rate-limit/store";
import { rateLimit } from "@/lib/rate-limit/index";
import { enforceRateLimit, _clearStoreCache } from "@/lib/rate-limit/middleware";
import type { RateLimitKey } from "@/lib/rate-limit/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeKey(overrides?: Partial<RateLimitKey>): RateLimitKey {
  return {
    tenantId: "tenant-a",
    scope: "api:test",
    id: "user-1",
    ...overrides,
  };
}

function makeStore(capacity = 5, refillRate = 1) {
  return new InMemoryStore({ capacity, refillRate, ttlMs: 500 });
}

// ── TokenBucket ────────────────────────────────────────────────────────────────

describe("TokenBucket", () => {
  it("consume exitoso cuando hay tokens suficientes", () => {
    const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
    const now = Date.now();
    const state = bucket.initialState(now);
    const { allowed, state: newState } = bucket.consume(state, 3, now);

    expect(allowed).toBe(true);
    expect(newState.tokens).toBeCloseTo(7, 1);
  });

  it("consume falla cuando no hay tokens", () => {
    const bucket = new TokenBucket({ capacity: 3, refillRate: 1 });
    const now = Date.now();
    const state = bucket.initialState(now);

    // Vaciar el bucket
    const { state: s1 } = bucket.consume(state, 3, now);
    // Intentar consumir más
    const { allowed } = bucket.consume(s1, 1, now);

    expect(allowed).toBe(false);
  });

  it("recarga tokens proporcional al tiempo transcurrido", () => {
    const bucket = new TokenBucket({ capacity: 10, refillRate: 2 }); // 2 tokens/s
    const t0 = 1_000_000;
    const state = bucket.initialState(t0);

    // Vaciar
    const { state: empty } = bucket.consume(state, 10, t0);
    expect(empty.tokens).toBeCloseTo(0, 1);

    // 2 segundos después = 4 tokens nuevos
    const t2 = t0 + 2000;
    const { allowed, state: refilled } = bucket.consume(empty, 3, t2);

    expect(allowed).toBe(true);
    expect(refilled.tokens).toBeCloseTo(1, 0);
  });

  it("no excede capacity al recargar", () => {
    const bucket = new TokenBucket({ capacity: 5, refillRate: 10 });
    const t0 = 1_000_000;
    const state = { tokens: 3, lastRefillAt: t0 };
    // 10 segundos = 100 tokens recargados, pero cap es 5
    const { state: s } = bucket.consume(state, 1, t0 + 10_000);
    expect(s.tokens).toBeLessThanOrEqual(5);
  });

  it("msUntilAvailable calcula espera correctamente", () => {
    const bucket = new TokenBucket({ capacity: 10, refillRate: 2 }); // 2 t/s
    const t0 = 1_000_000;
    const state = { tokens: 0, lastRefillAt: t0 };
    // Necesito 4 tokens a 2 t/s = 2000 ms
    const wait = bucket.msUntilAvailable(state, 4, t0);
    expect(wait).toBe(2000);
  });

  it("lanza RangeError si capacity <= 0", () => {
    expect(() => new TokenBucket({ capacity: 0, refillRate: 1 })).toThrow(RangeError);
  });
});

// ── InMemoryStore ──────────────────────────────────────────────────────────────

describe("InMemoryStore", () => {
  let store: InMemoryStore;

  beforeEach(() => {
    store = makeStore(3, 1);
  });

  afterEach(() => {
    store.destroy();
  });

  it("consume exitoso hasta agotar tokens", async () => {
    const key = makeKey();
    const r1 = await store.consume(key, 1);
    const r2 = await store.consume(key, 1);
    const r3 = await store.consume(key, 1);
    const r4 = await store.consume(key, 1);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
  });

  it("aislamiento multi-tenant: tenantA no afecta tenantB", async () => {
    const keyA = makeKey({ tenantId: "tenant-a" });
    const keyB = makeKey({ tenantId: "tenant-b" });

    // Vaciar tenant-a
    await store.consume(keyA, 1);
    await store.consume(keyA, 1);
    await store.consume(keyA, 1);
    const overflowA = await store.consume(keyA, 1);

    // tenant-b no debería verse afectado
    const r = await store.consume(keyB, 1);

    expect(overflowA.allowed).toBe(false);
    expect(r.allowed).toBe(true);
  });

  it("aislamiento multi-scope: api:payments no afecta api:login", async () => {
    const keyPayments = makeKey({ scope: "api:payments" });
    const keyLogin = makeKey({ scope: "api:login" });

    // Vaciar payments
    await store.consume(keyPayments, 1);
    await store.consume(keyPayments, 1);
    await store.consume(keyPayments, 1);
    const overflow = await store.consume(keyPayments, 1);

    // login no debería verse afectado
    const r = await store.consume(keyLogin, 1);

    expect(overflow.allowed).toBe(false);
    expect(r.allowed).toBe(true);
  });

  it("expira keys inactivas tras TTL", async () => {
    const shortTtlStore = new InMemoryStore({ capacity: 5, refillRate: 1, ttlMs: 50 });
    const key = makeKey();

    await shortTtlStore.consume(key, 1);
    expect(shortTtlStore.size).toBe(1);

    // Simular limpieza manual con nowMs en el futuro
    shortTtlStore._cleanup(Date.now() + 200);
    expect(shortTtlStore.size).toBe(0);

    shortTtlStore.destroy();
  });

  it("resultado allowed=true contiene remaining y resetAt", async () => {
    const key = makeKey();
    const result = await store.consume(key, 1);

    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(typeof result.remaining).toBe("number");
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
    }
  });

  it("resultado allowed=false contiene retryAfterMs > 0", async () => {
    const tinyStore = new InMemoryStore({ capacity: 1, refillRate: 0.5 }); // 1 token/2s
    const key = makeKey();

    await tinyStore.consume(key, 1); // vaciar
    const r = await tinyStore.consume(key, 1);

    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }

    tinyStore.destroy();
  });
});

// ── rateLimit factory ──────────────────────────────────────────────────────────

describe("rateLimit factory", () => {
  it("limita a capacity requests por scope", async () => {
    const store = makeStore(2, 10);
    const limiter = rateLimit({ scope: "api:search", capacity: 2, refillRate: 10, store });

    const r1 = await limiter({ tenantId: "t1", id: "ip-1" });
    const r2 = await limiter({ tenantId: "t1", id: "ip-1" });
    const r3 = await limiter({ tenantId: "t1", id: "ip-1" });

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);

    store.destroy();
  });
});

// ── UpstashStore ───────────────────────────────────────────────────────────────

describe("UpstashStore", () => {
  it("lanza error descriptivo cuando env vars no están configuradas", async () => {
    const upstash = new UpstashStore();
    const key = makeKey();
    await expect(upstash.consume(key, 1)).rejects.toThrow(
      /UPSTASH_REDIS_REST_URL \/ UPSTASH_REDIS_REST_TOKEN not configured/,
    );
  });
});

// ── Middleware enforceRateLimit ────────────────────────────────────────────────

describe("enforceRateLimit middleware", () => {
  beforeEach(() => {
    _clearStoreCache();
  });

  function makeReq(ip = "1.2.3.4"): Request {
    return new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": ip },
    });
  }

  it("retorna null cuando la request está dentro del límite", async () => {
    const store = makeStore(10, 5);
    const req = makeReq();

    const result = await enforceRateLimit(req as never, {
      tenantId: "t1",
      scope: "api:test-mw-ok",
      capacity: 10,
      refillRate: 5,
      store,
    });

    expect(result).toBeNull();
    store.destroy();
  });

  it("retorna NextResponse 429 con header Retry-After al exceder límite", async () => {
    const store = makeStore(1, 0.5);
    const { NextResponse } = await import("next/server");

    // Primera request: OK
    await enforceRateLimit(makeReq() as never, {
      tenantId: "t1",
      scope: "api:test-mw-429",
      capacity: 1,
      refillRate: 0.5,
      store,
    });

    // Segunda request: 429
    const result = await enforceRateLimit(makeReq() as never, {
      tenantId: "t1",
      scope: "api:test-mw-429",
      capacity: 1,
      refillRate: 0.5,
      store,
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    expect(result?.headers.get("Retry-After")).toBeTruthy();

    const retryAfterSec = Number(result?.headers.get("Retry-After"));
    expect(retryAfterSec).toBeGreaterThan(0);

    store.destroy();
  });
});
