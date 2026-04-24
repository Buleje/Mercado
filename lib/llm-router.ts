/**
 * lib/llm-router.ts
 *
 * Router LLM mixto (Groq + Anthropic fallback) — implementa el ADR-010.
 *
 * Uso en un endpoint:
 * ```ts
 * import { callLLM } from "@/lib/llm-router";
 * import { AI_TEMPERATURES } from "@/lib/ai-temperatures";
 *
 * const result = await callLLM("balanced", {
 *   messages: [...],
 *   temperature: AI_TEMPERATURES.gerente,
 *   stream: true,
 *   label: "my-endpoint",
 * });
 * if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
 * ```
 *
 * El router decide qué provider usar según:
 *   1. El tier declarado por el endpoint
 *   2. La disponibilidad de API keys en el entorno
 *   3. Fallback a otro tier si el principal falla
 *
 * Pattern idéntico a `lib/ai-temperatures.ts` — tiers canónicos, auditables,
 * declarados explícitamente por el caller.
 */

import { groqProvider, anthropicProvider, xaiProvider } from "./llm-providers";
import type { LLMCallOptions, LLMProvider, LLMResponse } from "./llm-providers";

export type LLMTier = "cheap" | "balanced" | "premium";

// ── Tier → provider preferences (ADR-010) ────────────────────────────────────

interface TierConfig {
  /** Provider primario para este tier. */
  primary: LLMProvider;
  /** Provider fallback si el primario falla. null = degradar a rule-based. */
  fallback: LLMProvider | null;
  /** Nombre del modelo primary (del registro de modelos del provider). */
  primaryModel: string;
  /** Nombre del modelo fallback. */
  fallbackModel: string | null;
}

// 2026-04-24: si XAI_API_KEY está configurado, xAI (Grok) tiene prioridad
// sobre Groq en los tiers balanced/premium. Esto se evalúa en runtime via
// isAvailable() — Groq queda como fallback automático si xAI cae.
const xaiAvailable = Boolean(process.env.XAI_API_KEY);

const TIER_CONFIG: Record<LLMTier, TierConfig> = {
  // Chat al cliente, auto-reply, OCR simple, voice interpret.
  // Barato y rápido — Groq llama-3.1-8b-instant. Si cae, sube a llama-3.3-70b.
  cheap: {
    primary: groqProvider,
    primaryModel: groqProvider.models.cheap,
    fallback: groqProvider,
    fallbackModel: groqProvider.models.balanced,
  },
  // Asistente admin, coach, promotions, demand prediction.
  // Si hay xAI: Grok-2-latest (128k contexto, mejor razonamiento). Fallback Groq.
  // Si no hay xAI: Groq llama-3.3-70b → llama-4-scout.
  balanced: xaiAvailable
    ? {
        primary: xaiProvider,
        primaryModel: xaiProvider.models.balanced,
        fallback: groqProvider,
        fallbackModel: groqProvider.models.balanced,
      }
    : {
        primary: groqProvider,
        primaryModel: groqProvider.models.balanced,
        fallback: groqProvider,
        fallbackModel: groqProvider.models.premium,
      },
  // Decisiones críticas. Si hay xAI: grok-beta. Si no: Anthropic Claude.
  // Si nada: Groq llama-4-scout.
  premium: xaiAvailable
    ? {
        primary: xaiProvider,
        primaryModel: xaiProvider.models.premium,
        fallback: groqProvider,
        fallbackModel: groqProvider.models.premium,
      }
    : {
        primary: anthropicProvider,
        primaryModel: anthropicProvider.models.balanced,
        fallback: groqProvider,
        fallbackModel: groqProvider.models.premium,
      },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Llama al LLM con el tier especificado. Aplica fallback automático si el
 * provider primario no está disponible o falla.
 */
export async function callLLM(
  tier: LLMTier,
  opts: LLMCallOptions,
): Promise<LLMResponse> {
  const config = TIER_CONFIG[tier];

  // 1. Intentar provider primario si está disponible
  if (config.primary.isAvailable()) {
    const result = await config.primary.chat(opts, config.primaryModel);
    if (result.ok) return result;
    // Si falla, caer al fallback (no re-throw)
  }

  // 2. Intentar fallback si hay uno configurado
  if (config.fallback && config.fallbackModel && config.fallback.isAvailable()) {
    return config.fallback.chat(opts, config.fallbackModel);
  }

  // 3. Sin fallback disponible — devolver error estructurado
  return {
    ok: false,
    content: null,
    toolCalls: null,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    body: null,
    provider: config.primary.name,
    model: config.primaryModel,
    error: `No provider available for tier "${tier}". Primary "${config.primary.name}" unavailable, fallback "${config.fallback?.name ?? "none"}" unavailable.`,
  };
}

/**
 * Helper de debugging — retorna qué provider/modelo usaría el router para
 * un tier dado SIN hacer la llamada real.
 */
export function resolveLLMRoute(
  tier: LLMTier,
): { provider: string; model: string; willUseFallback: boolean } {
  const config = TIER_CONFIG[tier];
  if (config.primary.isAvailable()) {
    return {
      provider: config.primary.name,
      model: config.primaryModel,
      willUseFallback: false,
    };
  }
  if (config.fallback && config.fallbackModel && config.fallback.isAvailable()) {
    return {
      provider: config.fallback.name,
      model: config.fallbackModel,
      willUseFallback: true,
    };
  }
  return {
    provider: config.primary.name,
    model: config.primaryModel,
    willUseFallback: false,
  };
}

// ── Endpoint → tier mapping (para documentación, no para código) ─────────────
//
// Este mapping es solo referencia. Cada endpoint declara su tier explícitamente
// en su código. El ADR-010 tiene la tabla completa de justificación.
//
//   cheap:     chat/auto-reply, whatsapp-ai, pos/voice-interpret, ocr/invoice
//   balanced:  ai-assistant, ai-assistant/coach, demand-prediction,
//              promotions/ai-suggest, promotions/[id]
//   premium:   (ninguno actual — futuro: endpoint "aprobar compra >$500")
