/**
 * In-memory circuit breaker for external/DB service calls.
 *
 * States:
 *  closed    → normal operation, failures are counted
 *  open      → failing fast (no calls pass through), resets after timeoutMs
 *  half-open → one probe call is allowed; success → closed, failure → open
 *
 * Usage:
 *   const data = await withCircuitBreaker("prisma", () => prisma.product.findMany());
 */

type CBState = "closed" | "open" | "half-open";

interface BreakerRecord {
  state: CBState;
  failures: number;
  lastFailureAt: number;
  halfOpenAttempts: number;
}

const DEFAULT_THRESHOLD = 5;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HALF_OPEN_MAX = 1;

// Module-level singleton map — survives across requests in the same process
const registry = new Map<string, BreakerRecord>();

function getRecord(service: string): BreakerRecord {
  if (!registry.has(service)) {
    registry.set(service, {
      state: "closed",
      failures: 0,
      lastFailureAt: 0,
      halfOpenAttempts: 0,
    });
  }
  return registry.get(service)!;
}

export class CircuitOpenError extends Error {
  readonly service: string;
  constructor(service: string) {
    super(`Circuit breaker is OPEN for service "${service}" — failing fast`);
    this.name = "CircuitOpenError";
    this.service = service;
  }
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before the circuit opens. Default: 5 */
  threshold?: number;
  /** Milliseconds to wait before moving from open → half-open. Default: 30 000 */
  timeoutMs?: number;
}

/**
 * Runs `fn` through the circuit breaker identified by `service`.
 * Throws CircuitOpenError immediately when the circuit is open.
 */
export async function withCircuitBreaker<T>(
  service: string,
  fn: () => Promise<T>,
  options?: CircuitBreakerOptions,
): Promise<T> {
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const rec = getRecord(service);

  // Transition open → half-open if the recovery window has elapsed
  if (rec.state === "open") {
    if (Date.now() - rec.lastFailureAt >= timeoutMs) {
      rec.state = "half-open";
      rec.halfOpenAttempts = 0;
    } else {
      throw new CircuitOpenError(service);
    }
  }

  // In half-open, only one concurrent probe is allowed
  if (rec.state === "half-open") {
    if (rec.halfOpenAttempts >= DEFAULT_HALF_OPEN_MAX) {
      throw new CircuitOpenError(service);
    }
    rec.halfOpenAttempts++;
  }

  try {
    const result = await fn();

    // SUCCESS — reset the breaker
    rec.state = "closed";
    rec.failures = 0;
    rec.halfOpenAttempts = 0;
    return result;
  } catch (err) {
    // FAILURE — count and potentially open
    rec.failures++;
    rec.lastFailureAt = Date.now();

    if (rec.state === "half-open" || rec.failures >= threshold) {
      rec.state = "open";
      console.error(
        `[CircuitBreaker] Service "${service}" circuit OPENED after ${rec.failures} failure(s)`,
      );
    }

    throw err;
  }
}

/** Returns a snapshot of the current state for observability / health checks. */
export function getCircuitStatus(
  service: string,
): Pick<BreakerRecord, "state" | "failures" | "lastFailureAt"> {
  const rec = getRecord(service);
  return { state: rec.state, failures: rec.failures, lastFailureAt: rec.lastFailureAt };
}

/** Manually reset a breaker (useful in tests and admin tooling). */
export function resetCircuit(service: string): void {
  registry.delete(service);
}
