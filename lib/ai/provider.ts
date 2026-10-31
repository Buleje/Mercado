import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
// Single source de los nombres de modelo de Groq: es el archivo que se toca
// cuando Groq da de baja alguno (pasó en 2026-09 y dejó mudo medio sistema).
import { groqProvider as groqRegistry } from "@/lib/llm-providers/groq";
import { MODEL_IDS, rejectsSamplingParams } from "@/lib/claude-router";

// AI providers — uses env vars (never hardcoded secrets)
// Priority: ANTHROPIC > GROQ (free tier) > OPENAI

/** Lo que Claude puede razonar además de la respuesta (cuenta dentro de `max_tokens`). */
const MARGEN_RAZONAMIENTO = 1_024;

/**
 * Los Claude vigentes (Haiku 5.5, Sonnet 5.5, Opus 5.5) cambian dos cosas que
 * el `@ai-sdk/anthropic` instalado todavía no conoce, porque no tiene esos IDs
 * en su tabla de modelos:
 *
 * 1. `temperature` / `top_p` / `top_k` distintos del default son un **400**. Los
 *    consumidores de `chatModel` mandan 0,7-0,8 porque el mismo modelo puede ser
 *    Groq u OpenAI, donde sí sirve. Acá se quitan sólo para Claude.
 * 2. Razonan por defecto (adaptativo, effort `medium` en Haiku 5.5 y `high` en
 *    Sonnet 5.5) y ese razonamiento cuenta dentro de `max_tokens`: una
 *    descripción con tope de 200 puede gastarlo pensando y volver vacía. Sin
 *    `effort` ni `thinking` explícitos se pide `effort: "low"` —lo que la skill
 *    `claude-api` indica para chat y rutas cortas, y lo más parecido a Haiku 4.5,
 *    que no razonaba— y se suma un margen al tope.
 *
 * Mismo patrón que `fetchConRazonamientoBajo` de Groq: una sola puerta, para no
 * depender de que cada llamada se acuerde.
 */
const fetchClaudeVigente: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const payload = JSON.parse(init.body) as Record<string, unknown>;
      if (typeof payload.model === "string" && rejectsSamplingParams(payload.model)) {
        delete payload.temperature;
        delete payload.top_p;
        delete payload.top_k;
        const outputConfig = (payload.output_config ?? {}) as Record<string, unknown>;
        if (payload.thinking === undefined && outputConfig.effort === undefined) {
          payload.output_config = { ...outputConfig, effort: "low" };
          if (typeof payload.max_tokens === "number") payload.max_tokens += MARGEN_RAZONAMIENTO;
        }
        init = { ...init, body: JSON.stringify(payload) };
      }
    } catch {
      // Body que no es JSON: no es una llamada a Messages, se deja intacta.
    }
  }
  return fetch(input, init);
};

export const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetch: fetchClaudeVigente,
});

export const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Groq via OpenAI-compatible endpoint (free tier).
// Get a key at https://console.groq.com/keys
/**
 * Los `gpt-oss` que Groq sirve hoy PIENSAN EN VOZ ALTA antes de contestar, y ese
 * razonamiento sale por el mismo canal que la respuesta. Quien pide JSON —el
 * clasificador de intención del Concierge, las descripciones de producto— recibe
 * la deliberación por delante y no encuentra el JSON («no JSON in response»).
 *
 * `reasoning_effort: "low"` lo corta. Se inyecta acá, en el `fetch`, y no en cada
 * llamada: son diez y pico los consumidores de este archivo y olvidarse en uno
 * sería un fallo silencioso más. `lib/llm-providers/groq.ts` hace lo mismo en su
 * propio armador de payload; esta es la otra puerta a Groq del sistema.
 */
const fetchConRazonamientoBajo: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const payload = JSON.parse(init.body) as Record<string, unknown>;
      if (typeof payload.model === "string" && payload.model.includes("gpt-oss")) {
        payload.reasoning_effort = "low";
        init = { ...init, body: JSON.stringify(payload) };
      }
    } catch {
      // Body que no es JSON: no es una llamada de chat, se deja intacta.
    }
  }
  return fetch(input, init);
};

export const groqProvider = createOpenAI({
  apiKey: process.env.GROQ_API_KEY ?? "",
  baseURL: "https://api.groq.com/openai/v1",
  fetch: fetchConRazonamientoBajo,
});

const groqModels = groqRegistry.models;

// xAI Grok via OpenAI-compatible endpoint
// Get a key at https://console.x.ai/
export const xaiProvider = createOpenAI({
  apiKey: process.env.XAI_API_KEY ?? "",
  baseURL: "https://api.x.ai/v1",
});

export type AIProviderName = "anthropic" | "groq" | "xai" | "openai" | "none";

export function getActiveProvider(): AIProviderName {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.XAI_API_KEY) return "xai";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

// Auto-selects the best available chat model.
// Anthropic Haiku 5.5 is preferred (fast + cheap + Spanish-native).
// Falls back to Groq (free tier) when no Anthropic key.
// Last resort: OpenAI gpt-4o-mini.
//
// FIX 2026-09-05 (dos bugs encadenados, los dos silenciosos):
//
//   1. `.chat(...)` en vez de `groqProvider(...)`. En AI SDK 6 llamar al provider
//      como función usa la **Responses API** de OpenAI, que Groq NO implementa:
//      la respuesta llegaba sin el contenido esperado y quien pedía JSON fallaba
//      con «no JSON in response». `.chat()` fuerza `/chat/completions`, que es lo
//      que Groq sí sirve. Verificado contra la API real.
//   2. Los modelos `llama-*` que estaban acá fueron dados de baja por
// Groq y respondían 404 `model_not_found`. Con sólo GROQ_API_KEY configurada
// —el caso real— eso dejaba MUDO a todo lo que cuelga de este archivo: el
// clasificador de intención del Concierge de WhatsApp, el auto-reply del chat,
// el recomendador, el análisis de documentos y las descripciones de producto.
// Se ve en el log como «The model ... does not exist», no como «se rompió el
// bot», que es por qué pasó desapercibido. Los nombres se toman del registro
// de `lib/llm-providers/groq.ts` en vez de repetirse acá: ese es el archivo
// que se actualiza cuando Groq vuelve a mover el catálogo.
//
// Cada elección devuelve también el ID, para que el registro de costo
// (`trackAiUsage`) cobre el modelo que de verdad contestó y no uno re-tipeado.
function pickChatModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { id: MODEL_IDS.haiku, model: anthropicProvider(MODEL_IDS.haiku) };
  }
  if (process.env.GROQ_API_KEY) {
    return { id: groqModels.cheap, model: groqProvider.chat(groqModels.cheap) };
  }
  if (process.env.XAI_API_KEY) {
    return { id: "grok-4-fast-non-reasoning", model: xaiProvider("grok-4-fast-non-reasoning") };
  }
  if (process.env.OPENAI_API_KEY) {
    return { id: "gpt-4o-mini", model: openaiProvider("gpt-4o-mini") };
  }
  // No key configured — return Anthropic stub. Calls will fail at runtime
  // and the caller (generateText try/catch) returns the safe fallback.
  return { id: MODEL_IDS.haiku, model: anthropicProvider(MODEL_IDS.haiku) };
}

function pickSmartModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { id: MODEL_IDS.sonnet, model: anthropicProvider(MODEL_IDS.sonnet) };
  }
  if (process.env.GROQ_API_KEY) {
    return { id: groqModels.balanced, model: groqProvider.chat(groqModels.balanced) };
  }
  if (process.env.XAI_API_KEY) {
    return { id: "grok-4", model: xaiProvider("grok-4") };
  }
  if (process.env.OPENAI_API_KEY) {
    return { id: "gpt-4o", model: openaiProvider("gpt-4o") };
  }
  return { id: MODEL_IDS.sonnet, model: anthropicProvider(MODEL_IDS.sonnet) };
}

const chat = pickChatModel();
const smart = pickSmartModel();

export const chatModel = chat.model;
/** ID del modelo detrás de `chatModel` — el que va a `trackAiUsage`. */
export const chatModelId = chat.id;
export const smartModel = smart.model;
/** ID del modelo detrás de `smartModel` — el que va a `trackAiUsage`. */
export const smartModelId = smart.id;
export const fallbackChatModel = openaiProvider("gpt-4o-mini");
