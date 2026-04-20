/**
 * Tests del CircuitBreaker
 *
 * Cubre:
 *  - CLOSED → OPEN tras N failures consecutivos
 *  - OPEN rechaza sin ejecutar la fn
 *  - OPEN → HALF_OPEN tras resetTimeoutMs (fake timers)
 *  - HALF_OPEN con exitos suficientes → CLOSED
 *  - HALF_OPEN con fallo → OPEN otra vez
 *  - Exito en CLOSED resetea contador de failures
 *  - onStateChange callback dispara con estados correctos
 *  - timeoutMs aborta llamadas lentas (CircuitTimeoutError)
 *  - halfOpenMaxCalls: permite exactamente N llamadas de prueba
 *  - reset() manual vuelve a CLOSED
 *  - CircuitOpenError tiene el nombre del breaker
 *  - CircuitTimeoutError contiene timeoutMs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker, CircuitOpenError, CircuitTimeoutError } from "@/lib/circuit-breaker/breaker";
import type { BreakerConfig, BreakerState } from "@/lib/circuit-breaker/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBreaker(overrides: Partial<BreakerConfig> = {}): CircuitBreaker {
  return new CircuitBreaker({
    name: "test-breaker",
    failureThreshold: 3,
    resetTimeoutMs: 5_000,
    halfOpenMaxCalls: 2,
    ...overrides,
  });
}

const succeed = () => Promise.resolve("ok");
const fail = () => Promise.reject(new Error("service down"));
const slowFn = (ms: number) =>
  new Promise<string>((resolve) => setTimeout(() => resolve("late"), ms));

// ── CLOSED → OPEN ─────────────────────────────────────────────────────────────

describe("CLOSED → OPEN tras N failures consecutivos", () => {
  it("abre despues de failureThreshold fallos consecutivos", async () => {
    const cb = makeBreaker({ failureThreshold: 3 });

    // 2 fallos no abren
    await expect(cb.exec(fail)).rejects.toThrow("service down");
    await expect(cb.exec(fail)).rejects.toThrow("service down");
    expect(cb.getStatus().state).toBe("closed");

    // 3er fallo abre
    await expect(cb.exec(fail)).rejects.toThrow("service down");
    expect(cb.getStatus().state).toBe("open");
  });

  it("un exito intermedio resetea el contador de failures", async () => {
    const cb = makeBreaker({ failureThreshold: 3 });

    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(succeed)).resolves.toBe("ok"); // resetea contador
    expect(cb.getStatus().failures).toBe(0);

    // Necesita otros 3 fallos para abrir
    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getStatus().state).toBe("closed");
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getStatus().state).toBe("open");
  });
});

// ── OPEN rechaza sin ejecutar fn ─────────────────────────────────────────────

describe("OPEN: falla rapido sin ejecutar la fn", () => {
  it("lanza CircuitOpenError inmediatamente cuando esta abierto", async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    await expect(cb.exec(fail)).rejects.toThrow("service down");
    expect(cb.getStatus().state).toBe("open");

    const spy = vi.fn().mockResolvedValue("no deberia ejecutar");
    await expect(cb.exec(spy)).rejects.toThrow(CircuitOpenError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("CircuitOpenError contiene el nombre del breaker", async () => {
    const cb = makeBreaker({ name: "mi-servicio", failureThreshold: 1 });
    await expect(cb.exec(fail)).rejects.toThrow();

    try {
      await cb.exec(succeed);
      expect.fail("deberia haber lanzado");
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError);
      expect((err as CircuitOpenError).breaker).toBe("mi-servicio");
    }
  });
});

// ── OPEN → HALF_OPEN tras resetTimeoutMs ─────────────────────────────────────

describe("OPEN → HALF_OPEN tras resetTimeoutMs (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transiciona a half-open despues del tiempo de reset", async () => {
    const cb = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 5_000 });
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getStatus().state).toBe("open");

    // Antes del reset: sigue open
    vi.advanceTimersByTime(4_999);
    await expect(cb.exec(succeed)).rejects.toThrow(CircuitOpenError);

    // Despues del reset: half-open, permite una llamada
    vi.advanceTimersByTime(2);
    await expect(cb.exec(succeed)).resolves.toBe("ok");
    // Con halfOpenMaxCalls: 2 y 1 exito, necesita un segundo exito → sigue half-open...
    // pero en este test solo verificamos que la llamada pasa (no lanza CircuitOpenError)
    expect(cb.getStatus().state).not.toBe("open");
  });
});

// ── HALF_OPEN → CLOSED ───────────────────────────────────────────────────────

describe("HALF_OPEN: suficientes exitos → CLOSED", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("cierra tras halfOpenMaxCalls exitos consecutivos", async () => {
    const cb = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 1_000, halfOpenMaxCalls: 2 });

    await expect(cb.exec(fail)).rejects.toThrow();
    vi.advanceTimersByTime(1_001);

    // Primera llamada de prueba (exito)
    await expect(cb.exec(succeed)).resolves.toBe("ok");
    expect(cb.getStatus().state).toBe("half-open");

    // Segunda llamada de prueba (exito) → cierra
    await expect(cb.exec(succeed)).resolves.toBe("ok");
    expect(cb.getStatus().state).toBe("closed");
  });
});

// ── HALF_OPEN → OPEN (fallo) ─────────────────────────────────────────────────

describe("HALF_OPEN: fallo → OPEN otra vez", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("vuelve a OPEN si falla en half-open", async () => {
    const cb = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 1_000, halfOpenMaxCalls: 3 });

    await expect(cb.exec(fail)).rejects.toThrow();
    vi.advanceTimersByTime(1_001);

    // Prueba fallida en half-open
    await expect(cb.exec(fail)).rejects.toThrow("service down");
    expect(cb.getStatus().state).toBe("open");
  });
});

// ── onStateChange callback ───────────────────────────────────────────────────

describe("onStateChange callback", () => {
  it("dispara CLOSED → OPEN al alcanzar threshold", async () => {
    const cb = makeBreaker({ failureThreshold: 2 });
    const changes: Array<[BreakerState, BreakerState]> = [];
    cb.setOnStateChange((from, to) => changes.push([from, to]));

    await expect(cb.exec(fail)).rejects.toThrow();
    await expect(cb.exec(fail)).rejects.toThrow();

    expect(changes).toContainEqual(["closed", "open"]);
  });

  it("dispara OPEN → HALF_OPEN y HALF_OPEN → CLOSED", async () => {
    vi.useFakeTimers();
    const cb = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 1_000, halfOpenMaxCalls: 1 });
    const states: Array<[BreakerState, BreakerState]> = [];
    cb.setOnStateChange((from, to) => states.push([from, to]));

    await expect(cb.exec(fail)).rejects.toThrow();
    vi.advanceTimersByTime(1_001);
    await expect(cb.exec(succeed)).resolves.toBe("ok");

    expect(states).toContainEqual(["closed", "open"]);
    expect(states).toContainEqual(["open", "half-open"]);
    expect(states).toContainEqual(["half-open", "closed"]);
    vi.useRealTimers();
  });

  it("no lanza si el callback tira un error", async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    cb.setOnStateChange(() => {
      throw new Error("callback roto");
    });

    // El error en callback no debe romper el flujo
    await expect(cb.exec(fail)).rejects.toThrow("service down");
    // El breaker funciona igual
    expect(cb.getStatus().state).toBe("open");
  });
});

// ── timeoutMs ────────────────────────────────────────────────────────────────

describe("timeoutMs: aborta llamadas lentas", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lanza CircuitTimeoutError si la fn supera timeoutMs", async () => {
    const cb = makeBreaker({ failureThreshold: 5, timeoutMs: 500 });

    const slowCall = () => {
      const p = slowFn(2_000);
      vi.advanceTimersByTime(501);
      return p;
    };

    await expect(cb.exec(slowCall)).rejects.toThrow(CircuitTimeoutError);
  });

  it("CircuitTimeoutError contiene el timeoutMs configurado", async () => {
    const cb = makeBreaker({ failureThreshold: 5, timeoutMs: 300 });

    const slowCall = () => {
      const p = slowFn(1_000);
      vi.advanceTimersByTime(301);
      return p;
    };

    try {
      await cb.exec(slowCall);
      expect.fail("deberia haber lanzado");
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitTimeoutError);
      expect((err as CircuitTimeoutError).timeoutMs).toBe(300);
    }
  });

  it("llamada rapida sin timeout pasa normalmente", async () => {
    const cb = makeBreaker({ failureThreshold: 5, timeoutMs: 1_000 });
    // Resuelve sincrono — sin avanzar timers
    await expect(cb.exec(succeed)).resolves.toBe("ok");
  });
});

// ── reset() manual ───────────────────────────────────────────────────────────

describe("reset() manual", () => {
  it("vuelve a CLOSED desde OPEN", async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    await expect(cb.exec(fail)).rejects.toThrow();
    expect(cb.getStatus().state).toBe("open");

    cb.reset();
    expect(cb.getStatus().state).toBe("closed");
    expect(cb.getStatus().failures).toBe(0);
  });

  it("dispara onStateChange al hacer reset desde OPEN", async () => {
    const cb = makeBreaker({ failureThreshold: 1 });
    const changes: Array<[BreakerState, BreakerState]> = [];
    cb.setOnStateChange((from, to) => changes.push([from, to]));

    await expect(cb.exec(fail)).rejects.toThrow();
    cb.reset();

    expect(changes).toContainEqual(["open", "closed"]);
  });
});
