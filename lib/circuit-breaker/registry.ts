import { CircuitBreaker } from "./breaker";
import type { BreakerConfig, BreakerSnapshot } from "./types";

/**
 * Defaults sensatos para APIs externas tipicas:
 *  - 5 fallos antes de abrir
 *  - 30s antes de intentar HALF_OPEN
 *  - 2 llamadas exitosas de prueba para cerrar
 *  - 10s de timeout por llamada
 */
const REGISTRY_DEFAULTS: Omit<BreakerConfig, "name"> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxCalls: 2,
  timeoutMs: 10_000,
};

// Singleton map — sobrevive entre requests en el mismo proceso Node.js
const breakerMap = new Map<string, CircuitBreaker>();

/**
 * Obtener (o crear) un CircuitBreaker por nombre.
 *
 * Lazy init — si ya existe con ese nombre, retorna la instancia existente.
 * Si no existe y no se pasa config, usa REGISTRY_DEFAULTS.
 *
 * @param name - Identificador unico (ej. "whatsapp", "sunat", "mercadopago")
 * @param config - Config parcial que sobreescribe defaults (solo en la primera creacion)
 */
export function getBreaker(name: string, config?: Partial<Omit<BreakerConfig, "name">>): CircuitBreaker {
  if (!breakerMap.has(name)) {
    const merged: BreakerConfig = {
      ...REGISTRY_DEFAULTS,
      ...config,
      name,
    };
    breakerMap.set(name, new CircuitBreaker(merged));
  }
  return breakerMap.get(name)!;
}

/**
 * Snapshot de todos los breakers activos — util para health endpoints.
 */
export function getAllBreakerStatuses(): BreakerSnapshot[] {
  return Array.from(breakerMap.values()).map((b) => b.getStatus());
}

/**
 * Reset manual de un breaker especifico (util en tests y admin tooling).
 */
export function resetBreaker(name: string): void {
  breakerMap.get(name)?.reset();
}

/**
 * Eliminar completamente un breaker del registry (solo tests).
 */
export function deleteBreaker(name: string): void {
  breakerMap.delete(name);
}
