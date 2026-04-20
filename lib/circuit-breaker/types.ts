/**
 * Circuit Breaker — tipos base
 *
 * Estados:
 *   closed    → operacion normal, failures se cuentan
 *   open      → falla rapido sin ejecutar fn, espera resetTimeoutMs
 *   half-open → prueba con halfOpenMaxCalls; exito → closed, fallo → open
 */

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerConfig {
  /** Identificador unico del breaker (ej. "whatsapp", "sunat") */
  name: string;
  /** Cuantas fallas consecutivas antes de abrir el circuito */
  failureThreshold: number;
  /** Millisegundos de espera antes de intentar HALF_OPEN desde OPEN */
  resetTimeoutMs: number;
  /** Cuantas llamadas de prueba exitosas se necesitan para volver a CLOSED */
  halfOpenMaxCalls: number;
  /** Timeout por llamada individual en ms (opcional) */
  timeoutMs?: number;
}

/** Snapshot de observabilidad — retornado por getStatus() */
export interface BreakerSnapshot {
  name: string;
  state: BreakerState;
  failures: number;
  lastFailureAt: number;
  halfOpenAttempts: number;
  halfOpenSuccesses: number;
}

/** Callback de cambio de estado para observabilidad */
export type StateChangeCallback = (from: BreakerState, to: BreakerState) => void;
