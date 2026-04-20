/**
 * lib/rate-limit/types.ts
 *
 * Tipos centrales del sistema de rate limiting multi-tenant.
 * Discriminated union para que el caller nunca mezcle estados.
 */

/** Resultado de un intento de consumir tokens. */
export type RateLimitResult =
  | {
      allowed: true;
      /** Tokens restantes DESPUÉS de consumir. */
      remaining: number;
      /** Timestamp Unix (ms) cuando el bucket se recarga completo. */
      resetAt: number;
    }
  | {
      allowed: false;
      /** Milisegundos que el caller debe esperar antes de reintentar. */
      retryAfterMs: number;
    };

/**
 * Clave compuesta que identifica unívocamente un bucket de rate limit.
 *
 * - tenantId: aislamiento multi-tenant estricto (p.ej. "tienda-lima-01")
 * - scope:    área funcional (p.ej. "api:payments", "api:login", "api:search")
 * - id:       identidad del actor dentro del scope (IP, userId, sessionId)
 */
export interface RateLimitKey {
  tenantId: string;
  scope: string;
  id: string;
}
