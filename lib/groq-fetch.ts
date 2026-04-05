import "server-only";

/**
 * lib/groq-fetch.ts
 *
 * Wrapper for Groq API calls with:
 * - Retry with exponential backoff (max 2 retries)
 * - Token usage extraction
 * - Structured error handling
 */

import { logger } from "@/lib/logger";

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

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

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
