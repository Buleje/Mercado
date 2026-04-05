import "server-only";
import { cacheStore } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * LLM Response Cache
 *
 * Caches AI responses for identical/similar queries to reduce API costs.
 * Uses simple normalized-key matching (not semantic similarity).
 *
 * TTL is short (3 min) because business data changes frequently.
 */

const LLM_CACHE_TTL = 180; // 3 minutes

/**
 * Normalize a query for cache key matching.
 * - Lowercase
 * - Strip punctuation and extra whitespace
 * - Sort words (order-independent matching)
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[¿?¡!.,;:'"(){}[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(w => w.length > 2) // drop tiny words
    .sort()
    .join(" ");
}

/**
 * Build a cache key for an LLM query.
 */
function buildKey(tenantId: string, channel: string, query: string): string {
  const normalized = normalizeQuery(query);
  return `llm:${tenantId}:${channel}:${normalized}`;
}

export interface CachedLLMResponse {
  response: string;
  cachedAt: number;
}

/**
 * Try to get a cached LLM response.
 * Returns null if no cache hit.
 */
export function getCachedLLMResponse(
  tenantId: string,
  channel: string,
  query: string
): CachedLLMResponse | null {
  const key = buildKey(tenantId, channel, query);
  return cacheStore.get<CachedLLMResponse>(key);
}

/**
 * Cache an LLM response for future identical queries.
 */
export function setCachedLLMResponse(
  tenantId: string,
  channel: string,
  query: string,
  response: string
): void {
  const key = buildKey(tenantId, channel, query);
  const entry: CachedLLMResponse = { response, cachedAt: Date.now() };
  cacheStore.set(key, entry, LLM_CACHE_TTL);
  logger.debug("[llm-cache] cached response", { key: key.slice(0, 60) });
}
