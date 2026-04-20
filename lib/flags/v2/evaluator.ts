/**
 * Feature Flags v2 — Evaluador deterministico
 *
 * Hash: djb2 sobre la cadena `${tenantId}:${userId ?? ''}:${ruleName}`
 * Produce un numero 0–99 estable entre requests — sin Math.random().
 */

import type { FlagContext, FlagRule, EvaluationResult } from './types'

// ── Hash ─────────────────────────────────────────────────────────────────────

/**
 * djb2 hash de una cadena ASCII/UTF-8.
 * Retorna un entero sin signo en [0, 2^32).
 * Fuente: http://www.cse.yorku.ca/~oz/hash.html
 */
function djb2(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    // hash = hash * 33 ^ charCode  (equivalente a (hash << 5) + hash ^ c)
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
    // Mantener 32 bits sin signo
    hash = hash >>> 0
  }
  return hash
}

/**
 * Produce un bucket 0–99 deterministico para el contexto + nombre de flag.
 * El mismo contexto SIEMPRE produce el mismo bucket.
 */
function bucket(rule: FlagRule, ctx: FlagContext): number {
  const seed = `${ctx.tenantId}:${ctx.userId ?? ''}:${rule.name}`
  return djb2(seed) % 100
}

// ── Seleccion de variante ────────────────────────────────────────────────────

/**
 * Selecciona un variante deterministicamente segun los pesos definidos.
 * Si los pesos no suman >= 1, el ultimo bucket absorbe el resto.
 */
function pickVariant(variants: Record<string, number>, ctx: FlagContext, rule: FlagRule): string | undefined {
  const entries = Object.entries(variants)
  if (entries.length === 0) return undefined

  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0)
  if (totalWeight <= 0) return entries[0][0]

  // Hash distinto para variante (sufijo ':variant') evita correlacion con rollout
  const seed = `${ctx.tenantId}:${ctx.userId ?? ''}:${rule.name}:variant`
  const hashVal = djb2(seed) % totalWeight

  let cumulative = 0
  for (const [name, weight] of entries) {
    cumulative += weight
    if (hashVal < cumulative) return name
  }
  // Fallback al ultimo (nunca deberia llegar aqui)
  return entries[entries.length - 1][0]
}

// ── Evaluador principal ───────────────────────────────────────────────────────

/**
 * Evalua una regla contra un contexto y retorna `{ active, variant? }`.
 *
 * Logica de prioridad:
 *  1. `enabled: false`      → kill switch global, retorna `{ active: false }`
 *  2. `targetTenants`       → si definido y tenantId no esta en lista, `{ active: false }`
 *  3. `targetRoles`         → si definido y userRole no esta en lista, `{ active: false }`
 *  4. `rolloutPct`          → hash deterministico; si bucket >= pct, `{ active: false }`
 *  5. Flag activa           → si `variants` definido, pick variante por peso
 */
export function evaluate(rule: FlagRule, ctx: FlagContext): EvaluationResult {
  // 1. Kill switch
  if (!rule.enabled) {
    return { active: false }
  }

  // 2. Targeting por tenant
  if (rule.targetTenants !== undefined && rule.targetTenants.length > 0) {
    if (!rule.targetTenants.includes(ctx.tenantId)) {
      return { active: false }
    }
  }

  // 3. Targeting por rol
  if (rule.targetRoles !== undefined && rule.targetRoles.length > 0) {
    if (!ctx.userRole || !rule.targetRoles.includes(ctx.userRole)) {
      return { active: false }
    }
  }

  // 4. %-rollout deterministico
  if (rule.rolloutPct !== undefined) {
    if (rule.rolloutPct <= 0) {
      return { active: false }
    }
    if (rule.rolloutPct < 100) {
      const b = bucket(rule, ctx)
      if (b >= rule.rolloutPct) {
        return { active: false }
      }
    }
    // rolloutPct === 100 pasa directo
  }

  // 5. Activa — pick variante si corresponde
  if (rule.variants !== undefined && Object.keys(rule.variants).length > 0) {
    const variant = pickVariant(rule.variants, ctx, rule)
    return { active: true, variant }
  }

  return { active: true }
}
