/**
 * lib/llm-providers/groq.ts
 *
 * Provider Groq — wrapper sobre fetchGroqWithRetry existente.
 * Expone la interfaz LLMProvider para uso desde llm-router.
 */

import { fetchGroqWithRetry } from "@/lib/groq-fetch";
import type { LLMCallOptions, LLMProvider, LLMResponse, ToolCallResult } from "./types";
import { contenidoComoTexto, ERROR_SIN_VISION, hayImagenes } from "./types";
import { aMensajesOpenAI } from "@/lib/ia-proveedores/traduccion";

export const groqProvider: LLMProvider = {
  name: "groq",

  /**
   * ⚠️ Groq DA DE BAJA modelos sin aviso y el error es un 404 con
   * `model_not_found` — que el router traduce a «no pude responder», así que
   * desde el chat parece un problema de conexión y no un modelo muerto.
   *
   * Verificado 2026-09-04: los tres `llama-*` que estaban acá (3.1-8b-instant,
   * 3.3-70b-versatile, llama-4-scout) ya NO existen en la cuenta; el asistente
   * entero estaba caído. Reemplazados por los `gpt-oss` que Groq sirve hoy,
   * probados con tool-calling (que es lo que el asistente necesita: sin tools
   * no puede ni leer datos ni anotar nada).
   *
   * Para revisar qué hay disponible:
   *   curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
   */
  models: {
    cheap: "openai/gpt-oss-20b",
    balanced: "openai/gpt-oss-120b",
    premium: "openai/gpt-oss-120b",
  },

  isAvailable() {
    return Boolean(process.env.GROQ_API_KEY);
  },

  async chat(opts: LLMCallOptions, model: string): Promise<LLMResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return errorResponse("GROQ_API_KEY not configured", model);
    }

    // Los modelos de Groq que sirve la plataforma no leen fotos: decirlo claro
    // en vez de mandarlas como texto y que el modelo invente lo que «vio».
    if (hayImagenes(opts.messages)) return errorResponse(ERROR_SIN_VISION, model);

    const payload: Record<string, unknown> = {
      model,
      // `aMensajesOpenAI` pone `type: "function"` en cada tool_call: las que vienen
      // del adaptador del negocio (ADR-528) no lo traen y Groq/xAI dan 400.
      messages: aMensajesOpenAI(opts.messages.map((m) => ({ ...m, content: contenidoComoTexto(m.content) }))),
      temperature: opts.temperature,
      max_tokens: opts.maxTokens ?? 1500,
      stream: opts.stream ?? false,
    };
    if (opts.tools && opts.tools.length > 0) {
      payload.tools = opts.tools;
      payload.tool_choice = opts.toolChoice ?? "auto";
    }
    /**
     * Los `gpt-oss` piensan en voz alta antes de contestar, y ese razonamiento
     * SALE del mismo `max_tokens` que la respuesta: una pregunta simple gastaba
     * 94 tokens de los que 55 eran deliberación. Con esfuerzo bajo el mismo
     * resumen sale en 39 y el contenido llega igual (medido 2026-09-04).
     *
     * Importa el doble acá porque la cuenta es free tier y el límite se cuenta
     * POR MINUTO: cada token de razonamiento es un token que le falta a la
     * llamada siguiente, que es justo la que anota la operación.
     */
    if (model.includes("gpt-oss")) {
      payload.reasoning_effort = "low";
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
