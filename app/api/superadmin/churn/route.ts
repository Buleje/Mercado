import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { SuperadminChurnTenantDB } from "@/lib/db/superadmin-churn-tenant.db";
import { logger } from "@/lib/logger";
import { z } from "zod";

// ─── Validación query params ──────────────────────────────────────────────────

const querySchema = z.object({
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// ─── GET /api/superadmin/churn ────────────────────────────────────────────────

/**
 * Dashboard anti-churn para super-admin.
 * Devuelve tenants con su último health score, risk level, signals activos
 * y stats agregados.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requirePlatformAPI(req);
    if ("status" in auth) return auth;

    // Validar query params
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      riskLevel: url.searchParams.get("riskLevel") ?? undefined,
      limit: url.searchParams.get("limit") ?? 50,
      offset: url.searchParams.get("offset") ?? 0,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { riskLevel, limit, offset } = parsed.data;

    logger.info("[superadmin/churn] GET dashboard", {
      user: auth.username,
      riskLevel,
      limit,
      offset,
    });

    // Score más reciente de cada tenant en UNA query (distinct-on en la DB class).
    // Reemplaza el groupBy + N findFirst (N+1: 11 queries con 10 tenants) por 1.
    // Equivalencia verificada before/after contra la DB real (0 diferencias).
    const nonNull = await SuperadminChurnTenantDB.listLatestHealthScores();

    if (nonNull.length === 0) {
      return NextResponse.json({
        tenants: [],
        stats: {
          total: 0,
          byRiskLevel: { low: 0, medium: 0, high: 0, critical: 0 },
          churnRateEstimated: 0,
          avgScore: 0,
        },
        pagination: { total: 0, limit, offset },
      });
    }

    // Filtrar por riskLevel si se proporcionó
    const filteredScores = riskLevel ? nonNull.filter((s) => s.riskLevel === riskLevel) : nonNull;

    // Ordenar por score ascendente (los más críticos primero)
    const sortedScores = filteredScores.sort((a, b) => a.score - b.score);
    const paginatedScores = sortedScores.slice(offset, offset + limit);

    if (paginatedScores.length === 0) {
      // Stats sin datos
      return NextResponse.json({
        tenants: [],
        stats: {
          total: 0,
          byRiskLevel: { low: 0, medium: 0, high: 0, critical: 0 },
          churnRateEstimated: 0,
          avgScore: 0,
        },
        pagination: { total: 0, limit, offset },
      });
    }

    const tenantIds = paginatedScores.map((s) => s.tenantId);

    // Obtener info de tenants
    const tenants = await SuperadminChurnTenantDB.listTenantsForChurn(tenantIds);

    const tenantMap = new Map(tenants.map((t) => [t.id, t]));

    // Signals activos por tenant
    const activeSignals = await SuperadminChurnTenantDB.listActiveSignals(tenantIds);

    const signalsByTenant = new Map<string, typeof activeSignals>();
    for (const sig of activeSignals) {
      const arr = signalsByTenant.get(sig.tenantId) ?? [];
      arr.push(sig);
      signalsByTenant.set(sig.tenantId, arr);
    }

    // Construir respuesta por tenant
    const result = paginatedScores.map((score) => {
      const tenant = tenantMap.get(score.tenantId);
      return {
        tenantId: score.tenantId,
        slug: tenant?.slug ?? "unknown",
        name: tenant?.name ?? "unknown",
        plan: tenant?.plan ?? "free",
        ownerEmail: tenant?.ownerEmail ?? null,
        trialEndsAt: tenant?.trialEndsAt ?? null,
        createdAt: tenant?.createdAt ?? null,
        healthScore: {
          score: score.score,
          riskLevel: score.riskLevel,
          loginsLast7d: Number(score.loginsLast7d),
          ordersLast7d: Number(score.ordersLast7d),
          daysSinceLastOrder: Number(score.daysSinceLastOrder),
          daysSinceLastLogin: Number(score.daysSinceLastLogin),
          trialDaysLeft: score.trialDaysLeft !== null ? Number(score.trialDaysLeft) : null,
          calculatedAt: score.calculatedAt,
        },
        activeSignals: signalsByTenant.get(score.tenantId) ?? [],
      };
    });

    // Stats agregados del total (no solo de la página)
    const allRiskLevels = filteredScores.map((s) => s.riskLevel);
    const byRiskLevel = {
      low: allRiskLevels.filter((r) => r === "low").length,
      medium: allRiskLevels.filter((r) => r === "medium").length,
      high: allRiskLevels.filter((r) => r === "high").length,
      critical: allRiskLevels.filter((r) => r === "critical").length,
    };

    const total = filteredScores.length;
    const avgScore =
      total > 0 ? Math.round(filteredScores.reduce((sum, s) => sum + s.score, 0) / total) : 0;

    // Churn rate estimado: tenants en high+critical / total
    const churnRateEstimated =
      total > 0 ? Math.round(((byRiskLevel.high + byRiskLevel.critical) / total) * 100) : 0;

    return NextResponse.json({
      tenants: result,
      stats: {
        total,
        byRiskLevel,
        churnRateEstimated,
        avgScore,
      },
      pagination: { total, limit, offset },
    });
  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
