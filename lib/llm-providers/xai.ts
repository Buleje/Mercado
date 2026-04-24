/**
 * lib/llm-providers/xai.ts
 *
 * Provider xAI (Grok) — wrapper compatible con el contrato LLMProvider.
 * API REST OpenAI-compatible: POST https://api.x.ai/v1/chat/completions.
 *
 * Modelos disponibles (verificado 2026-04-24 contra api.x.ai):
 *  - grok-3 (balanced, contexto largo)
 *  - grok-3-mini (cheap, más rápido)
 *  - grok-2-vision-1212 (visión + texto)
 *  - grok-3-fast (premium, mejor reasoning)
 *
 * Se activa automáticamente cuando XAI_API_KEY está presente en env.
 *
 * IMPORTANTE: El team de xAI debe tener créditos comprados en
 * https://console.x.ai/ — sin créditos el provider devuelve error
 * 403 con mensaje específico.
 */

import type { LLMCallOptions, LLMProvider, LLMResponse, ToolCallResult } from "./types";

const XAI_BASE_URL = "https://api.x.ai/v1";

export const xaiProvider: LLMProvider = {
  name: "xai",

  models: {
    cheap: "grok-3-mini",
    balanced: "grok-3",
    premium: "grok-3-fast",
  },

  isAvailable() {
    return Boolean(process.env.XAI_API_KEY);
  },

  async chat(opts: LLMCallOptions, model: string): Promise<LLMResponse> {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return errorResponse("XAI_API_KEY not configured", model);
    }

    const payload: Record<string, unknown> = {
      model,
      messages: opts.messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens ?? 1500,
      stream: opts.stream ?? false,
    };
    if (opts.tools && opts.tools.length > 0) {
      payload.tools = opts.tools;
      payload.tool_choice = opts.toolChoice ?? "auto";
    }

    const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      // Detección específica del error de "team sin créditos" para dar
      // instrucción accionable en vez de un 403 genérico.
      if (errBody.includes("doesn't have any credits") || errBody.includes("does not have permission")) {
        return errorResponse(
          "xAI: tu cuenta no tiene créditos. Compra créditos en https://console.x.ai/ para activar el chat IA.",
          model,
        );
      }
      if (errBody.includes("Model not found")) {
        return errorResponse(
          `xAI: modelo "${model}" no disponible. Verifica los modelos vigentes en https://console.x.ai/.`,
          model,
        );
      }
      return errorResponse(
        `xAI HTTP ${res.status}: ${errBody.slice(0, 200)}`,
        model,
      );
    }

    // Streaming — devolvemos el body directo para que el caller lo parsee.
    if (opts.stream && res.body) {
      return {
        ok: true,
        content: null,
        toolCalls: null,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        body: res.body,
        provider: "xai",
        model,
      };
    }

    const data = (await res.json()) as
      | {
          choices?: Array<{
            message?: {
              content?: string;
              tool_calls?: ToolCallResult[];
            };
          }>;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        }
      | undefined;

    const msg = data?.choices?.[0]?.message;
    const u = data?.usage;

    return {
      ok: true,
      content: msg?.content ?? null,
      toolCalls: msg?.tool_calls ?? null,
      usage: {
        promptTokens: u?.prompt_tokens ?? 0,
        completionTokens: u?.completion_tokens ?? 0,
        totalTokens: u?.total_tokens ?? 0,
      },
      body: null,
      provider: "xai",
      model,
    };
  },
};

function errorResponse(error: string, model: string): LLMResponse {
  return {
    ok: false,
    content: null,
    toolCalls: null,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    body: null,
    provider: "xai",
    model,
    error,
  };
}
