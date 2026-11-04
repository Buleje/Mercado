/**
 * GET /api/superadmin/intelligence/demand
 *
 * "Inteligencia de Barrio" — señales reales cross-tenant de demanda.
 *
 * Ruta delgada: las consultas viven en `DemandaPlataformaDB` (lib/db/demanda-plataforma.db.ts)
 * y el cálculo en las funciones puras `buildDemandReport` (lib/intelligence/demand-signals.ts)
 * y `lib/intelligence/demanda-plataforma.ts`. Trae:
 *  - tienda: categorías en alza/baja, zonas y quiebres (ventana de 30 días; 90 si
 *    la plataforma vendió poco);
 *  - madera: m³ por especie de los aserraderos (producción, despacho, ingreso de trozas).
 *
 * Auth: requirePlatformAPI · Rate-limit GENEROUS · Cache-Control no-store
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { DemandaPlataformaDB } from "@/lib/db/demanda-plataforma.db";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(req: NextRequest) {
  // Rate-limit primero (igual que billing-summary)
  const rl = await applyRateLimit(req, "GENEROUS", "superadmin-demand");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Cache 10 min dentro de la clase (getOrSet + dedupe in-flight).
    const report = await DemandaPlataformaDB.reporte();

    logger.info("[demand] reporte generado", {
      by: auth.username,
      periodDays: report.period.days,
      totalUnits: report.totalUnits,
      risingCount: report.risingCategories.length,
      stockoutHotspots: report.stockoutHotspots.length,
      zones: report.byZone.length,
      maderaSpecies: report.madera.species.length,
    });

    return NextResponse.json(report, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logger.error("[demand] error al generar reporte", { error: String(err) });
    return NextResponse.json(
      { error: "Error al generar reporte de demanda" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
