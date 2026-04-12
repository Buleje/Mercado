import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";
import { orchestrator, ensureAgentsRegistered } from "@/lib/agents";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cron/agent-tasks
 *
 * Called daily by Vercel Cron (see vercel.json: "0 5 * * *").
 * Submits automated agent tasks: stock checks, FEFO audits, KPIs,
 * churn-risk detection, and notification triggers.
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureAgentsRegistered();

    // Iterate over all active tenants (multi-tenant)
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    // Daily automated agent tasks
    const taskDefs = [
      { domain: "inventory" as const, action: "check-stock", payload: {} },
      { domain: "inventory" as const, action: "fefo-audit", payload: {} },
      { domain: "analytics" as const, action: "daily-kpis", payload: {} },
      { domain: "customers" as const, action: "churn-risk", payload: {} },
      { domain: "notifications" as const, action: "send-stock-alert", payload: {} },
      { domain: "notifications" as const, action: "send-expiry-warning", payload: {} },
    ];

    const results = [];
    for (const tenant of tenants) {
      for (const t of taskDefs) {
        const task = await orchestrator.submitTask({
          ...t,
          tenantId: tenant.id,
          priority: "normal",
        });
        results.push({
          id: task.id,
          tenantId: tenant.id,
          domain: t.domain,
          action: t.action,
          status: task.status,
        });
      }
    }

    logger.info("[cron] agent-tasks executed", { taskCount: results.length, tenants: tenants.length });

    return NextResponse.json({
      ok: true,
      tenantsProcessed: tenants.length,
      tasksSubmitted: results.length,
      tasks: results,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron] agent-tasks failed", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
