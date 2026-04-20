/**
 * Feature Flags v2 — Types
 *
 * Sistema avanzado ADITIVO sobre lib/flags/ existente.
 * NO reemplaza PostHog ni tenant-flags — agrega %-rollout,
 * targeting, A/B con variantes y kill switch deterministico.
 */

/**
 * Contexto de evaluacion. tenantId es obligatorio; el resto opcional.
 * Se pasa en cada llamada a isEnabled / getVariant.
 */
export interface FlagContext {
  /** Identificador del tenant. Siempre requerido para aislamiento. */
  tenantId: string
  /** ID de usuario autenticado (opcional — mejora estabilidad de hash). */
  userId?: string
  /** Rol del usuario, p.ej. "admin" | "cajero" | "cliente". */
  userRole?: string
  /** Atributos adicionales para reglas de targeting personalizadas. */
  customAttributes?: Record<string, string>
}

/**
 * Regla de feature flag con soporte para:
 *  - kill switch global (`enabled: false`)
 *  - %-rollout deterministico (`rolloutPct`)
 *  - whitelist de tenants (`targetTenants`)
 *  - whitelist de roles (`targetRoles`)
 *  - A/B testing con pesos (`variants`)
 */
export interface FlagRule {
  /** Nombre unico de la flag. */
  name: string
  /**
   * Kill switch. Si es `false`, la flag siempre esta DESACTIVADA
   * independientemente de rolloutPct, targeting o variantes.
   */
  enabled: boolean
  /**
   * Porcentaje de rollout: 0–100.
   * 100 = todos los tenants/usuarios activos.
   * 0   = ninguno (equivale a kill switch).
   * Hash deterministico — el mismo contexto siempre da el mismo resultado.
   */
  rolloutPct?: number
  /**
   * Lista de tenantIds que reciben la flag forzosamente activa
   * (ignorando rolloutPct). Si no se define, aplica a todos los tenants.
   */
  targetTenants?: string[]
  /**
   * Lista de roles que reciben la flag forzosamente activa.
   * Si se combina con targetTenants, ambas condiciones deben cumplirse.
   */
  targetRoles?: string[]
  /**
   * Pesos para A/B testing. Clave = nombre del variante, valor = peso relativo.
   * Ejemplo: `{ control: 50, treatment: 50 }` o `{ a: 33, b: 33, c: 34 }`.
   * Solo se evalua cuando la flag esta activa.
   */
  variants?: Record<string, number>
}

/** Resultado de evaluacion de una flag. */
export interface EvaluationResult {
  /** Si la flag esta activa para este contexto. */
  active: boolean
  /** Nombre del variante asignado (solo si `variants` esta definido y `active` es true). */
  variant?: string
}
