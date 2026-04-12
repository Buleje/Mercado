import "server-only";
/**
 * ADR-047 — AI Metering Middleware.
 *
 * Wrapper para llamadas LLM que registra automáticamente tokens usados
 * en el metering bus. Compatible con el patrón de lib/ai-config.ts.
 *
 * Uso:
 *   const result = await withAIMetering(tenantId, "ai.llm.call", () =>
 *     generateText({ model, prompt })
 *   );
 */
import { emitMeteringEvent } from "./metering-bus";
import type { MeteringEventSource } from "./types";
import { logger } from "@/lib/logger";

export interface AICallResult {
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  [key: string]: unknown;
}

/**
 * Wraps an AI SDK call and reports token usage to the metering bus.
 * Fire-and-forget: el metering no bloquea la respuesta al usuario.
 *
 * @param tenantId   Tenant que realiza la llamada (del server session)
 * @param source     Tipo de evento: "ai.llm.call" | "ai.recommend.call" | "ai.insight.call"
 * @param callFn     Función que ejecuta la llamada al LLM
 * @param requestId  Opcional — clave de idempotency para deduplication
 */
export async function withAIMetering<T extends AICallResult>(
  tenantId: string,
  source: Extract<
    MeteringEventSource,
    "ai.llm.call" | "ai.recommend.call" | "ai.insight.call"
  >,
  callFn: () => Promise<T>,
  requestId?: string,
): Promise<T> {
  const result = await callFn();

  // Emitir tokens consumidos — fire-and-forget
  const totalTokens = result.usage?.totalTokens ?? 1;
  const amount = Math.max(1, Math.min(10_000, totalTokens));

  try {
    emitMeteringEvent({
      source,
      tenantId,
      amount,
      idempotencyKey: requestId,
      metadata: {
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
      },
    });
  } catch (err) {
    logger.warn("[ai-metering-middleware] emit failed", {
      tenantId,
      source,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

/**
 * Versión simplificada para callers que solo quieren emitir 1 unidad
 * (recomendaciones, insights) sin datos de tokens.
 */
export function reportAICall(
  tenantId: string,
  source: Extract<
    MeteringEventSource,
    "ai.llm.call" | "ai.recommend.call" | "ai.insight.call"
  >,
  requestId?: string,
): void {
  emitMeteringEvent({
    source,
    tenantId,
    amount: 1,
    idempotencyKey: requestId,
  });
}
