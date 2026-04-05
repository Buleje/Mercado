import "server-only";

/**
 * lib/ai-config.ts
 *
 * Central AI configuration — manages multiple free AI providers.
 * Supports: Groq (Llama), Google Gemini, xAI Grok.
 *
 * Priority order: Groq → Google Gemini → xAI Grok → Fallback (rule-based)
 *
 * To add your API key:
 *   1. Open the .env file in bodega-san-martin/
 *   2. Paste your key in the corresponding line
 *   3. Restart the dev server (npm run dev)
 */

import { logger } from "@/lib/logger";

// ── Provider types ─────────────────────────────────────────────────────────

export type AIProvider = "groq" | "google" | "xai" | "none";

export interface AIProviderConfig {
  id: AIProvider;
  name: string;
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  maxTokens: number;
  isConfigured: boolean;
}

export interface AIStatusSummary {
  activeProvider: AIProvider;
  activeProviderName: string;
  providers: {
    id: AIProvider;
    name: string;
    configured: boolean;
    envVar: string;
    setupUrl: string;
  }[];
  hasAnyProvider: boolean;
}

// ── Provider configurations ────────────────────────────────────────────────

function getProviders(): AIProviderConfig[] {
  return [
    {
      id: "groq",
      name: "Groq (Llama 3.1)",
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: "https://api.groq.com/openai/v1/chat/completions",
      model: "llama-3.1-8b-instant",
      maxTokens: 500,
      isConfigured: !!process.env.GROQ_API_KEY,
    },
    {
      id: "google",
      name: "Google Gemini",
      apiKey: process.env.GOOGLE_AI_API_KEY,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      model: "gemini-2.0-flash",
      maxTokens: 500,
      isConfigured: !!process.env.GOOGLE_AI_API_KEY,
    },
    {
      id: "xai",
      name: "xAI Grok",
      apiKey: process.env.XAI_API_KEY,
      baseUrl: "https://api.x.ai/v1/chat/completions",
      model: "grok-3-mini",
      maxTokens: 500,
      isConfigured: !!process.env.XAI_API_KEY,
    },
  ];
}

// ── Get the active provider (first one with a key) ─────────────────────────

export function getActiveProvider(): AIProviderConfig | null {
  const providers = getProviders();
  return providers.find(p => p.isConfigured) ?? null;
}

export function getActiveProviderName(): string {
  const provider = getActiveProvider();
  return provider?.name ?? "Sin IA configurada";
}

// ── Status for the frontend ────────────────────────────────────────────────

export function getAIStatus(): AIStatusSummary {
  const providers = getProviders();
  const active = getActiveProvider();

  return {
    activeProvider: active?.id ?? "none",
    activeProviderName: active?.name ?? "Sin IA",
    providers: [
      {
        id: "groq",
        name: "Groq (Llama 3.1)",
        configured: providers[0].isConfigured,
        envVar: "GROQ_API_KEY",
        setupUrl: "https://console.groq.com",
      },
      {
        id: "google",
        name: "Google Gemini",
        configured: providers[1].isConfigured,
        envVar: "GOOGLE_AI_API_KEY",
        setupUrl: "https://aistudio.google.com/apikey",
      },
      {
        id: "xai",
        name: "xAI Grok",
        configured: providers[2].isConfigured,
        envVar: "XAI_API_KEY",
        setupUrl: "https://console.x.ai",
      },
    ],
    hasAnyProvider: !!active,
  };
}

// ── Universal chat completion ──────────────────────────────────────────────

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIChatResponse {
  ok: boolean;
  content: string;
  provider: AIProvider;
  tokensUsed?: number;
  error?: string;
}

/**
 * Send a chat completion to the best available AI provider.
 * Falls through: Groq → Google Gemini → xAI Grok → error.
 */
export async function chatCompletion(
  messages: AIChatMessage[],
  options?: { maxTokens?: number; temperature?: number },
): Promise<AIChatResponse> {
  const provider = getActiveProvider();

  if (!provider) {
    return {
      ok: false,
      content: "",
      provider: "none",
      error: "No hay proveedor de IA configurado. Agrega una API key en el archivo .env",
    };
  }

  const maxTokens = options?.maxTokens ?? provider.maxTokens;
  const temperature = options?.temperature ?? 0.7;

  try {
    if (provider.id === "google") {
      return await callGoogleGemini(provider, messages, maxTokens, temperature);
    }
    // Groq and xAI both use OpenAI-compatible API
    return await callOpenAICompatible(provider, messages, maxTokens, temperature);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[ai-config] ${provider.name} failed`, { error: errMsg });

    // Try next provider as fallback
    const providers = getProviders();
    const currentIdx = providers.findIndex(p => p.id === provider.id);
    for (let i = currentIdx + 1; i < providers.length; i++) {
      if (!providers[i].isConfigured) continue;
      try {
        if (providers[i].id === "google") {
          return await callGoogleGemini(providers[i], messages, maxTokens, temperature);
        }
        return await callOpenAICompatible(providers[i], messages, maxTokens, temperature);
      } catch {
        continue;
      }
    }

    return {
      ok: false,
      content: "",
      provider: provider.id,
      error: `Todos los proveedores de IA fallaron: ${errMsg}`,
    };
  }
}

// ── OpenAI-compatible call (Groq, xAI) ─────────────────────────────────────

async function callOpenAICompatible(
  provider: AIProviderConfig,
  messages: AIChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<AIChatResponse> {
  const res = await fetch(provider.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`${provider.name} HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const tokensUsed = data.usage?.total_tokens;

  return {
    ok: true,
    content: content.trim(),
    provider: provider.id,
    tokensUsed,
  };
}

// ── Google Gemini call ─────────────────────────────────────────────────────

async function callGoogleGemini(
  provider: AIProviderConfig,
  messages: AIChatMessage[],
  maxTokens: number,
  temperature: number,
): Promise<AIChatResponse> {
  // Convert OpenAI format to Gemini format
  const systemInstruction = messages.find(m => m.role === "system")?.content;
  const contents = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url = `${provider.baseUrl}/${provider.model}:generateContent?key=${provider.apiKey}`;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Google Gemini HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const tokensUsed = data.usageMetadata?.totalTokenCount;

  return {
    ok: true,
    content: content.trim(),
    provider: "google",
    tokensUsed,
  };
}
