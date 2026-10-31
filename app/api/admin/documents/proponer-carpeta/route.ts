import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { proponerCarpetas } from "@/lib/documents/propuesta-carpeta-servidor";

/**
 * GET /api/admin/documents/proponer-carpeta?ids=a,b,c — «¿Va a "CCNN Santa
 * Rosa de Chivis"?» para los papeles recién subidos que quedaron sin ordenar.
 * Responde `{ propuestas: { [docId]: { leido, candidatas } } }`: hasta 3
 * carpetas que el rol ve, cada una con su puntaje y sus motivos. No mueve
 * nada: «Mover» va por `bulk` (que vuelve a validar rol y destino).
 */

const MAX_IDS = 20;
const Query = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_IDS),
});

export async function GET(req: NextRequest) {
  try {
    const rl = await applyRateLimit(req, "GENEROUS", "documents:proponer-carpeta");
    if (rl) return rl;
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const crudos = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
    const parsed = Query.safeParse({ ids: [...new Set(crudos)] });
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const propuestas = await proponerCarpetas(auth.tenantId, auth.role, parsed.data.ids);
    return NextResponse.json({ propuestas });
  } catch (e) {
    logger.error("[documents.proponer-carpeta] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
