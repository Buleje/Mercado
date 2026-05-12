/**
 * app/api/admin/leads/funnel/route.ts
 *
 * GET — Métricas del funnel de leads para dashboard CEO.
 *
 * Sprint 2026-05-12: agrega visibilidad del funnel de outbound/inbound
 * (lead-capture → contacted → demo_done → signed_up). Brandon necesita ver
 * cuántos prospectos llegan por source/businessType/ciudad y la tasa de
 * conversión para decidir dónde gastar en ads.
 *
 * Datos persistidos en ActivityLog (entity="lead") por /api/lead/capture.
 * Wrapper: LeadsDB (cumple regla #1 CLAUDE.md).
 *
 * SECURITY:
 *  - requireAdmin (roles admin|manager)
 *  - force-dynamic (no cache cross-tenant)
 *  - rate-limit MODERATE
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { LeadsDB } from "@/lib/db/leads.db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "leads-funnel");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;
  if (!tenantId || typeof tenantId !== "string" || tenantId.length === 0) {
    logger.error("[leads-funnel] tenantId vacio post-requireAdmin", { user: auth.username });
    return NextResponse.json(
      { error: "tenantId requerido", details: "Sesión inválida — re-login requerido" },
      { status: 403 },
    );
  }

  try {
    // Los leads se persisten siempre con tenantId="main" (landing cross-tenant).
    // Solo el admin del tenant "main" (Brandon) ve el funnel completo.
    // Tenants vendor solo verían sus propios leads si futuro se split.
    const stats = await LeadsDB.getStats(tenantId);

    return NextResponse.json({
      tenantId,
      ...stats,
      lastRefresh: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[leads-funnel] failed", { err: String(err) });
    return NextResponse.json(
      { error: "leads_funnel_failed", details: String(err).slice(0, 200) },
      { status: 500 },
    );
  }
}
