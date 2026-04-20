/**
 * lib/rate-limit/token-bucket.ts
 *
 * Algoritmo Token Bucket puro (sin I/O).
 * Fácil de serializar/deserializar para stores externos.
 *
 * Analogía Feynman:
 *   Piensa en un balde que se llena de monedas a velocidad constante.
 *   Cada request "gasta" monedas. Si no quedan, el request espera.
 */

export interface TokenBucketConfig {
  /** Capacidad máxima del bucket (tokens). */
  capacity: number;
  /** Tokens que se recargan por segundo. */
  refillRate: number;
  /**
   * Intervalo de recarga en milisegundos.
   * La recarga es continua (no discreta): se calcula por tiempo transcurrido.
   * Este valor controla la precisión mínima del cálculo.
   * Default: 1000 ms.
   */
  refillIntervalMs?: number;
}

export interface TokenBucketState {
  tokens: number;
  lastRefillAt: number; // timestamp ms
}

export class TokenBucket {
  readonly capacity: number;
  readonly refillRate: number;
  readonly refillIntervalMs: number;

  constructor(config: TokenBucketConfig) {
    if (config.capacity <= 0) throw new RangeError("capacity must be > 0");
    if (config.refillRate <= 0) throw new RangeError("refillRate must be > 0");
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.refillIntervalMs = config.refillIntervalMs ?? 1000;
  }

  /** Crea el estado inicial con el bucket lleno. */
  initialState(nowMs = Date.now()): TokenBucketState {
    return { tokens: this.capacity, lastRefillAt: nowMs };
  }

  /**
   * Recarga tokens por tiempo transcurrido y luego intenta consumir `cost`.
   * Retorna el estado actualizado y si el consume fue exitoso.
   *
   * INMUTABLE: nunca muta el estado de entrada.
   */
  consume(
    state: TokenBucketState,
    cost: number,
    nowMs = Date.now(),
  ): { state: TokenBucketState; allowed: boolean } {
    if (cost <= 0) throw new RangeError("cost must be > 0");

    const elapsedMs = Math.max(0, nowMs - state.lastRefillAt);
    const refilled = (elapsedMs / 1000) * this.refillRate;
    const tokensAfterRefill = Math.min(this.capacity, state.tokens + refilled);

    if (tokensAfterRefill < cost) {
      // No hay suficientes tokens — no consumir, actualizar timestamp igual
      return {
        state: { tokens: tokensAfterRefill, lastRefillAt: nowMs },
        allowed: false,
      };
    }

    return {
      state: { tokens: tokensAfterRefill - cost, lastRefillAt: nowMs },
      allowed: true,
    };
  }

  /**
   * Cuántos ms faltan para que el bucket tenga `cost` tokens.
   * Útil para calcular Retry-After.
   */
  msUntilAvailable(state: TokenBucketState, cost: number, nowMs = Date.now()): number {
    const elapsedMs = Math.max(0, nowMs - state.lastRefillAt);
    const current = Math.min(this.capacity, state.tokens + (elapsedMs / 1000) * this.refillRate);
    if (current >= cost) return 0;
    const deficit = cost - current;
    return Math.ceil((deficit / this.refillRate) * 1000);
  }

  /**
   * Timestamp ms en que el bucket estará completamente lleno.
   */
  resetAt(state: TokenBucketState, nowMs = Date.now()): number {
    const elapsedMs = Math.max(0, nowMs - state.lastRefillAt);
    const current = Math.min(this.capacity, state.tokens + (elapsedMs / 1000) * this.refillRate);
    const deficit = this.capacity - current;
    if (deficit <= 0) return nowMs;
    return nowMs + Math.ceil((deficit / this.refillRate) * 1000);
  }
}
