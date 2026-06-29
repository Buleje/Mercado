import "server-only";
import { generateText } from "ai";
import { smartModel } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";
import { aiCostGuard } from "@/lib/ai/cost-control";
import {
  processSafeInput,
  detectPromptInjection,
} from "@/lib/ai-safety/sanitize";
import {
  searchProductsCrossTenant,
  formatCrossTenantResults,
  type CrossTenantProduct,
} from "../cross-tenant-search";
import type {
  ConversationContext,
  ActionResult,
  Classification,
} from "../types";

// ─── Handler ──────────────────────────────────────────────────────────────────

/**
 * Recommend products from the marketplace based on a free-text customer need.
 *
 * Flow:
 *  1. Pick a search seed from `classification.productQuery` (or full message).
 *  2. Search cross-tenant marketplace (top 8 candidates).
 *  3. Ask the smart LLM to pick the best 3 and write a natural Peruvian-Spanish
 *     reply with reasoning ("te recomiendo X porque...").
 *  4. Append a numbered list (1-3) so the customer can reply with a number to
 *     add to cart (existing cart-add handler).
 *
 * Falls back to the formatted cross-tenant list if the LLM fails or no key.
 * Never throws.
 */
const RECOMMEND_COST_USD = 0.005;

const FALLBACK_BUDGET: ActionResult = {
  reply:
    "Por ahora no puedo recomendarte productos personalizados. Escribí *catálogo* para ver lo disponible.",
  newState: "browsing",
};

export async function recommendHandler(
  ctx: ConversationContext,
  classification: Classification,
): Promise<ActionResult> {
  // F2 AI-COST: smartModel recomendación → guard antes de llamar
  if (!await aiCostGuard.canSpend(ctx.tenantId, RECOMMEND_COST_USD)) {
    logger.warn("[recommend-handler] presupuesto agotado", {
      tenantId: ctx.tenantId.slice(-6),
    });
    return FALLBACK_BUDGET;
  }

  // F5 Sanitización anti-injection del mensaje del cliente
  const rawSeed = (classification.productQuery ?? ctx.message).trim();
  const injectionCheck = detectPromptInjection(rawSeed);
  if (injectionCheck.severity === "high") {
    logger.warn("[recommend-handler] prompt injection detectado", {
      tenantId: ctx.tenantId.slice(-6),
      snippet: rawSeed.slice(0, 60),
    });
    return FALLBACK_BUDGET;
  }
  const seed = processSafeInput(rawSeed);

  // ── 1. Marketplace search ────────────────────────────────────────────────
  let candidates: CrossTenantProduct[] = [];
  try {
    candidates = await searchProductsCrossTenant({
      query: seed || "popular",
      limit: 8,
    });
  } catch (err) {
    logger.error("[recommend-handler] cross-tenant search failed", {
      tenantId: ctx.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (candidates.length === 0) {
    return {
      reply:
        `No encontré productos para *"${seed}"* en el marketplace.\n\n` +
        `Probá con otra palabra (ej: *"arroz"*, *"pollo"*, *"snacks"*) o escribí *catálogo* para ver lo destacado.`,
      newState: "browsing",
    };
  }

  // Take top 3 candidates (already sorted by rating + price).
  const picks = candidates.slice(0, 3);

  // ── 2. Build natural reply via LLM ───────────────────────────────────────
  // Sanitizar ctx.message independientemente (puede diferir de seed)
  const safeMessage = processSafeInput(ctx.message);
  const naturalReply = await buildNaturalRecommendation(safeMessage, picks);
  aiCostGuard.recordSpend(ctx.tenantId, RECOMMEND_COST_USD);

  // ── 3. Append numbered list (so cart-add handler picks up) ───────────────
  const numbered = formatCrossTenantResults(picks, seed || "recomendados");

  return {
    reply: `${naturalReply}\n\n${numbered}`,
    newState: "browsing",
  };
}

// ─── Natural-language reply generator ────────────────────────────────────────

/**
 * Asks the smart model to write a friendly Peruvian-Spanish opener that
 * justifies the picks. Falls back to a static opener on any failure.
 */
async function buildNaturalRecommendation(
  customerMessage: string,
  picks: CrossTenantProduct[],
): Promise<string> {
  const fallback =
    `🌟 *Te recomiendo estas opciones del marketplace:*\n` +
    `_(elegidas por mejor calificación y precio)_`;

  if (picks.length === 0) return fallback;

  // SECURITY 2026-05-12 (H1 audit AI re-fix): sanitizar p.name y p.storeName
  // antes de interpolar al LLM. El vendor controla esos campos → indirect
  // prompt injection. processSafeInput escapa quotes/newlines/control chars.
  const productsTxt = picks
    .map(
      (p, i) =>
        `${i + 1}. ${processSafeInput(p.name)} — S/${p.price.toFixed(2)} (${processSafeInput(p.storeName)}, rating ${p.rating.toFixed(1)})`,
    )
    .join("\n");

  const system = `Eres un asesor amable de un marketplace peruano (Pucallpa) en WhatsApp.
Hablas español-Perú natural, breve, cálido, sin formalismos. Usa "te recomiendo", "vas a quedar contento", "pa' que pruebes".
Tu tarea: escribir un mensaje de 2-3 líneas que abre la recomendación, explicando por qué estos productos encajan con lo que pidió el cliente.

Reglas estrictas:
- NO listes precios ni números — eso va aparte.
- NO inventes productos que no estén en la lista.
- Si el cliente pidió algo específico (ej: "parrilla"), conecta los productos con ese contexto.
- Máximo 60 palabras.
- Cierra con una frase corta tipo "mira las opciones abajo" o "te paso 3 ideas:".`;

  const prompt = `Mensaje del cliente: "${customerMessage}"

Productos disponibles del marketplace:
${productsTxt}

Escribe el mensaje de apertura (2-3 líneas, máximo 60 palabras).`;

  try {
    const { text } = await generateText({
      model: smartModel,
      system,
      prompt,
      maxOutputTokens: 200,
    });
    const cleaned = text.trim();
    if (cleaned.length === 0) return fallback;
    return cleaned;
  } catch (err) {
    logger.warn("[recommend-handler] LLM reply failed, using fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}
