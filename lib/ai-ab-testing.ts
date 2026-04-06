import "server-only";

/**
 * lib/ai-ab-testing.ts
 *
 * A/B testing for AI prompts — like testing two different store signs to see
 * which one brings in more customers.
 *
 * Assigns users to prompt variants randomly, tracks which variant was used,
 * and measures quality via feedback scores.
 *
 * Usage:
 *   const variant = getPromptVariant("coach-system", tenantId);
 *   // Use variant.promptModifier to adjust the system prompt
 *   // After response, record: recordVariantUsage("coach-system", variant.id, feedback)
 */

import { logger } from "@/lib/logger";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PromptVariant {
  id: string;
  name: string;
  /** Modifier text appended to the base system prompt */
  promptModifier: string;
  /** Weight for random selection (higher = more likely) */
  weight: number;
}

export interface ABExperiment {
  id: string;
  name: string;
  description: string;
  active: boolean;
  variants: PromptVariant[];
  /** Metrics per variant */
  metrics: Map<string, VariantMetrics>;
}

interface VariantMetrics {
  impressions: number;
  thumbsUp: number;
  thumbsDown: number;
  avgTokensUsed: number;
  totalTokens: number;
}

// ── In-memory experiment store ────────────────────────────────────────────────

const experiments = new Map<string, ABExperiment>();

// ── Seed default experiments ──────────────────────────────────────────────────

function seedDefaults(): void {
  if (experiments.size > 0) return;

  registerExperiment({
    id: "coach-tone",
    name: "Tono del Coach",
    description: "Probar si un tono más motivacional genera mejor feedback que uno analítico",
    active: true,
    variants: [
      {
        id: "analytical",
        name: "Analítico",
        promptModifier: "Mantén un tono analítico y basado en datos. Prioriza números y métricas concretas.",
        weight: 50,
      },
      {
        id: "motivational",
        name: "Motivacional",
        promptModifier: "Mantén un tono motivacional y positivo. Celebra los logros antes de señalar áreas de mejora. Usa frases como 'Excelente trabajo en...' y '¡Vas muy bien!'.",
        weight: 50,
      },
    ],
  });

  registerExperiment({
    id: "assistant-detail",
    name: "Nivel de detalle del Asistente",
    description: "Probar si respuestas más cortas o más detalladas son preferidas",
    active: true,
    variants: [
      {
        id: "concise",
        name: "Conciso",
        promptModifier: "Sé extremadamente conciso. Máximo 3 puntos por respuesta. No más de 100 palabras.",
        weight: 50,
      },
      {
        id: "detailed",
        name: "Detallado",
        promptModifier: "Da respuestas detalladas con contexto completo. Incluye comparaciones con períodos anteriores y recomendaciones específicas.",
        weight: 50,
      },
    ],
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a new A/B experiment.
 */
export function registerExperiment(config: Omit<ABExperiment, "metrics">): void {
  const metrics = new Map<string, VariantMetrics>();
  for (const v of config.variants) {
    metrics.set(v.id, {
      impressions: 0,
      thumbsUp: 0,
      thumbsDown: 0,
      avgTokensUsed: 0,
      totalTokens: 0,
    });
  }
  experiments.set(config.id, { ...config, metrics });
}

/**
 * Get a random prompt variant for an experiment.
 * Uses weighted random selection. Returns null if experiment not found or inactive.
 */
export function getPromptVariant(
  experimentId: string,
  _tenantId: string,
): PromptVariant | null {
  seedDefaults();

  const experiment = experiments.get(experimentId);
  if (!experiment || !experiment.active) return null;
  if (experiment.variants.length === 0) return null;

  // Weighted random selection
  const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
  let random = Math.random() * totalWeight;

  for (const variant of experiment.variants) {
    random -= variant.weight;
    if (random <= 0) return variant;
  }

  return experiment.variants[0];
}

/**
 * Record that a variant was shown and optionally record feedback.
 */
export function recordVariantUsage(
  experimentId: string,
  variantId: string,
  feedback?: { thumbsUp?: boolean; tokensUsed?: number },
): void {
  const experiment = experiments.get(experimentId);
  if (!experiment) return;

  const metrics = experiment.metrics.get(variantId);
  if (!metrics) return;

  metrics.impressions++;

  if (feedback?.thumbsUp === true) metrics.thumbsUp++;
  if (feedback?.thumbsUp === false) metrics.thumbsDown++;

  if (feedback?.tokensUsed) {
    metrics.totalTokens += feedback.tokensUsed;
    metrics.avgTokensUsed = Math.round(metrics.totalTokens / metrics.impressions);
  }

  logger.debug("[ab-test] Variant recorded", {
    experimentId,
    variantId,
    impressions: metrics.impressions,
    thumbsUp: metrics.thumbsUp,
    thumbsDown: metrics.thumbsDown,
  });
}

/**
 * Get results for all experiments (for the admin dashboard).
 */
export function getABTestResults(): Array<{
  id: string;
  name: string;
  description: string;
  active: boolean;
  variants: Array<{
    id: string;
    name: string;
    impressions: number;
    thumbsUp: number;
    thumbsDown: number;
    satisfactionRate: number;
    avgTokensUsed: number;
  }>;
  winner: string | null;
}> {
  seedDefaults();

  return Array.from(experiments.values()).map((exp) => {
    const variantResults = exp.variants.map((v) => {
      const m = exp.metrics.get(v.id)!;
      const totalFeedback = m.thumbsUp + m.thumbsDown;
      return {
        id: v.id,
        name: v.name,
        impressions: m.impressions,
        thumbsUp: m.thumbsUp,
        thumbsDown: m.thumbsDown,
        satisfactionRate: totalFeedback > 0
          ? Math.round((m.thumbsUp / totalFeedback) * 100)
          : 0,
        avgTokensUsed: m.avgTokensUsed,
      };
    });

    // Determine winner (variant with highest satisfaction rate & min 10 impressions)
    const qualified = variantResults.filter((v) => v.impressions >= 10);
    const winner = qualified.length >= 2
      ? qualified.reduce((a, b) => (a.satisfactionRate > b.satisfactionRate ? a : b)).id
      : null;

    return {
      id: exp.id,
      name: exp.name,
      description: exp.description,
      active: exp.active,
      variants: variantResults,
      winner,
    };
  });
}
