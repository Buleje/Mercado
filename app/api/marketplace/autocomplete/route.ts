import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplaceSearchDB } from "@/lib/db/marketplace-search.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  q: z
    .string()
    .min(1)
    .max(100)
    .transform((s) => s.replace(/[<>"'&]/g, "").trim()),
});

/**
 * GET /api/marketplace/autocomplete?q=arroz
 *
 * Devuelve sugerencias rapidas de autocompletado:
 *   - products:   hasta 4 productos matching por nombre
 *   - categories: hasta 3 categorias matching
 *   - stores:     hasta 2 tiendas matching por nombre
 *
 * Cache de 30s en el DB layer. No requiere autenticacion.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parametros invalidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { q } = parsed.data;

    logger.info("marketplace/autocomplete", { requestId, q });

    const result = await MarketplaceSearchDB.autocomplete(q);

    return NextResponse.json(result, {
      headers: {
        // Cache en el edge: 30s stale, 10s revalidate (sugerencias cambian poco)
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=10",
      },
    });
  } catch (err) {
    logger.error("marketplace/autocomplete: error inesperado", {
      requestId,
      err,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
