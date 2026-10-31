/**
 * claude-router.ts — Multi-model routing económico
 *
 * Enruta tareas al modelo más eficiente en costo/calidad:
 * - Haiku 5.5: tareas mecánicas (lint, format, rename, docs)
 * - Sonnet 5.5: code review, debugging, tests, refactoring
 * - Opus 5.5: arquitectura, decisiones críticas, seguridad
 *
 * Es además la ÚNICA fuente de los IDs de Claude del sistema: `lib/ai/provider.ts`,
 * `lib/llm-providers/anthropic.ts`, la lectura de fotos y las rutas que van por el
 * AI Gateway de Vercel los importan de acá (`MODEL_IDS` / `GATEWAY_MODEL_IDS`).
 * Cuando Anthropic saque otra generación se cambia este archivo y nada más.
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

// Familia Claude 5 (verificado 2026-10-15 en platform.claude.com/docs/en/about-claude/models/overview):
//   Fable 5.1  claude-fable-5-1   $10   / $50   por MTok  1M contexto
//   Opus 5.5   claude-opus-5-5    $4    / $20   por MTok  1M contexto
//   Sonnet 5.5 claude-sonnet-5-5  $2    / $10   por MTok  1M contexto
//   Haiku 5.5  claude-haiku-5-5   $0,10 / $0,50 por MTok  1M contexto ($0,50 / $2,50 si el prompt pasa de 100K)
// Los IDs sin fecha son snapshots fijos desde la generación 4.6.
//
// 2026-10-15: haiku pasa de Haiku 4.5 a **Haiku 5.5** (10× más barato: $1/$5 → $0,10/$0,50)
// y sonnet de Sonnet 5 a **Sonnet 5.5** (mismo precio). Los viejos quedan legacy: sus
// filas siguen en la tabla de precios de `lib/ai/track-usage.ts` porque el historial
// ya grabado las cita. Fable 5.1 NO entra en el router: es para razonamiento exigente
// y sale 2,5× más caro que Opus 5.5 — si una tarea lo necesita, se pide explícitamente.
export const MODEL_IDS: Record<ModelTier, string> = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

// Los mismos modelos con el nombre que usa el AI Gateway de Vercel (proveedor/modelo
// con PUNTO en la versión). Verificado 2026-10-15 contra ai-gateway.vercel.sh/v1/models:
// la forma con guion que había en las rutas («anthropic/claude-haiku-4-5») no figura.
export const GATEWAY_MODEL_IDS: Record<ModelTier, string> = {
  haiku: 'anthropic/claude-haiku-5.5',
  sonnet: 'anthropic/claude-sonnet-5.5',
  opus: 'anthropic/claude-opus-5.5',
}

/**
 * ¿El modelo devuelve 400 si se le manda `temperature`, `top_p` o `top_k`?
 * Desde Opus 4.7 / Sonnet 5 / Haiku 5.5 sí (Haiku 5.5 y Sonnet 5.5 sólo aceptan el
 * valor por defecto, Opus 5.5 los quitó). Haiku 4.5 y la línea 4.6 los aceptan.
 * Acepta el ID pelado o con prefijo de gateway («anthropic/claude-sonnet-5.5»).
 */
export function rejectsSamplingParams(modelId: string): boolean {
  return /claude-(?:(?:fable|mythos|opus|sonnet|haiku)-5|opus-4-[78])/.test(modelId)
}

// Relación de precio de ENTRADA contra el tier opus ($4): son los cocientes reales
// de la tabla de arriba, no estimaciones. La salida guarda la misma proporción
// ($0,50/$20 y $10/$20). Con Haiku 5.5 bajar de opus a haiku pasa de ahorrar 4× a 40×.
const COST_MULTIPLIERS: Record<ModelTier, number> = {
  haiku: 0.025, // $0,10 / $4
  sonnet: 0.5,  // $2 / $4
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
 * // → { model: 'haiku', modelId: 'claude-haiku-5-5', ... }
 *
 * routeModel("design the fiado digital architecture")
 * // → { model: 'opus', modelId: 'claude-opus-5-5', ... }
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
