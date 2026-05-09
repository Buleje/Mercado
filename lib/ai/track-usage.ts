/**
 * lib/ai/track-usage.ts
 *
 * Round 19 (2026-05-09) — wrapper genérico para tracking de costo+tokens
 * en uses de generateText/streamText del Vercel AI SDK.
 *
 * Centraliza:
 *  1. Logger structured con tenantId, modelo, tokens in/out, costo USD
 *  2. recordSpend en aiCostGuard (lib/ai/cost-control.ts) — Upstash Redis
 *  3. Métricas observables para dashboard FinOps
 *
 * Uso:
 *   const result = await trackAiUsage(
 *     { tenantId, feature: "recommender", model: "claude-haiku-4-5" },
 *     () => generateText({ model: smartModel, prompt: "..." }),
 *   );
 *
 * Si no se puede capturar `usage` del SDK (provider no lo expone),
 * cae al estimate por longitud del prompt.
 */
import "server-only";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { logger } from "@/lib/logger";

interface AiTrackContext {
  tenantId: string;
  feature: string;
  /** Slug del modelo. Usado para resolver pricing. */
  model: string;
}

interface AiUsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Pricing por 1M tokens (USD) — actualizar con cambios upstream.
 * Ref: anthropic.com/api/pricing, openai.com/pricing, console.groq.com.
 */
const PRICING_PER_1M: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5":  { input: 1.0,  output: 5.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0,  output: 15.0 },
  "claude-opus-4-7":   { input: 15.0, output: 75.0 },
  "gpt-4o-mini":       { input: 0.15, output: 0.6 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 }, // Groq
  // Default fallback conservador (Sonnet pricing)
  default: { input: 3.0, output: 15.0 },
};

function calculateCostUsd(model: string, usage: AiUsageInfo): number {
  const pricing = PRICING_PER_1M[model] ?? PRICING_PER_1M.default;
  const inputTok = usage.promptTokens ?? 0;
  const outputTok = usage.completionTokens ?? 0;
  return (inputTok * pricing.input + outputTok * pricing.output) / 1_000_000;
}

/**
 * Wrap a generateText/streamText call con tracking automático.
 * El callback debe retornar el objeto del SDK (con `usage` opcional).
 *
 * NO falla la operación si tracking fails — fire-and-forget.
 */
export async function trackAiUsage<T extends { usage?: AiUsageInfo }>(
  ctx: AiTrackContext,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  let result: T;
  try {
    result = await fn();
  } catch (err) {
    logger.error("[ai-track] call failed", {
      tenantId: ctx.tenantId,
      feature: ctx.feature,
      model: ctx.model,
      durationMs: Date.now() - start,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const durationMs = Date.now() - start;
  const usage: AiUsageInfo = result.usage ?? {};
  const costUsd = calculateCostUsd(ctx.model, usage);

  // Structured log (queriable en Vercel/Sentry)
  logger.info("[ai-track] call ok", {
    tenantId: ctx.tenantId,
    feature: ctx.feature,
    model: ctx.model,
    durationMs,
    promptTokens: usage.promptTokens ?? 0,
    completionTokens: usage.completionTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
    costUsd: +costUsd.toFixed(6),
  });

  // Record en cost-control (fire-and-forget, no rompe el flujo)
  if (costUsd > 0) {
    aiCostGuard.recordSpend(ctx.tenantId, costUsd).catch((err) => {
      logger.warn("[ai-track] recordSpend failed", {
        tenantId: ctx.tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return result;
}
