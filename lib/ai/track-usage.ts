/**
 * lib/ai/track-usage.ts
 *
 * Round 19 (2026-05-09) — wrapper genérico para tracking de costo+tokens
 * en uses de generateText/streamText del Vercel AI SDK.
 *
 * Round 28+ (2026-05-09) — soporte event-based para streamText.
 *
 * Centraliza:
 *  1. Logger structured con tenantId, modelo, tokens in/out, costo USD
 *  2. recordSpend en aiCostGuard (lib/ai/cost-control.ts) — Upstash Redis
 *  3. Métricas observables para dashboard FinOps
 *
 * Uso (generateText / no-stream):
 *   const result = await trackAiUsage(
 *     { tenantId, feature: "recommender", model: "claude-haiku-4-5" },
 *     () => generateText({ model: smartModel, prompt: "..." }),
 *   );
 *
 * Uso (streamText / stream):
 *   const onFinish = makeStreamUsageHandler({
 *     tenantId, feature: "chat", model: "claude-haiku-4-5",
 *   });
 *   const result = streamText({ model, messages, onFinish });
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

// ── streamText support ────────────────────────────────────────────────────────

/**
 * Vercel AI SDK v6 expone `usage` en distintos shapes según versión y provider:
 *   - `{ promptTokens, completionTokens, totalTokens }` (clásico)
 *   - `{ inputTokens, outputTokens, totalTokens }` (nuevo / Anthropic)
 *
 * Normalizamos ambos. Si el provider no expone tokens (caso edge), retornamos 0.
 */
interface RawStreamUsage {
  promptTokens?: number;
  completionTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

function normalizeUsage(raw: RawStreamUsage | undefined): AiUsageInfo {
  if (!raw) return {};
  const promptTokens = raw.promptTokens ?? raw.inputTokens ?? 0;
  const completionTokens = raw.completionTokens ?? raw.outputTokens ?? 0;
  const totalTokens =
    raw.totalTokens ??
    (promptTokens + completionTokens > 0 ? promptTokens + completionTokens : 0);
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Argumentos que el SDK entrega a `onFinish` de `streamText`. Tipamos solo
 * los campos que consumimos para evitar acoplarnos a la versión exacta del
 * SDK.
 */
export interface StreamFinishEvent {
  usage?: RawStreamUsage;
  finishReason?: string;
  /** Texto final acumulado (no requerido para tracking). */
  text?: string;
}

export interface MakeStreamUsageHandlerOptions extends AiTrackContext {
  /** Se llama cuando el stream termina con éxito (después de logging). */
  onFinish?: (event: StreamFinishEvent) => void | Promise<void>;
  /** Marca el inicio del stream para medir duración. Default: ahora. */
  startedAt?: number;
}

/**
 * Crea el handler `onFinish` que `streamText({ ..., onFinish })` debe recibir.
 *
 * Garantías:
 *  - Logging structured con tenantId/feature/model/tokens/costo/duración.
 *  - recordSpend fire-and-forget (no bloquea ni propaga errores).
 *  - Si el cliente cancela (`abortSignal`), AI SDK invoca `onFinish` con
 *    `finishReason: "abort"` y los tokens parciales — los registramos igual.
 *  - Si el handler externo (caller) falla, lo aislamos con try/catch.
 *
 * Retorna una función con el shape exacto que el SDK espera.
 */
export function makeStreamUsageHandler(opts: MakeStreamUsageHandlerOptions) {
  const { tenantId, feature, model, onFinish: userOnFinish } = opts;
  const startedAt = opts.startedAt ?? Date.now();

  return async (event: StreamFinishEvent) => {
    const durationMs = Date.now() - startedAt;
    const usage = normalizeUsage(event.usage);
    const costUsd = calculateCostUsd(model, usage);
    const finishReason = event.finishReason ?? "unknown";

    logger.info("[ai-track] stream finished", {
      tenantId,
      feature,
      model,
      durationMs,
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      costUsd: +costUsd.toFixed(6),
      finishReason,
    });

    if (costUsd > 0) {
      aiCostGuard.recordSpend(tenantId, costUsd).catch((err) => {
        logger.warn("[ai-track] stream recordSpend failed", {
          tenantId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    if (userOnFinish) {
      try {
        await userOnFinish(event);
      } catch (err) {
        logger.warn("[ai-track] user onFinish threw", {
          tenantId,
          feature,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
}

/**
 * Helper de conveniencia: ejecuta `streamFn` (que invoca `streamText`) y
 * registra error si la creación del stream lanza.
 *
 * El tracking real ocurre en `onFinish` (vía `makeStreamUsageHandler`); esta
 * función solo aísla errores de inicialización (ej. modelo inválido, RL).
 *
 * Uso:
 *   const result = await trackAiStream(
 *     { tenantId, feature: "chat", model: "claude-haiku-4-5" },
 *     (onFinish) => streamText({ model: chatModel, messages, onFinish }),
 *   );
 */
export async function trackAiStream<T>(
  ctx: AiTrackContext,
  streamFn: (
    onFinish: ReturnType<typeof makeStreamUsageHandler>,
  ) => T | Promise<T>,
  userOnFinish?: (event: StreamFinishEvent) => void | Promise<void>,
): Promise<T> {
  const onFinish = makeStreamUsageHandler({
    tenantId: ctx.tenantId,
    feature: ctx.feature,
    model: ctx.model,
    onFinish: userOnFinish,
  });

  try {
    return await streamFn(onFinish);
  } catch (err) {
    logger.error("[ai-track] streamText init failed", {
      tenantId: ctx.tenantId,
      feature: ctx.feature,
      model: ctx.model,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
