import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
// Single source de los nombres de modelo de Groq: es el archivo que se toca
// cuando Groq da de baja alguno (pasó en 2026-09 y dejó mudo medio sistema).
import { groqProvider as groqRegistry } from "@/lib/llm-providers/groq";

// AI providers — uses env vars (never hardcoded secrets)
// Priority: ANTHROPIC > GROQ (free tier) > OPENAI

export const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
// Anthropic Haiku 4.5 is preferred (fast + cheap + Spanish-native).
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
function pickChatModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropicProvider("claude-haiku-4-5-20251001");
  }
  if (process.env.GROQ_API_KEY) {
    return groqProvider.chat(groqModels.cheap);
  }
  if (process.env.XAI_API_KEY) {
    return xaiProvider("grok-4-fast-non-reasoning");
  }
  if (process.env.OPENAI_API_KEY) {
    return openaiProvider("gpt-4o-mini");
  }
  // No key configured — return Anthropic stub. Calls will fail at runtime
  // and the caller (generateText try/catch) returns the safe fallback.
  return anthropicProvider("claude-haiku-4-5-20251001");
}

function pickSmartModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropicProvider("claude-sonnet-4-6");
  }
  if (process.env.GROQ_API_KEY) {
    return groqProvider.chat(groqModels.balanced);
  }
  if (process.env.XAI_API_KEY) {
    return xaiProvider("grok-4");
  }
  if (process.env.OPENAI_API_KEY) {
    return openaiProvider("gpt-4o");
  }
  return anthropicProvider("claude-sonnet-4-6");
}

export const chatModel = pickChatModel();
export const smartModel = pickSmartModel();
export const fallbackChatModel = openaiProvider("gpt-4o-mini");
