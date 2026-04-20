/**
 * Feature Flags v2 — API publica (pure functions, sin React imports)
 *
 * Punto de entrada principal para consumidores del sistema v2.
 *
 * Uso:
 *   import { isEnabled, getVariant } from '@/lib/flags/v2/hooks'
 *
 *   const activo = await isEnabled('checkout_v3', { tenantId: 'tienda-lima' })
 *   const variante = await getVariant('precio_ab', { tenantId: 'tienda-lima', userId: 'u123' })
 */

import type { FlagContext, EvaluationResult } from './types'
import type { FlagStore } from './store'
import { InMemoryFlagStore } from './store'
import { evaluate } from './evaluator'

// ── Store singleton ───────────────────────────────────────────────────────────

/**
 * Store por defecto — reemplazable via `configureStore()` en bootstrap
 * del servidor para usar GrowthBookFlagStore u otro backend.
 */
let _store: FlagStore = new InMemoryFlagStore()

/**
 * Configura el store global que usan `isEnabled` y `getVariant`.
 * Llamar una sola vez en el bootstrap de la app (ej. en `app/layout.tsx`
 * o en un initializer de server).
 *
 * @example
 *   import { configureStore } from '@/lib/flags/v2/hooks'
 *   import { GrowthBookFlagStore } from '@/lib/flags/v2/growthbook-adapter'
 *   configureStore(new GrowthBookFlagStore())
 */
export function configureStore(store: FlagStore): void {
  _store = store
}

/** Expone el store actual — util para tests que necesitan pre-cargar reglas. */
export function getStore(): FlagStore {
  return _store
}

// ── API publica ───────────────────────────────────────────────────────────────

/**
 * Evalua si una flag esta activa para el contexto dado.
 * Retorna `false` si la flag no existe en el store (fail-safe).
 *
 * @param name  Nombre de la flag (ej. 'checkout_v3')
 * @param ctx   Contexto de evaluacion — tenantId obligatorio
 */
export async function isEnabled(name: string, ctx: FlagContext): Promise<boolean> {
  const rule = await _store.get(name)
  if (!rule) return false
  const result: EvaluationResult = evaluate(rule, ctx)
  return result.active
}

/**
 * Obtiene el variante asignado para una flag A/B.
 * Retorna `null` si la flag no existe, no esta activa o no tiene variantes.
 *
 * @param name  Nombre de la flag
 * @param ctx   Contexto de evaluacion — tenantId obligatorio
 */
export async function getVariant(name: string, ctx: FlagContext): Promise<string | null> {
  const rule = await _store.get(name)
  if (!rule) return null
  const result: EvaluationResult = evaluate(rule, ctx)
  if (!result.active) return null
  return result.variant ?? null
}

/**
 * Evaluacion completa — retorna el objeto `EvaluationResult` con `active` y `variant`.
 * Util cuando se necesitan ambos valores en un solo await.
 */
export async function evaluateFlag(name: string, ctx: FlagContext): Promise<EvaluationResult> {
  const rule = await _store.get(name)
  if (!rule) return { active: false }
  return evaluate(rule, ctx)
}
