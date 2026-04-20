import { logger } from "@/lib/logger";
import type {
  BreakerConfig,
  BreakerSnapshot,
  BreakerState,
  StateChangeCallback,
} from "./types";

/** Lanzado cuando el circuito esta abierto — la llamada no se ejecuta */
export class CircuitOpenError extends Error {
  readonly name = "CircuitOpenError";
  readonly breaker: string;

  constructor(breakerName: string) {
    super(`Circuit breaker OPEN: "${breakerName}" — failing fast`);
    this.breaker = breakerName;
  }
}

/** Lanzado cuando la llamada supera el timeoutMs configurado */
export class CircuitTimeoutError extends Error {
  readonly name = "CircuitTimeoutError";
  readonly breaker: string;
  readonly timeoutMs: number;

  constructor(breakerName: string, timeoutMs: number) {
    super(`Circuit breaker timeout: "${breakerName}" exceeded ${timeoutMs}ms`);
    this.breaker = breakerName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * CircuitBreaker — patron de resiliencia para llamadas a APIs externas.
 *
 * Maquina de estados:
 *   CLOSED  →(N fallos)→ OPEN
 *   OPEN    →(resetTimeoutMs)→ HALF_OPEN
 *   HALF_OPEN →(halfOpenMaxCalls exitos)→ CLOSED
 *   HALF_OPEN →(1 fallo)→ OPEN
 */
export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private lastFailureAt = 0;
  private halfOpenAttempts = 0;
  private halfOpenSuccesses = 0;
  private onStateChange: StateChangeCallback | null = null;

  constructor(private readonly config: BreakerConfig) {}

  /** Registrar callback de observabilidad para cambios de estado */
  setOnStateChange(cb: StateChangeCallback): void {
    this.onStateChange = cb;
  }

  /** Ejecutar fn protegida por el circuit breaker */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === "open") {
      throw new CircuitOpenError(this.config.name);
    }

    if (this.state === "half-open") {
      // En half-open solo permitimos hasta halfOpenMaxCalls intentos en paralelo
      if (this.halfOpenAttempts >= this.config.halfOpenMaxCalls) {
        throw new CircuitOpenError(this.config.name);
      }
      this.halfOpenAttempts++;
    }

    try {
      const result = await this.runWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  /** Snapshot actual del breaker para health checks */
  getStatus(): BreakerSnapshot {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
      halfOpenAttempts: this.halfOpenAttempts,
      halfOpenSuccesses: this.halfOpenSuccesses,
    };
  }

  /** Reset manual (util para tests y admin tooling) */
  reset(): void {
    const prev = this.state;
    this.state = "closed";
    this.failures = 0;
    this.lastFailureAt = 0;
    this.halfOpenAttempts = 0;
    this.halfOpenSuccesses = 0;
    if (prev !== "closed") {
      this.emitStateChange(prev, "closed");
    }
  }

  // ── Privados ────────────────────────────────────────────────────────────────

  private maybeTransitionToHalfOpen(): void {
    if (
      this.state === "open" &&
      Date.now() - this.lastFailureAt >= this.config.resetTimeoutMs
    ) {
      this.transition("open", "half-open");
      this.halfOpenAttempts = 0;
      this.halfOpenSuccesses = 0;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.halfOpenMaxCalls) {
        this.failures = 0;
        this.halfOpenAttempts = 0;
        this.halfOpenSuccesses = 0;
        this.transition("half-open", "closed");
      }
    } else {
      // CLOSED: resetear contador de failures en cada exito
      this.failures = 0;
    }
  }

  private onFailure(err: unknown): void {
    this.lastFailureAt = Date.now();

    if (this.state === "half-open") {
      // Cualquier falla en half-open vuelve a abrir inmediatamente
      this.halfOpenAttempts = 0;
      this.halfOpenSuccesses = 0;
      this.failures++;
      this.transition("half-open", "open");
      logger.error("[CircuitBreaker] HALF_OPEN → OPEN tras fallo", {
        breaker: this.config.name,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // CLOSED: acumular failures
    this.failures++;
    if (this.failures >= this.config.failureThreshold) {
      this.transition("closed", "open");
      logger.error("[CircuitBreaker] CLOSED → OPEN", {
        breaker: this.config.name,
        failures: this.failures,
        threshold: this.config.failureThreshold,
      });
    }
  }

  private async runWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    const { timeoutMs } = this.config;
    if (!timeoutMs) return fn();

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CircuitTimeoutError(this.config.name, timeoutMs));
      }, timeoutMs);

      fn()
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private transition(from: BreakerState, to: BreakerState): void {
    this.state = to;
    this.emitStateChange(from, to);
  }

  private emitStateChange(from: BreakerState, to: BreakerState): void {
    if (this.onStateChange) {
      try {
        this.onStateChange(from, to);
      } catch {
        // callback nunca rompe el breaker
      }
    }
  }
}
