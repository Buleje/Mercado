/**
 * lib/llm-providers/anthropic.ts
 *
 * STUB: proveedor Anthropic (Claude). Pendiente de implementación en una
 * sesión dedicada — ver ADR-010 "Implementación pendiente".
 *
 * El stub existe para:
 *   1. Completar la interfaz LLMProvider y permitir que `llm-router.ts`
 *      importe todos los providers sin errores de TS.
 *   2. Fallar ruidosamente si el router intenta usarlo antes de que esté
 *      implementado, en vez de un error críptico de runtime.
 *   3. Declarar qué models/tiers se espera cuando se complete.
 *
 * Para implementar:
 *   - Instalar `@anthropic-ai/sdk`
 *   - Agregar ANTHROPIC_API_KEY a lib/env.ts (opcional, solo si `premium`
 *     tier está en uso)
 *   - Reemplazar `chat()` con llamadas reales al SDK
 *   - Traducir tool_calls del formato Anthropic al formato OpenAI-compatible
 *     que el resto del código espera
 */

import type { LLMCallOptions, LLMProvider, LLMResponse } from "./types";

export const anthropicProvider: LLMProvider = {
  name: "anthropic",

  models: {
    cheap: "claude-haiku-4-5-20251001",
    balanced: "claude-sonnet-4-6",
    premium: "claude-opus-4-6",
  },

  isAvailable() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async chat(_opts: LLMCallOptions, model: string): Promise<LLMResponse> {
    // STUB — ver ADR-010 para el plan de implementación
    return {
      ok: false,
      content: null,
      toolCalls: null,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      body: null,
      provider: "anthropic",
      model,
      error:
        "Anthropic provider not implemented yet — see ADR-010. " +
        "Configure ANTHROPIC_API_KEY and implement @/lib/llm-providers/anthropic.ts " +
        "before using tier='premium' or Claude fallback.",
    };
  },
};
