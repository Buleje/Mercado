/**
 * GET /api/superadmin/compliance/checklist
 *
 * Devuelve el catálogo completo de controles (Ley 29733 + OWASP Web + OWASP
 * API) + stats agregadas + contador de DSAR exports últimos 30 días.
 *
 * Antes los controles vivían hardcoded en ComplianceTab.tsx. Centralizarlos
 * server-side permite:
 *  - Enriquecer cada control con `lastCheckedAt`/`lastCheckedBy` desde audit
 *  - Cambiar status sin redeploy del front
 *  - Reusar el catálogo desde otros endpoints (export PDF, alerts, etc.)
 *
 * Auth: requirePlatformAPI · Rate-limit GENEROUS · Cache-Control no-store
 */
import "server-only";
import { NextRequest } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { secureJson, secureError } from "@/lib/superadmin-response";
 
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import {
  LEY_29733,
  OWASP_TOP_10,
  OWASP_API_TOP_10,
  RETENTION_RULES,
  getAllControls,
  computeStats,
} from "@/lib/compliance/checklist-data";

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "GENEROUS", "superadmin-compliance-checklist");
  if (rl) return rl;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // DSAR exports últimos 30 días — métrica de presión legal real.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dsarExportsLast30d = await prisma.activityLog
      .count({
        where: {
          entity: "compliance",
          action: "data_export",
          createdAt: { gte: thirtyDaysAgo },
        },
      })
      .catch(() => 0);

    const all = getAllControls();
    const stats = computeStats(all);

    return secureJson({
      generatedAt: new Date().toISOString(),
      norms: {
        "ley-29733": {
          label: "Ley 29733 — Perú",
          subtitle: "Protección de datos personales",
          items: LEY_29733,
          stats: computeStats(LEY_29733),
        },
        "owasp-web": {
          label: "OWASP Top 10 (2021)",
          subtitle: "Controles web recomendados",
          items: OWASP_TOP_10,
          stats: computeStats(OWASP_TOP_10),
        },
        "owasp-api": {
          label: "OWASP API Top 10 (2023)",
          subtitle: "API REST/GraphQL",
          items: OWASP_API_TOP_10,
          stats: computeStats(OWASP_API_TOP_10),
        },
      },
      overall: stats,
      dsarExportsLast30d,
      retentionRules: RETENTION_RULES,
    });
  } catch (err) {
    logger.error("[compliance/checklist] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return secureError("No se pudo cargar el checklist", 500);
  }
}
