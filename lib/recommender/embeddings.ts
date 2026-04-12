import "server-only";
import { logger } from "@/lib/logger";

/**
 * Embedding dimension for OpenAI text-embedding-3-small. Keep this number in
 * sync with the pgvector column definition in the migration SQL.
 */
export const EMBEDDING_DIM = 1536;
const EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_EMBED_URL = "https://api.openai.com/v1/embeddings";

/**
 * Generate an embedding vector for the given text using OpenAI's
 * text-embedding-3-small. Returns null on any failure so callers can
 * degrade gracefully to LLM-only or co-purchase-only scoring.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: trimmed.slice(0, 8000),
      }),
    });

    if (!res.ok) {
      logger.warn("[embeddings] OpenAI returned non-200", { status: res.status });
      return null;
    }

    const json = (await res.json()) as {
      data?: { embedding?: number[] }[];
    };
    const vec = json.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) return null;
    return vec;
  } catch (err) {
    logger.error("[embeddings] fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Format a number[] as the literal Postgres vector string `'[1,2,3]'`. */
export function toPgVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Cosine similarity between two equal-length vectors. 0..1, where 1 = identical. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
