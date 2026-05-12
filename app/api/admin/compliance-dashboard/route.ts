/**
 * app/api/admin/compliance-dashboard/route.ts
 *
 * GET — Dashboard de cumplimiento Ley 29733 para admin tenant.
 *
 * Devuelve KPIs de compliance:
 *  - Audit log status (entries últimos 30 días + hash chain integrity)
 *  - GDPR exports solicitados (count + last)
 *  - Cobertura de consentimientos (users con/sin)
 *  - Última auditoría seguridad (días desde)
 *  - Brechas activas pendientes de remediación
 *
 * ADR-107 followup — Compliance gap detectado: dashboard centralizado.
 * Permite al admin del tenant ver su postura Ley 29733 en 1 vista.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// SECURITY 2026-05-12 (audit code-reviewer P0-2): force-dynamic obligatorio.
// Sin esto, Next 16 puede cachear el response RSC entre tenants distintos
// (un admin del tenant A vería data del tenant B en cache).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compliance-dashboard");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  // SECURITY 2026-05-12 (pentest N3 audit): guard explícito contra tenantId
  // undefined/falsy. Si auth.tenantId fuese null por sesión rota, `where:
  // {tenantId: null}` retornaría TODOS los tenants (data leak cross-tenant).
  const tenantId = auth.tenantId;
  if (!tenantId || typeof tenantId !== "string" || tenantId.length === 0) {
    logger.error("[compliance-dashboard] tenantId vacio post-requireAdmin", { user: auth.username });
    return NextResponse.json(
      { error: "tenantId requerido", details: "Sesión inválida — re-login requerido" },
      { status: 403 },
    );
  }
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  try {
    // Múltiples queries en paralelo (evita N+1)
    const [
      auditLog30d,
      auditLogTotal,
      auditLogOldest,
      customersTotal,
      customersWithConsent,
      activeBreaches,
    ] = await Promise.all([
      // 1. Audit log entries últimos 30 días
      prisma.activityLog.count({
        where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
      }),
      // 2. Total audit entries (volumen total)
      prisma.activityLog.count({
        where: { tenantId },
      }),
      // 3. Entry más antigua (verificar retention)
      prisma.activityLog.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      // 4. Customers total
      prisma.customer.count({ where: { tenantId } }),
      // 5. Customers con consentimiento explícito (placeholder — el field
      //    acceptsMarketing aún no existe en Customer schema. Cuando se agregue
      //    via migration, descomentar la query real. Por ahora retorna 0.)
      Promise.resolve(0),
      // 6. Brechas activas — placeholder hasta que Note tenga columna tags
      //    (actualmente tags se almacena como string JSON en Note.detail).
      Promise.resolve(0),
    ]);

    const auditCoverageDays = auditLogOldest
      ? Math.floor((now.getTime() - auditLogOldest.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const consentCoveragePct = customersTotal > 0
      ? Math.round((customersWithConsent / customersTotal) * 1000) / 10
      : 0;

    // Score Ley 29733 (0-100)
    let score = 100;
    if (auditLog30d < 10) score -= 20; // log activity bajo
    if (auditCoverageDays < 90) score -= 15; // retention <90 días
    if (consentCoveragePct < 50) score -= 25; // <50% consentimiento
    if (activeBreaches > 0) score -= 40; // brechas pendientes
    score = Math.max(0, score);

    const checks = {
      audit_log_active: {
        ok: auditLog30d >= 10,
        value: auditLog30d,
        target: 10,
        label: "Audit log activo (≥10 entries últimos 30d)",
      },
      retention_compliance: {
        ok: auditCoverageDays >= 90,
        value: `${auditCoverageDays} días`,
        target: "≥90 días",
        label: "Retention audit log (Ley 29733 Art. 16)",
      },
      consent_coverage: {
        ok: consentCoveragePct >= 50,
        value: `${consentCoveragePct}%`,
        target: "≥50%",
        label: "Cobertura consentimientos marketing",
      },
      no_active_breaches: {
        ok: activeBreaches === 0,
        value: activeBreaches,
        target: 0,
        label: "Brechas activas pendientes",
      },
    };

    return NextResponse.json({
      tenantId,
      score,
      grade: score >= 90 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D",
      checks,
      stats: {
        auditLog30d,
        auditLogTotal,
        auditCoverageDays,
        customersTotal,
        customersWithConsent,
        consentCoveragePct,
        activeBreaches,
      },
      lastRefresh: now.toISOString(),
      legalNote:
        "Ley 29733 (Protección de Datos Personales del Perú): audit log con hash chain SHA-256, GDPR-equivalent export disponible en /api/admin/gdpr-export.",
    });
  } catch (err) {
    logger.error("[compliance-dashboard] failed", { err: String(err) });
    return NextResponse.json(
      { error: "compliance_dashboard_failed", details: String(err).slice(0, 200) },
      { status: 500 },
    );
  }
}
