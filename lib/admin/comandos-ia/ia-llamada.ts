/**
 * Llamada a la IA de Comandos IA: costo por el modelo que DE VERDAD respondió,
 * tope de espera y el «sin clave» separado del «no respondió».
 *
 * `callLLM` no cuenta el gasto ni corta: el tier `balanced` usa grok-3 ($3/$15)
 * si hay XAI_API_KEY, así que un precio fijo por token registraba hasta 7,8
 * veces menos. Aquí el gasto se anota al llegar la respuesta, aunque el tope
 * de espera ya haya vencido (la IA cobra igual).
 */
import { callLLM, resolveLLMRoute, type LLMTier } from "@/lib/llm-router";
import { anthropicProvider, groqProvider, xaiProvider } from "@/lib/llm-providers";
import type { LLMCallOptions, LLMProvider, LLMResponse } from "@/lib/llm-providers/types";
import { calculateCostUsd } from "@/lib/ai/track-usage";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { logger } from "@/lib/logger";

/** Más que esto y el dueño ya se fue: mejor la plantilla o un «reintenta». */
export const ESPERA_IA_MS = 25_000;

export type ResultadoIa =
  | { ok: true; res: LLMResponse; costoIaUsd: number }
  | { ok: false; motivo: "sin-clave" | "tardo" | "fallo" };

/**
 * Quién puede responder cada tier (mismo reparto que TIER_CONFIG de lib/llm-router.ts).
 * Solo decide el aviso: sin ninguna clave, «reintenta» no sirve.
 */
const PROVEEDORES: Record<LLMTier, LLMProvider[]> = {
  cheap: [groqProvider],
  balanced: [xaiProvider, groqProvider],
  premium: [xaiProvider, anthropicProvider, groqProvider],
};

export function iaConectada(tier: LLMTier): boolean {
  return PROVEEDORES[tier].some((p) => p.isAvailable());
}

/** Costo estimado ANTES de llamar, con el precio del modelo que va a responder. */
export function estimadoIaUsd(tier: LLMTier, tokensEntrada: number, tokensSalida: number): number {
  return calculateCostUsd(resolveLLMRoute(tier).model, { promptTokens: tokensEntrada, completionTokens: tokensSalida });
}

export function costoDeRespuesta(res: LLMResponse): number {
  return calculateCostUsd(res.model, res.usage);
}

export async function llamarIa(tenantId: string, tier: LLMTier, opts: LLMCallOptions, ctx: string): Promise<ResultadoIa> {
  if (!iaConectada(tier)) return { ok: false, motivo: "sin-clave" };
  const llamada = callLLM(tier, opts).then((res) => {
    if (res.ok) {
      aiCostGuard.recordSpend(tenantId, costoDeRespuesta(res)).catch((err) => logger.error(`[${ctx}] recordSpend`, { err: String(err) }));
    }
    return res;
  });
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<null>((resolve) => {
    reloj = setTimeout(() => resolve(null), ESPERA_IA_MS);
  });
  try {
    const res = await Promise.race([llamada, tope]);
    if (!res) {
      logger.warn(`[${ctx}] la IA tardó más de ${ESPERA_IA_MS / 1000} s`);
      return { ok: false, motivo: "tardo" };
    }
    if (!res.ok) {
      logger.warn(`[${ctx}] IA no disponible`, { err: res.error?.slice(0, 160), model: res.model });
      return { ok: false, motivo: "fallo" };
    }
    return { ok: true, res, costoIaUsd: costoDeRespuesta(res) };
  } catch (err) {
    logger.error(`[${ctx}] la IA falló`, { err: String(err) });
    return { ok: false, motivo: "fallo" };
  } finally {
    clearTimeout(reloj);
  }
}
