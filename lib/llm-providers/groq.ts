/**
 * lib/llm-providers/groq.ts
 *
 * Provider Groq — wrapper sobre fetchGroqWithRetry existente.
 * Expone la interfaz LLMProvider para uso desde llm-router.
 */

import { fetchGroqWithRetry } from "@/lib/groq-fetch";
import type { LLMCallOptions, LLMProvider, LLMResponse, ToolCallResult } from "./types";

export const groqProvider: LLMProvider = {
  name: "groq",

  models: {
    cheap: "llama-3.1-8b-instant",
    balanced: "llama-3.3-70b-versatile",
    premium: "meta-llama/llama-4-scout-17b-16e-instruct",
  },

  isAvailable() {
    return Boolean(process.env.GROQ_API_KEY);
  },

  async chat(opts: LLMCallOptions, model: string): Promise<LLMResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return errorResponse("GROQ_API_KEY not configured", model);
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

    const res = await fetchGroqWithRetry(apiKey, payload, opts.label ?? "llm-router");

    if (!res.ok) {
      return errorResponse(res.error ?? "groq call failed", model);
    }

    // Streaming response — devolvemos el body directo
    if (opts.stream && res.body) {
      return {
        ok: true,
        content: null,
        toolCalls: null,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        body: res.body,
        provider: "groq",
        model,
      };
    }

    const data = res.data as
      | {
          choices?: Array<{
            message?: {
              content?: string;
              tool_calls?: ToolCallResult[];
            };
          }>;
        }
      | undefined;
    const msg = data?.choices?.[0]?.message;

    return {
      ok: true,
      content: msg?.content ?? null,
      toolCalls: msg?.tool_calls ?? null,
      usage: {
        promptTokens: res.usage?.promptTokens ?? 0,
        completionTokens: res.usage?.completionTokens ?? 0,
        totalTokens: res.usage?.totalTokens ?? 0,
      },
      body: null,
      provider: "groq",
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
    provider: "groq",
    model,
    error,
  };
}
