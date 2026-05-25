import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { SuperadminChurnTenantDB } from "@/lib/db/superadmin-churn-tenant.db";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

// ─── Validación params ────────────────────────────────────────────────────────

const resolveSignalSchema = z.object({
  signalId: z.string().min(1),
  resolvedBy: z.string().min(1).default("manual"),
});

// ─── GET /api/superadmin/churn/[tenantSlug] ───────────────────────────────────

/**
 * Detalle anti-churn de un tenant:
 * - Historial de health scores (últimos 30 días)
 * - Signals activos y resueltos
 * - Intervenciones ejecutadas
 * - Timeline de actividad reciente
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const auth = await requirePlatformAPI(req);
    if ("status" in auth) return auth;

    const { tenantSlug } = await params;

    logger.info("[superadmin/churn] GET tenant detail", { user: auth.username, tenantSlug });

    // Audit project-wide 2026-05-19: migrado a SuperadminChurnTenantDB.
    const tenant = await SuperadminChurnTenantDB.findTenantBySlug(tenantSlug);

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Historial de scores (últimos 30 días), máximo 30 registros
    const scoreHistory = await SuperadminChurnTenantDB.getScoreHistory(tenant.id, thirtyDaysAgo);

    // Score actual (el más reciente)
    const latestScore = scoreHistory.at(-1) ?? null;

    // Signals activos
    const activeSignals = await SuperadminChurnTenantDB.getActiveSignals(tenant.id);

    // Signals resueltos (últimos 30 días)
    const resolvedSignals = await SuperadminChurnTenantDB.getResolvedSignals(tenant.id, thirtyDaysAgo);

    // Timeline de actividad reciente (últimas 50 acciones del tenant en ActivityLog)
    const activityTimeline = await SuperadminChurnTenantDB.getActivityTimeline(tenant.id).catch(
      () => [] as Awaited<ReturnType<typeof SuperadminChurnTenantDB.getActivityTimeline>>,
    );

    logger.info("[superadmin/churn] Detalle servido", {
      tenantSlug,
      scoreCount: scoreHistory.length,
      activeSignals: activeSignals.length,
    });

    return NextResponse.json({
      tenant,
      latestScore,
      scoreHistory,
      signals: {
        active: activeSignals,
        resolved: resolvedSignals,
      },
      activityTimeline,
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ─── PATCH /api/superadmin/churn/[tenantSlug] — resolver signal manualmente ──

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const _rl = await applyRateLimit(req, "STRICT", "superadmin-churn-X"); if (_rl) return _rl;
    if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();
    const auth = await requirePlatformAPI(req);
    if ("status" in auth) return auth;

    const { tenantSlug } = await params;

    const body = await req.json().catch(() => ({}));
    const parsed = resolveSignalSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const tenant = await SuperadminChurnTenantDB.findTenantIdBySlug(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const signal = await SuperadminChurnTenantDB.findSignalForTenant(parsed.data.signalId, tenant.id);
    if (!signal) {
      return NextResponse.json({ error: "Signal no encontrada" }, { status: 404 });
    }

    const updated = await SuperadminChurnTenantDB.resolveSignal(
      parsed.data.signalId,
      parsed.data.resolvedBy,
    );

    logger.info("[superadmin/churn] Signal resuelta manualmente", {
      user: auth.username,
      tenantSlug,
      signalId: parsed.data.signalId,
      resolvedBy: parsed.data.resolvedBy,
    });

    return NextResponse.json({ ok: true, signal: updated });

  } catch (e) {
    logger.error("[patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
