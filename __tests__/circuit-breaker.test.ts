/**
 * __tests__/circuit-breaker.test.ts
 *
 * Unit tests for lib/circuit-breaker.ts
 * Covers: closed → open → half-open → closed transitions, CircuitOpenError,
 * getCircuitStatus, resetCircuit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withCircuitBreaker,
  CircuitOpenError,
  getCircuitStatus,
  resetCircuit,
} from "@/lib/circuit-breaker";

const SVC = "test-service";

beforeEach(() => {
  resetCircuit(SVC);
  vi.useFakeTimers();
});

afterEach(() => {
  resetCircuit(SVC);
  vi.useRealTimers();
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe("withCircuitBreaker — closed state (happy path)", () => {
  it("passes the return value through on success", async () => {
    const result = await withCircuitBreaker(SVC, async () => 42);
    expect(result).toBe(42);
  });

  it("does NOT throw on a single failure (below threshold)", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("transient")).mockResolvedValue("ok");
    await expect(withCircuitBreaker(SVC, fn)).rejects.toThrow("transient");
    // Circuit still closed after 1 failure (default threshold = 5)
    expect(getCircuitStatus(SVC).state).toBe("closed");
    expect(getCircuitStatus(SVC).failures).toBe(1);
  });

  it("opens after reaching the failure threshold", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("db down"));
    for (let i = 0; i < 5; i++) {
      await expect(withCircuitBreaker(SVC, fn, { threshold: 5 })).rejects.toThrow();
    }
    expect(getCircuitStatus(SVC).state).toBe("open");
  });
});

// ── Open state ────────────────────────────────────────────────────────────────

describe("withCircuitBreaker — open state (fail fast)", () => {
  async function openCircuit() {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    for (let i = 0; i < 5; i++) {
      await expect(withCircuitBreaker(SVC, fn, { threshold: 5 })).rejects.toThrow();
    }
  }

  it("throws CircuitOpenError immediately when open", async () => {
    await openCircuit();
    const fn = vi.fn().mockResolvedValue("never");
    await expect(withCircuitBreaker(SVC, fn)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("CircuitOpenError contains the service name", async () => {
    await openCircuit();
    try {
      await withCircuitBreaker(SVC, async () => {});
    } catch (e) {
      expect((e as CircuitOpenError).service).toBe(SVC);
    }
  });
});

// ── Half-open state (recovery) ────────────────────────────────────────────────

describe("withCircuitBreaker — half-open state (recovery)", () => {
  const TIMEOUT = 1_000;

  async function openCircuit() {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    for (let i = 0; i < 5; i++) {
      await expect(withCircuitBreaker(SVC, fn, { threshold: 5, timeoutMs: TIMEOUT })).rejects.toThrow();
    }
  }

  it("transitions to half-open after timeoutMs elapses", async () => {
    await openCircuit();
    vi.advanceTimersByTime(TIMEOUT + 1);
    // Trigger the state transition by attempting a call
    const fn = vi.fn().mockResolvedValue("probe");
    await withCircuitBreaker(SVC, fn, { timeoutMs: TIMEOUT });
    expect(getCircuitStatus(SVC).state).toBe("closed");
  });

  it("re-opens on probe failure in half-open", async () => {
    await openCircuit();
    vi.advanceTimersByTime(TIMEOUT + 1);
    const fn = vi.fn().mockRejectedValue(new Error("still down"));
    await expect(withCircuitBreaker(SVC, fn, { timeoutMs: TIMEOUT })).rejects.toThrow();
    expect(getCircuitStatus(SVC).state).toBe("open");
  });
});

// ── getCircuitStatus ──────────────────────────────────────────────────────────

describe("getCircuitStatus", () => {
  it("returns 'closed' with 0 failures for a fresh service", () => {
    const status = getCircuitStatus("fresh-svc");
    expect(status.state).toBe("closed");
    expect(status.failures).toBe(0);
  });

  it("increments failures count after each error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("err"));
    await expect(withCircuitBreaker(SVC, fn)).rejects.toThrow();
    await expect(withCircuitBreaker(SVC, fn)).rejects.toThrow();
    expect(getCircuitStatus(SVC).failures).toBe(2);
  });
});

// ── resetCircuit ──────────────────────────────────────────────────────────────

describe("resetCircuit", () => {
  it("resets failure count to 0", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("err"));
    await expect(withCircuitBreaker(SVC, fn)).rejects.toThrow();
    resetCircuit(SVC);
    expect(getCircuitStatus(SVC).failures).toBe(0);
    expect(getCircuitStatus(SVC).state).toBe("closed");
  });

  it("resetting an unknown service does not throw", () => {
    expect(() => resetCircuit("unknown-svc")).not.toThrow();
  });
});
