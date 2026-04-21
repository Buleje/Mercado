import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { SearchSuggestionsDB } from "@/lib/db/search-suggestions.db";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  q:     z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(30).optional().default(12),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { q, limit } = parsed.data;
    const prefix = q.trim();

    logger.debug("search/suggestions", { requestId, tenantId, prefix });

    // Cache 30s por tenant + prefix — corto porque el catálogo cambia y el
    // autocomplete debe reflejar nuevos productos rápido. Suficiente para
    // amortiguar bursts de typing pero sin servir resultados muy stale.
    const cacheKey = `search-suggestions:v2:${tenantId}:${prefix.toLowerCase()}:${limit}`;
    const suggestions = await getOrSet(cacheKey, 30, () =>
      SearchSuggestionsDB.getMarketplaceAutocomplete(tenantId, prefix, limit),
    );

    const grouped = {
      queries: suggestions.filter((s) => s.type === "query"),
      stores: suggestions.filter((s) => s.type === "store"),
      products: suggestions.filter((s) => s.type === "product"),
      categories: suggestions.filter((s) => s.type === "category"),
    };

    return NextResponse.json({
      query: prefix,
      suggestions,
      groups: grouped,
      total: suggestions.length,
      // Backward compatibility for old consumers expecting plain text suggestions
      data: suggestions
        .filter((s) => s.type === "query")
        .map((s) => ({ suggestion: s.label, searchCount: s.searchCount ?? 0 })),
    });
  } catch (err) {
    logger.error("search/suggestions: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
