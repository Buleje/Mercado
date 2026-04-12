import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

// AI providers — uses env vars (never hardcoded secrets)
// ANTHROPIC_API_KEY and OPENAI_API_KEY must be set in .env

export const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default model for chat (fast + cheap)
export const chatModel = anthropicProvider("claude-haiku-4-5-20251001");

// Smart model for complex tasks (recommendations, analysis)
export const smartModel = anthropicProvider("claude-sonnet-4-6");

// Fallback: OpenAI for when Anthropic is down
export const fallbackChatModel = openaiProvider("gpt-4o-mini");
