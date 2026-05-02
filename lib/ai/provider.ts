import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

// AI providers — uses env vars (never hardcoded secrets)
// Priority: ANTHROPIC > GROQ (free tier) > OPENAI

export const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Groq via OpenAI-compatible endpoint (free tier: 14k req/day on llama-3.3-70b)
// Get a key at https://console.groq.com/keys
export const groqProvider = createOpenAI({
  apiKey: process.env.GROQ_API_KEY ?? "",
  baseURL: "https://api.groq.com/openai/v1",
});

export type AIProviderName = "anthropic" | "groq" | "openai" | "none";

export function getActiveProvider(): AIProviderName {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

// Auto-selects the best available chat model.
// Anthropic Haiku 4.5 is preferred (fast + cheap + Spanish-native).
// Falls back to Groq llama-3.3-70b (free tier) when no Anthropic key.
// Last resort: OpenAI gpt-4o-mini.
function pickChatModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropicProvider("claude-haiku-4-5-20251001");
  }
  if (process.env.GROQ_API_KEY) {
    return groqProvider("llama-3.3-70b-versatile");
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
    return groqProvider("llama-3.3-70b-versatile");
  }
  if (process.env.OPENAI_API_KEY) {
    return openaiProvider("gpt-4o");
  }
  return anthropicProvider("claude-sonnet-4-6");
}

export const chatModel = pickChatModel();
export const smartModel = pickSmartModel();
export const fallbackChatModel = openaiProvider("gpt-4o-mini");
