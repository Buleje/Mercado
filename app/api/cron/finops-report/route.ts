/**
 * GET /api/cron/finops-report
 *
 * Genera reporte semanal de costos por tenant.
 * Llama a estimateAllTenantCosts() (cachado 30min internamente),
 * agrega summary global, y emite a logger estructurado.
 *
 * Schedule: "0 8 * * 1" (lunes 8am UTC = 3am Pucallpa) — vercel.json
 * Auth: Bearer <CRON_SECRET> via withCronAuth helper
 *
 * Output (JSON):
 * {
 *   ok: true,
 *   generatedAt: ISO,
 *   tenantsAnalyzed: number,
 *   totalMonthlyCostUSD: number,
 *   topSpenders: [{ tenantSlug, tenantName, plan, totalCost, grossMargin }],
 *   breakdown: { storageUSD, computeUSD, aiUSD }
 * }
 *
 * El reporte va a logger.info("finops_weekly_report", report). Sentry/Vercel logs
 * lo capturan. Para alertas, agregar Sentry alert rule sobre el message string.
 */

import { NextResponse } from "next/server";
import { withCronAuth } from "@/lib/cron-auth";
import { estimateAllTenantCosts } from "@/lib/cost-tracking";
import { logger } from "@/lib/logger";

interface TopSpender {
  tenantSlug: string;
  tenantName: string;
  plan: string;
  totalCostUSD: number;
  grossMarginUSD: number;
}

export const GET = withCronAuth("finops-report", async () => {
  const generatedAt = new Date().toISOString();

  try {
    const allCosts = await estimateAllTenantCosts();

    if (allCosts.length === 0) {
      logger.info("[finops-report] no tenants to analyze", { generatedAt });
      return NextResponse.json({
        ok: true,
        generatedAt,
        tenantsAnalyzed: 0,
        totalMonthlyCostUSD: 0,
        topSpenders: [],
        breakdown: { storageUSD: 0, computeUSD: 0, aiUSD: 0 },
      });
    }

    // Agregados globales
    const totalMonthlyCostUSD = allCosts.reduce(
      (acc, c) => acc + c.totalCost,
      0,
    );

    const breakdown = {
      storageUSD: allCosts.reduce((acc, c) => acc + c.storageCost, 0),
      computeUSD: allCosts.reduce((acc, c) => acc + c.computeCost, 0),
      aiUSD: allCosts.reduce((acc, c) => acc + c.aiCost, 0),
    };

    // Top 10 spenders (desc)
    const topSpenders: TopSpender[] = [...allCosts]
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10)
      .map((c) => ({
        tenantSlug: c.tenantSlug,
        tenantName: c.tenantName,
        plan: c.plan,
        totalCostUSD: Number(c.totalCost.toFixed(4)),
        grossMarginUSD: Number(c.grossMargin.toFixed(4)),
      }));

    const report = {
      ok: true,
      generatedAt,
      tenantsAnalyzed: allCosts.length,
      totalMonthlyCostUSD: Number(totalMonthlyCostUSD.toFixed(2)),
      topSpenders,
      breakdown: {
        storageUSD: Number(breakdown.storageUSD.toFixed(2)),
        computeUSD: Number(breakdown.computeUSD.toFixed(2)),
        aiUSD: Number(breakdown.aiUSD.toFixed(2)),
      },
    };

    // Log estructurado: Sentry/Vercel logs lo capturan.
    // Para Sentry alert: matchear event.message = "finops_weekly_report"
    logger.info("finops_weekly_report", report);

    return NextResponse.json(report);
  } catch (err) {
    logger.error("[finops-report] failed", {
      error: err instanceof Error ? err.message : String(err),
      generatedAt,
    });
    return NextResponse.json(
      {
        ok: false,
        generatedAt,
        error: "Failed to generate FinOps report",
      },
      { status: 500 },
    );
  }
});
