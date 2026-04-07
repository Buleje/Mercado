/**
 * lib/llm-providers/anthropic.ts
 *
 * Provider Anthropic (Claude) — implementación real usando fetch directo
 * a la Messages API (sin SDK, igual pattern que groq.ts).
 *
 * Ver ADR-010 para la estrategia de tiers y fallback.
 *
 * Diferencias con OpenAI/Groq API:
 *   1. System prompt va en campo `system` separado, no en messages[]
 *   2. Messages solo aceptan roles "user" | "assistant" (no "system", no "tool")
 *   3. Tool calls son content blocks con type="tool_use"
 *   4. Tool results son content blocks con type="tool_result"
 *   5. Header `x-api-key` en vez de `Authorization: Bearer`
 *   6. Header `anthropic-version: 2023-06-01` requerido
 *   7. Response content es array de blocks, no string directo
 *
 * Este wrapper traduce entre el formato unificado LLMCallOptions/LLMResponse
 * (OpenAI-compatible) y el formato nativo de Anthropic, para que el router
 * pueda swapear providers sin que el caller se entere.
 */

import type { LLMCallOptions, LLMProvider, LLMResponse, ChatMessage, ToolCallResult } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

export const anthropicProvider: LLMProvider = {
  name: "anthropic",

  // Claude 4.6 family — alineado con el knowledge update de Vercel 2026-02-27.
  // Haiku 4.5 existe (claude-haiku-4-5-20251001). Sonnet 4.6 y Opus 4.6 son
  // los defaults actuales del proyecto (ver CLAUDE.md).
  models: {
    cheap: "claude-haiku-4-5-20251001",
    balanced: "claude-sonnet-4-6",
    premium: "claude-opus-4-6",
  },

  isAvailable() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async chat(opts: LLMCallOptions, model: string): Promise<LLMResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse("ANTHROPIC_API_KEY not configured", model);
    }

    // Streaming con tools no es el happy path de este proyecto todavía —
    // si Brandon lo necesita, se agrega después.
    if (opts.stream && opts.tools && opts.tools.length > 0) {
      return errorResponse(
        "Anthropic provider: streaming + tools not yet supported in this wrapper",
        model,
      );
    }

    // Traducir el array de messages al formato Anthropic.
    // - System messages se consolidan en el campo `system` top-level.
    // - Tool messages se traducen a content blocks tool_result dentro de user.
    const { system, messages } = splitSystemAndMessages(opts.messages);

    const body: Record<string, unknown> = {
      model,
      max_tokens: opts.maxTokens ?? 1500,
      temperature: opts.temperature,
      messages,
    };
    if (system) body.system = system;
    if (opts.tools && opts.tools.length > 0) {
      body.tools = translateToolsToAnthropic(opts.tools);
      if (opts.toolChoice && opts.toolChoice !== "auto") {
        body.tool_choice = opts.toolChoice;
      }
    }
    if (opts.stream) {
      body.stream = true;
    }

    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return errorResponse(`network error: ${(e as Error).message}`, model);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return errorResponse(
        `HTTP ${res.status}: ${errText.slice(0, 300)}`,
        model,
      );
    }

    // Streaming path — devolver el body directo. El caller tiene que parsearlo
    // con el formato SSE de Anthropic (diferente al de OpenAI).
    if (opts.stream && res.body) {
      return {
        ok: true,
        content: null,
        toolCalls: null,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        body: res.body,
        provider: "anthropic",
        model,
      };
    }

    // Non-streaming: parsear el JSON
    const data = (await res.json()) as AnthropicMessageResponse;

    // content es un array de blocks — extraer el text block y los tool_use blocks
    let contentText: string | null = null;
    const toolCalls: ToolCallResult[] = [];

    for (const block of data.content ?? []) {
      if (block.type === "text") {
        contentText = (contentText ?? "") + block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        });
      }
    }

    return {
      ok: true,
      content: contentText,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens:
          (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      body: null,
      provider: "anthropic",
      model,
    };
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text" | "tool_use";
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Separa los mensajes system del resto y los consolida en un solo string.
 * Anthropic acepta solo un system prompt top-level, no inline en messages[].
 */
function splitSystemAndMessages(
  messages: ChatMessage[],
): { system: string | null; messages: Array<{ role: "user" | "assistant"; content: unknown }> } {
  const systemParts: string[] = [];
  const out: Array<{ role: "user" | "assistant"; content: unknown }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
    } else if (msg.role === "tool") {
      // Tool results se traducen a un user message con content block tool_result
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_result",
          id: msg.tool_call_id,
          text: msg.content,
        } as AnthropicContentBlock,
      ];
      out.push({ role: "user", content });
    } else {
      // user/assistant pasan directo
      out.push({ role: msg.role, content: msg.content });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : null,
    messages: out,
  };
}

/**
 * Traduce las tool definitions del formato OpenAI/Groq al formato Anthropic.
 * OpenAI usa {type: "function", function: {name, description, parameters}}
 * Anthropic usa {name, description, input_schema}
 */
function translateToolsToAnthropic(tools: unknown[]): Array<{
  name: string;
  description: string;
  input_schema: unknown;
}> {
  return tools
    .map((t) => {
      const tool = t as {
        type?: string;
        function?: {
          name: string;
          description: string;
          parameters: unknown;
        };
      };
      if (!tool.function) return null;
      return {
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

function errorResponse(error: string, model: string): LLMResponse {
  return {
    ok: false,
    content: null,
    toolCalls: null,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    body: null,
    provider: "anthropic",
    model,
    error,
  };
}
