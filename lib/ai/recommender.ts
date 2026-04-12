import "server-only";
import { generateText } from "ai";
import { z } from "zod";
import { smartModel } from "@/lib/ai/provider";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";

// -- Input validation --

const InputSchema = z.object({
  tenantId: z.string().min(1),
  productId: z.string().min(1),
  limit: z.number().min(1).max(10).optional().default(5),
});

// -- Output type --

export type AIRecommendation = {
  productId: string;
  reason: string;
  score: number;
};

/**
 * AI-powered product recommender.
 * Fetches product data from DB, asks LLM for complementary suggestions,
 * then maps them back to real product IDs.
 */
export async function getRecommendations(
  tenantId: string,
  productId: string,
  limit?: number,
): Promise<{ recommendations: AIRecommendation[]; error?: string }> {
  const parsed = InputSchema.safeParse({ tenantId, productId, limit });
  if (!parsed.success) {
    return { recommendations: [], error: "Datos invalidos" };
  }

  const { limit: safeLimit } = parsed.data;

  try {
    // 1. Fetch the source product + catalog from DB
    const [source, catalog] = await Promise.all([
      ProductsDB.getById(Number(productId)),
      ProductsDB.getAll(tenantId),
    ]);

    if (!source) {
      return { recommendations: [], error: "Producto no encontrado" };
    }

    const others = catalog
      .filter((p) => p.id !== source.id && p.active)
      .slice(0, 50);

    if (others.length === 0) {
      return { recommendations: [] };
    }

    const catalogList = others
      .map((p) => `ID:${p.id} "${p.name}" (${p.category}) S/${p.price}`)
      .join("\n");

    // 2. Ask LLM to pick the best matches
    const { text } = await generateText({
      model: smartModel,
      prompt: `Eres un experto en bodegas peruanas. El cliente mira: "${source.name}" (${source.category}, S/${source.price}).

Catalogo disponible:
${catalogList}

Elige los ${safeLimit} productos mas complementarios. Responde SOLO en JSON array:
[{"productId":"<ID>","reason":"<razon corta en espanol>","score":<0.0-1.0>}]

Sin explicacion extra, solo el JSON array.`,
      maxOutputTokens: 500,
    });

    // 3. Parse response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      logger.warn("[ai-recommender] No JSON array in LLM response");
      return { recommendations: [] };
    }

    const items = JSON.parse(match[0]) as AIRecommendation[];
    return { recommendations: items.slice(0, safeLimit) };
  } catch (err) {
    logger.error("[ai-recommender] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { recommendations: [], error: "Error generando recomendaciones" };
  }
}
