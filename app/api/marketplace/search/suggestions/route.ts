import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { SearchSuggestionsDB } from "@/lib/db/search-suggestions.db";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  q:     z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
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

    // Cache 5 minutos por tenant + prefix
    const cacheKey = `search-suggestions:${tenantId}:${prefix.toLowerCase()}`;
    const suggestions = await getOrSet(cacheKey, 300, () =>
      SearchSuggestionsDB.getTopSuggestions(tenantId, prefix, limit),
    );

    return NextResponse.json({ suggestions, total: suggestions.length });
  } catch (err) {
    logger.error("search/suggestions: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
