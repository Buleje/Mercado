import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";
import {
  generateEmbedding,
  toPgVectorLiteral,
  cosineSimilarity,
  EMBEDDING_DIM,
} from "@/lib/recommender/embeddings";

const InputSchema = z.object({
  tenantId: z.string().min(1),
  productId: z.coerce.number().int().positive(),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

export type HybridRec = {
  productId: number;
  name: string;
  price: number;
  vectorScore: number;
  copurchaseScore: number;
  score: number;
};

const WEIGHT_VECTOR = 0.7;
const WEIGHT_COPURCHASE = 0.3;

type VectorRow = { id: number; distance: number };

/**
 * Run a pgvector KNN search. Returns [] when the extension is not
 * installed or when the column does not exist yet — the caller then
 * degrades to co-purchase only.
 */
async function vectorSearch(
  tenantId: string,
  sourceVector: number[],
  excludeId: number,
  limit: number,
): Promise<VectorRow[]> {
  const literal = toPgVectorLiteral(sourceVector);
  try {
    const rows = await prisma.$queryRawUnsafe<VectorRow[]>(
      `
      SELECT id, (embedding <=> $1::vector) AS distance
      FROM "Product"
      WHERE "tenantId" = $2
        AND id <> $3
        AND active = true
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $4
      `,
      literal,
      tenantId,
      excludeId,
      limit * 3,
    );
    return rows;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("vector") || msg.includes("embedding")) {
      logger.info("[recommender-hybrid] pgvector not available, degrading");
      return [];
    }
    logger.warn("[recommender-hybrid] vector search failed", { error: msg });
    return [];
  }
}

type CopurchaseRow = { productId: number; cnt: number };

/**
 * Products that were most frequently bought alongside the source product in
 * paid/delivered orders during the last 90 days. Safe fallback scoring.
 */
async function copurchaseSearch(
  tenantId: string,
  sourceId: number,
  limit: number,
): Promise<CopurchaseRow[]> {
  try {
    const ninety = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRawUnsafe<CopurchaseRow[]>(
      `
      SELECT oi2."productId" AS "productId", COUNT(*)::int AS cnt
      FROM "OrderItem" oi1
      JOIN "OrderItem" oi2 ON oi1."orderId" = oi2."orderId"
      JOIN "Order" o      ON o.id = oi1."orderId"
      WHERE oi1."productId" = $1
        AND oi2."productId" <> $1
        AND o."tenantId" = $2
        AND o."createdAt" >= $3
      GROUP BY oi2."productId"
      ORDER BY cnt DESC
      LIMIT $4
      `,
      sourceId,
      tenantId,
      ninety,
      limit * 3,
    );
    return rows;
  } catch (err) {
    logger.warn("[recommender-hybrid] copurchase query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Hybrid recommender: blends pgvector cosine similarity (70%) with recent
 * co-purchase frequency (30%). If pgvector is not yet installed the blend
 * degrades to pure co-purchase. If co-purchase is empty (new tenant) and
 * pgvector is unavailable the function returns an empty array — the caller
 * should then fall back to the LLM recommender in `lib/ai/recommender.ts`.
 */
export async function getHybridRecommendations(
  tenantId: string,
  productId: number | string,
  limit = 5,
): Promise<{ recommendations: HybridRec[]; source: "hybrid" | "copurchase" | "empty" }> {
  const parsed = InputSchema.safeParse({ tenantId, productId, limit });
  if (!parsed.success) return { recommendations: [], source: "empty" };
  const { tenantId: t, productId: sourceId, limit: safeLimit } = parsed.data;

  const source = await ProductsDB.getById(sourceId);
  if (!source) return { recommendations: [], source: "empty" };

  const embedText = `${source.name} ${source.category ?? ""} ${source.description ?? ""}`;
  const sourceVector = await generateEmbedding(embedText);

  const [vectorRows, copurchaseRows] = await Promise.all([
    sourceVector && sourceVector.length === EMBEDDING_DIM
      ? vectorSearch(t, sourceVector, sourceId, safeLimit)
      : Promise.resolve([] as VectorRow[]),
    copurchaseSearch(t, sourceId, safeLimit),
  ]);

  const candidateIds = new Set<number>();
  vectorRows.forEach((r) => candidateIds.add(r.id));
  copurchaseRows.forEach((r) => candidateIds.add(r.productId));
  if (candidateIds.size === 0) return { recommendations: [], source: "empty" };

  const catalog = await ProductsDB.getAll(t);
  const byId = new Map(catalog.map((p) => [p.id, p]));

  const maxCopurchase = Math.max(1, ...copurchaseRows.map((r) => r.cnt));
  const copurchaseById = new Map(copurchaseRows.map((r) => [r.productId, r.cnt]));
  const vectorDistById = new Map(vectorRows.map((r) => [r.id, r.distance]));

  const recs: HybridRec[] = [];
  for (const id of candidateIds) {
    const p = byId.get(id);
    if (!p || p.active === false) continue;
    const dist = vectorDistById.get(id);
    const vectorScore = dist !== undefined ? Math.max(0, 1 - dist) : 0;
    const copurchaseScore = (copurchaseById.get(id) ?? 0) / maxCopurchase;
    const score = WEIGHT_VECTOR * vectorScore + WEIGHT_COPURCHASE * copurchaseScore;
    recs.push({
      productId: p.id,
      name: p.name,
      price: Number(p.price ?? 0),
      vectorScore,
      copurchaseScore,
      score,
    });
  }

  recs.sort((a, b) => b.score - a.score);
  const top = recs.slice(0, safeLimit);
  const source_: "hybrid" | "copurchase" | "empty" =
    vectorRows.length > 0 ? "hybrid" : top.length > 0 ? "copurchase" : "empty";
  return { recommendations: top, source: source_ };
}

export { cosineSimilarity };
