import "server-only";

/**
 * lib/groq-fetch.ts — Vercel AI Gateway wrapper (2026-04-08+)
 *
 * Wrapper para llamadas al LLM con:
 * - Routing vía **Vercel AI Gateway** si `AI_GATEWAY_API_KEY` está definido o
 *   si `VERCEL_OIDC_TOKEN` está disponible (automático en deploys Vercel).
 * - Fallback a **Groq directo** si no hay Gateway ni OIDC (dev local sin pull).
 * - Retry con exponential backoff (máx 2 retries) en errores 429/5xx.
 * - Extracción de token usage.
 * - Manejo de errores estructurado.
 *
 * Ventajas del Gateway vs Groq directo:
 * - Failover multi-provider (Groq → Anthropic → OpenAI) sin código extra
 * - Observabilidad nativa en el dashboard de Vercel (latencia, tokens, costo)
 * - Cost cap por tenant configurable desde Vercel
 * - Misma API OpenAI-compatible que Groq (cero cambio de payload)
 *
 * Migración: cambiar `GROQ_API_KEY` → `AI_GATEWAY_API_KEY` en Vercel Project
 * Settings. En deploys, `VERCEL_OIDC_TOKEN` se inyecta automáticamente.
 * En dev local, correr `vercel env pull .env.local --yes` al menos 1× por día.
 *
 * Historial: antes usaba `https://api.groq.com/openai/v1/chat/completions`
 * directo. Migrado a AI Gateway 2026-04-08 (ADR 016 Plan Maestro, CC5).
 */

import { logger } from "@/lib/logger";

// ── Gateway configuration ────────────────────────────────────────────────────

/** Base URL del Vercel AI Gateway (OpenAI-compatible). */
const VERCEL_AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

/** URL de fallback: Groq directo (usado solo si no hay Gateway ni OIDC). */
const GROQ_DIRECT_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Decide qué endpoint usar y qué token pasar en el header Authorization.
 *
 * Prioridad:
 *  1. `AI_GATEWAY_API_KEY` — API key explícita del Gateway (dev local)
 *  2. `VERCEL_OIDC_TOKEN`  — inyectado automático en runtime Vercel
 *  3. `apiKey` argumento    — fallback a Groq directo (legacy)
 */
function resolveEndpointAndAuth(apiKey: string): { url: string; token: string; provider: "gateway" | "groq-direct" } {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;

  if (gatewayKey) {
    return { url: VERCEL_AI_GATEWAY_URL, token: gatewayKey, provider: "gateway" };
  }
  if (oidcToken) {
    return { url: VERCEL_AI_GATEWAY_URL, token: oidcToken, provider: "gateway" };
  }
  // Legacy fallback — Groq directo. Conserva compatibilidad 100%.
  return { url: GROQ_DIRECT_URL, token: apiKey, provider: "groq-direct" };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroqUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GroqResponse {
  ok: boolean;
  data?: Record<string, unknown>;
  body?: ReadableStream<Uint8Array>;
  usage?: GroqUsage;
  error?: string;
  attempts: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// ── Fetch with retry ──────────────────────────────────────────────────────────

/**
 * Call the Groq API with automatic retry + exponential backoff.
 * Extracts token usage from the response when available.
 */
export async function fetchGroqWithRetry(
  apiKey: string,
  payload: Record<string, unknown>,
  label = "groq",
): Promise<GroqResponse> {
  const isStream = payload.stream === true;
  let lastError = "";

  const { url, token, provider } = resolveEndpointAndAuth(apiKey);

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (attempt === 1) {
        logger.debug(`[${label}] LLM call`, { provider, url, model: payload.model });
      }

      // Retryable status codes
      if (!res.ok && RETRYABLE_STATUS.has(res.status) && attempt <= MAX_RETRIES) {
        lastError = `HTTP ${res.status}`;
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`[${label}] Retryable error, attempt ${attempt}/${MAX_RETRIES + 1}`, {
          status: res.status,
          delayMs: delay,
        });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Non-retryable error
      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        return { ok: false, error: `HTTP ${res.status}: ${errText}`, attempts: attempt };
      }

      // Streaming — return body directly
      if (isStream && res.body) {
        return { ok: true, body: res.body, attempts: attempt };
      }

      // JSON response — extract usage
      const data = await res.json();
      const usage: GroqUsage | undefined = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          }
        : undefined;

      return { ok: true, data, usage, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      if (attempt <= MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(`[${label}] Network error, attempt ${attempt}/${MAX_RETRIES + 1}`, {
          error: lastError,
          delayMs: delay,
        });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  return { ok: false, error: lastError, attempts: MAX_RETRIES + 1 };
}
