/**
 * __tests__/cache.test.ts
 *
 * Unit tests for lib/cache.ts — getOrSet, invalidate, TTL, key isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Manually advance time for TTL tests. */
function advanceTime(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("lib/cache — MemoryStore via getOrSet/invalidate", () => {
  // Re-import cache inside each test so each test gets a fresh module instance
  // (avoids state leaking across tests through the global singleton).
  let getOrSet: typeof import("@/lib/cache").getOrSet;
  let invalidate: typeof import("@/lib/cache").invalidate;
  let cacheStore: typeof import("@/lib/cache").cacheStore;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    // Reset the global singleton so each test starts cold
    (global as Record<string, unknown>).__bsmCache = undefined;
    ({ getOrSet, invalidate, cacheStore } = await import("@/lib/cache"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── getOrSet ────────────────────────────────────────────────────────────────

  it("calls factory on cache miss and returns the value", async () => {
    const factory = vi.fn().mockResolvedValue(42);
    const result = await getOrSet("key1", 60, factory);
    expect(result).toBe(42);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on second call without calling factory again", async () => {
    const factory = vi.fn().mockResolvedValue("hello");
    await getOrSet("key2", 60, factory);
    const result = await getOrSet("key2", 60, factory);
    expect(result).toBe("hello");
    expect(factory).toHaveBeenCalledTimes(1); // only once
  });

  it("caches objects by reference equality", async () => {
    const obj = { a: 1, b: [2, 3] };
    const factory = vi.fn().mockResolvedValue(obj);
    await getOrSet("key3", 60, factory);
    const cached = await getOrSet("key3", 60, factory);
    expect(cached).toBe(obj); // same reference
  });

  // ── TTL expiry ──────────────────────────────────────────────────────────────

  it("returns null (calls factory again) after TTL elapses", async () => {
    const factory = vi.fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    await getOrSet("ttl-key", 10, factory); // TTL = 10 seconds
    advanceTime(10_001);                     // advance past TTL

    const result = await getOrSet("ttl-key", 10, factory);
    expect(result).toBe("second");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("still returns cached value before TTL elapses", async () => {
    const factory = vi.fn().mockResolvedValue("fresh");
    await getOrSet("ttl-key2", 30, factory);
    advanceTime(29_000); // 29 s — still within TTL

    const result = await getOrSet("ttl-key2", 30, factory);
    expect(result).toBe("fresh");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  // ── invalidate ──────────────────────────────────────────────────────────────

  it("invalidate evicts the key so factory is called again", async () => {
    const factory = vi.fn()
      .mockResolvedValueOnce("v1")
      .mockResolvedValueOnce("v2");

    await getOrSet("inv-key", 60, factory);
    invalidate("inv-key");
    const result = await getOrSet("inv-key", 60, factory);

    expect(result).toBe("v2");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("invalidate on a non-existent key does not throw", () => {
    expect(() => invalidate("nonexistent")).not.toThrow();
  });

  // ── Key isolation ───────────────────────────────────────────────────────────

  it("different keys are isolated from each other", async () => {
    const factoryA = vi.fn().mockResolvedValue("A");
    const factoryB = vi.fn().mockResolvedValue("B");

    const a = await getOrSet("keyA", 60, factoryA);
    const b = await getOrSet("keyB", 60, factoryB);

    expect(a).toBe("A");
    expect(b).toBe("B");
    expect(factoryA).toHaveBeenCalledTimes(1);
    expect(factoryB).toHaveBeenCalledTimes(1);
  });

  it("invalidating one key does not evict another", async () => {
    const factoryA = vi.fn().mockResolvedValue("A");
    const factoryB = vi.fn().mockResolvedValue("B");

    await getOrSet("ka", 60, factoryA);
    await getOrSet("kb", 60, factoryB);
    invalidate("ka");

    await getOrSet("ka", 60, factoryA); // should re-call factory
    await getOrSet("kb", 60, factoryB); // should NOT re-call factory

    expect(factoryA).toHaveBeenCalledTimes(2);
    expect(factoryB).toHaveBeenCalledTimes(1);
  });

  // ── cacheStore direct access ────────────────────────────────────────────────

  it("cacheStore.get returns null for unknown key", () => {
    expect(cacheStore.get("missing")).toBeNull();
  });

  it("cacheStore.set + get round-trip works", () => {
    cacheStore.set("raw-key", { x: 99 }, 30);
    expect(cacheStore.get("raw-key")).toEqual({ x: 99 });
  });

  it("cacheStore.del removes the key", () => {
    cacheStore.set("del-key", true, 30);
    cacheStore.del("del-key");
    expect(cacheStore.get("del-key")).toBeNull();
  });

  it("cacheStore.get returns null for an expired entry set directly", () => {
    cacheStore.set("exp-key", "value", 5);
    advanceTime(5_001);
    expect(cacheStore.get("exp-key")).toBeNull();
  });
});
