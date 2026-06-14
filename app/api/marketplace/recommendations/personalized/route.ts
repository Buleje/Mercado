import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { RecommendationsPersonalizedDB } from "@/lib/db/recommendations-personalized.db";
import { getOrSet } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/** "1,2,3" → [1,2,3] (descarta no-numéricos, dedup, cap 50). */
function csvToNumbers(csv?: string): number[] {
  if (!csv) return [];
  const out = new Set<number>();
  for (const part of csv.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) out.add(n);
    if (out.size >= 50) break;
  }
  return [...out];
}

/** "Bebidas,Snacks" → ["Bebidas","Snacks"] (trim, sin vacíos, cap 20). */
function csvToStrings(csv?: string): string[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** Hash corto y estable de las señales para la cacheKey. */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const QuerySchema = z.object({
  customerId:       z.string().optional(),
  customerPhone:    z.string().optional(),
  storeSlug:        z.string().optional(),
  // Señales de sesión de visitante anónimo (CSV en query → parse en handler).
  viewedProductIds: z.string().optional(),
  viewedCategories: z.string().optional(),
  zone:             z.string().optional(),
  limit:            z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    // SECURITY 2026-05-06 (audit AI #17): exigir header x-tenant-id real.
    // Antes el fallback "main" hacía que requests sin proxy (cron, test,
    // direct-IP) leyeran el tenant "main" silenciosamente.
    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId || tenantId === "main") {
      return NextResponse.json(
        { error: "tenant header requerido" },
        { status: 400 },
      );
    }
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { customerId, customerPhone, storeSlug, limit } = parsed.data;
    const customerKey = customerId ?? customerPhone ?? "anonymous";
    const isLoggedIn = Boolean(customerId || customerPhone);

    // Señales de sesión (visitante anónimo) — solo relevantes sin login.
    const viewedProductIds = csvToNumbers(parsed.data.viewedProductIds);
    const viewedCategories = csvToStrings(parsed.data.viewedCategories);
    const zone = parsed.data.zone?.trim() || undefined;
    const hasSignals =
      !isLoggedIn &&
      (viewedProductIds.length > 0 || viewedCategories.length > 0 || Boolean(zone));

    logger.debug("recommendations/personalized", {
      requestId,
      tenantId,
      customerKey,
      hasSignals,
    });

    // Cache 1 hora. Para anónimos con señales, el hash de las señales hace
    // que cada combinación distinta de vistos/categorías tenga su entrada.
    const signalsHash = hasSignals
      ? shortHash(`${viewedProductIds.join(",")}|${viewedCategories.join(",")}|${zone ?? ""}|${limit}`)
      : null;
    const cacheKey = hasSignals
      ? `recommendations-personalized:${tenantId}:signals:${signalsHash}`
      : `recommendations-personalized:${tenantId}:${customerKey}`;

    const data = await getOrSet(cacheKey, 3600, async () => {
      if (hasSignals) {
        return RecommendationsPersonalizedDB.fromSignals(tenantId, {
          viewedProductIds,
          viewedCategories,
          zone,
          limit,
        });
      }
      if (!customerId && !customerPhone) {
        return RecommendationsPersonalizedDB.coldStart(tenantId, { limit });
      }
      return RecommendationsPersonalizedDB.forMe(tenantId, {
        customerId,
        customerPhone,
        storeSlug,
        limit,
      });
    });

    return NextResponse.json({ data, total: data.length });
  } catch (err) {
    logger.error("recommendations/personalized: error", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
