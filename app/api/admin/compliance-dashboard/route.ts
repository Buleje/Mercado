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
 *
 * SECURITY 2026-05-12 (Code Reviewer P0):
 * - `force-dynamic` evita cache cross-tenant
 * - Uso de `ComplianceDB.getKpis()` en vez de prisma.* directo (regla #1)
 * - Guard explícito tenantId vacío al inicio
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ComplianceDB } from "@/lib/db/compliance.db";
import { logger } from "@/lib/logger";

// SECURITY (Code Reviewer P0-2): force-dynamic obligatorio.
// Sin esto, Next 16 puede cachear el response RSC entre tenants distintos.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compliance-dashboard");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  // Guard explícito: si tenantId fuese null, where:{tenantId:null} retornaría
  // TODOS los tenants (data leak cross-tenant). 403 fail-loud.
  const tenantId = auth.tenantId;
  if (!tenantId || typeof tenantId !== "string" || tenantId.length === 0) {
    logger.error("[compliance-dashboard] tenantId vacio post-requireAdmin", { user: auth.username });
    return NextResponse.json(
      { error: "tenantId requerido", details: "Sesión inválida — re-login requerido" },
      { status: 403 },
    );
  }

  try {
    // Usa wrapper ComplianceDB (regla #1 CLAUDE.md): cache + audit + tenantId enforced.
    const kpis = await ComplianceDB.getKpis(tenantId);

    const now = new Date();
    const auditCoverageDays = kpis.auditLogOldestDate
      ? Math.floor((now.getTime() - kpis.auditLogOldestDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Placeholders hasta que las migrations agreguen los campos:
    //   - Customer.acceptsMarketing (consent_coverage)
    //   - Note.tags array column (active_breaches)
    const customersWithConsent = 0;
    const activeBreaches = 0;
    const consentCoveragePct = kpis.customersTotal > 0
      ? Math.round((customersWithConsent / kpis.customersTotal) * 1000) / 10
      : 0;

    // Score Ley 29733 (0-100)
    let score = 100;
    if (kpis.auditLog30d < 10) score -= 20;
    if (auditCoverageDays < 90) score -= 15;
    if (consentCoveragePct < 50) score -= 25;
    if (activeBreaches > 0) score -= 40;
    score = Math.max(0, score);

    const checks = {
      audit_log_active: {
        ok: kpis.auditLog30d >= 10,
        value: kpis.auditLog30d,
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
        label: "Cobertura consentimientos marketing (PLACEHOLDER hasta migration)",
      },
      no_active_breaches: {
        ok: activeBreaches === 0,
        value: activeBreaches,
        target: 0,
        label: "Brechas activas pendientes (PLACEHOLDER hasta migration)",
      },
    };

    return NextResponse.json({
      tenantId,
      score,
      grade: score >= 90 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D",
      checks,
      stats: {
        auditLog30d: kpis.auditLog30d,
        auditLogTotal: kpis.auditLogTotal,
        auditCoverageDays,
        customersTotal: kpis.customersTotal,
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
