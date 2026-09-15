/**
 * claude-router.ts — Multi-model routing económico
 *
 * Enruta tareas al modelo más eficiente en costo/calidad:
 * - Haiku 4.5: tareas mecánicas (lint, format, rename, docs)
 * - Sonnet 4.6: code review, debugging, tests, refactoring
 * - Opus 4.6: arquitectura, decisiones críticas, seguridad
 *
 * Uso:
 *   import { routeModel, ModelTier } from '@/lib/claude-router'
 *   const model = routeModel(taskDescription)
 *
 * Referencia: ADR-032 (Multi-model routing económico)
 */

// ── Types ────────────────────────────────────────────────────────────────

export type ModelTier = 'haiku' | 'sonnet' | 'opus'

export interface RouteResult {
  model: ModelTier
  modelId: string
  reason: string
  estimatedCostMultiplier: number
}

interface RouteRule {
  tier: ModelTier
  keywords: string[]
  weight: number
}

// ── Model IDs ────────────────────────────────────────────────────────────

// Familia Claude 5 (verificado 2026-09-11 en platform.claude.com/docs/en/models/overview):
//   Opus 5    claude-opus-5              $5 / $25 por MTok   1M contexto
//   Sonnet 5  claude-sonnet-5            $2 / $10 por MTok   1M contexto
//   Haiku 4.5 claude-haiku-4-5-20251001  $1 / $5  por MTok   200K contexto
// Los IDs sin fecha son snapshots fijos desde la generación 4.6. Sonnet 4.6 y
// Opus 4.6 siguen disponibles (legacy) pero salían MÁS caros que sus sucesores.
const MODEL_IDS: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5',
  opus: 'claude-opus-5',
}

// Relación de precio de ENTRADA contra Opus 5 ($5): son los cocientes reales de
// la tabla de arriba, no estimaciones. La salida guarda la misma proporción.
const COST_MULTIPLIERS: Record<ModelTier, number> = {
  haiku: 0.2,   // $1 / $5
  sonnet: 0.4,  // $2 / $5
  opus: 1.0,    // precio base
}

// ── Routing Rules ────────────────────────────────────────────────────────

const HAIKU_RULES: RouteRule = {
  tier: 'haiku',
  weight: 3,
  keywords: [
    'lint', 'format', 'prettier', 'eslint',
    'rename', 'typo', 'spelling', 'comment',
    'import', 'export', 'unused',
    'docs', 'readme', 'documentation', 'jsdoc',
    'gitignore', 'config', 'env.example',
    'move file', 'copy', 'delete file',
    'sort', 'alphabetize', 'organize imports',
  ],
}

const SONNET_RULES: RouteRule = {
  tier: 'sonnet',
  weight: 2,
  keywords: [
    'review', 'code review', 'debug', 'fix bug',
    'test', 'unit test', 'vitest', 'playwright',
    'refactor', 'extract', 'simplify', 'clean up',
    'component', 'hook', 'context', 'state',
    'api endpoint', 'route handler', 'middleware',
    'style', 'css', 'tailwind', 'responsive',
    'cache', 'optimize', 'performance',
    'query', 'index', 'sql',
  ],
}

const OPUS_RULES: RouteRule = {
  tier: 'opus',
  weight: 1,
  keywords: [
    'architect', 'architecture', 'design', 'system design',
    'adr', 'decision', 'trade-off', 'evaluate',
    'security', 'pentest', 'vulnerability', 'owasp',
    'migration', 'schema change', 'breaking change',
    'multi-tenant', 'isolation', 'rbac', 'auth',
    'checkout', 'payment', 'stripe', 'yape',
    'sunat', 'invoice', 'boleta',
    'fiado', 'credit', 'scoring',
    'critical', 'production', 'incident',
    'plan', 'roadmap', 'strategy', 'vision',
  ],
}

// ── Router ────────────────────────────────────────────────────────────────

/**
 * Determina el modelo óptimo para una tarea basándose en keywords.
 *
 * @param task - Descripción de la tarea en lenguaje natural
 * @returns RouteResult con modelo, ID, razón y multiplicador de costo
 *
 * @example
 * routeModel("fix typo in README")
 * // → { model: 'haiku', modelId: 'claude-haiku-4-5-20251001', ... }
 *
 * routeModel("design the fiado digital architecture")
 * // → { model: 'opus', modelId: 'claude-opus-5', ... }
 */
export function routeModel(task: string): RouteResult {
  const lower = task.toLowerCase()

  // Calcular score para cada tier
  const scores: Record<ModelTier, { count: number; matched: string[] }> = {
    haiku: { count: 0, matched: [] },
    sonnet: { count: 0, matched: [] },
    opus: { count: 0, matched: [] },
  }

  for (const rule of [HAIKU_RULES, SONNET_RULES, OPUS_RULES]) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        scores[rule.tier].count += rule.weight
        scores[rule.tier].matched.push(keyword)
      }
    }
  }

  // Opus gana si tiene cualquier match (tareas críticas)
  if (scores.opus.count > 0) {
    return {
      model: 'opus',
      modelId: MODEL_IDS.opus,
      reason: `Critical task detected: ${scores.opus.matched.slice(0, 3).join(', ')}`,
      estimatedCostMultiplier: COST_MULTIPLIERS.opus,
    }
  }

  // Haiku gana si tiene más matches que Sonnet
  if (scores.haiku.count > scores.sonnet.count && scores.haiku.count > 0) {
    return {
      model: 'haiku',
      modelId: MODEL_IDS.haiku,
      reason: `Mechanical task: ${scores.haiku.matched.slice(0, 3).join(', ')}`,
      estimatedCostMultiplier: COST_MULTIPLIERS.haiku,
    }
  }

  // Sonnet si tiene matches
  if (scores.sonnet.count > 0) {
    return {
      model: 'sonnet',
      modelId: MODEL_IDS.sonnet,
      reason: `Standard dev task: ${scores.sonnet.matched.slice(0, 3).join(', ')}`,
      estimatedCostMultiplier: COST_MULTIPLIERS.sonnet,
    }
  }

  // Default: Sonnet (balance costo/calidad)
  return {
    model: 'sonnet',
    modelId: MODEL_IDS.sonnet,
    reason: 'Default: no specific keywords matched',
    estimatedCostMultiplier: COST_MULTIPLIERS.sonnet,
  }
}

/**
 * Estima el ahorro de usar el router vs Opus para todo.
 *
 * @param tasks - Lista de descripciones de tareas
 * @returns Resumen con ahorro estimado
 */
export function estimateSavings(tasks: string[]): {
  breakdown: Array<{ task: string; model: ModelTier; multiplier: number }>
  totalMultiplier: number
  savingsPercent: number
} {
  const breakdown = tasks.map(task => {
    const result = routeModel(task)
    return { task, model: result.model, multiplier: result.estimatedCostMultiplier }
  })

  const totalMultiplier = breakdown.reduce((sum, b) => sum + b.multiplier, 0) / breakdown.length
  const savingsPercent = Math.round((1 - totalMultiplier) * 100)

  return { breakdown, totalMultiplier, savingsPercent }
}
