import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { getCacaoMarket } from "@/lib/cacao/cacao-market";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/cacao/market — Noticiero del Cacao (ADR-128).
 * Precio ICE cocoa (CC=F) + FX USD/PEN + noticias (Google News RSS).
 * Datos NO tenant-específicos; igual se guarda con admin + spec habilitada.
 * Cache en memoria (20 min) en lib/cacao-market. Rate-limit GENEROUS.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "cacao-market");
  if (rl) return rl;

  const ok = await isSpecializationEnabled(auth.tenantId, "spec:agricola:cacao-acopio");
  if (!ok) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  try {
    // ?force=1 salta el cache de 20 min (botón "Actualizar" del Mercado). El
    // rate-limit GENEROUS evita abusar de la fuente externa.
    const force = new URL(req.url).searchParams.get("force") === "1";
    const market = await getCacaoMarket(force);
    return NextResponse.json(market);
  } catch (err) {
    logger.error("[cacao.market.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
