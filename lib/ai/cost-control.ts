import "server-only";
import { logger } from "@/lib/logger";

/**
 * lib/ai/cost-control.ts — Roadmap item #68
 *
 * Tracking de costos de AI por tenant + circuit breaker por presupuesto.
 * Funciona con in-memory counters (no necesita DB — se resetea por deploy).
 *
 * Uso:
 *   const ok = aiCostGuard.canSpend(tenantId, estimatedCost);
 *   if (!ok) return { error: "Presupuesto AI agotado" };
 *   // hacer la llamada AI
 *   aiCostGuard.recordSpend(tenantId, actualCost);
 */

// Presupuestos por plan (USD por mes por tenant)
const PLAN_BUDGETS: Record<string, number> = {
  free: 0.50,
  pro: 5.00,
  business: 20.00,
  enterprise: 100.00,
};

// Contadores in-memory (se resetean con cada deploy)
const spendTracker = new Map<string, { total: number; count: number; lastReset: number }>();

const RESET_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function getTracker(tenantId: string) {
  const now = Date.now();
  const existing = spendTracker.get(tenantId);

  if (!existing || (now - existing.lastReset) > RESET_INTERVAL_MS) {
    const fresh = { total: 0, count: 0, lastReset: now };
    spendTracker.set(tenantId, fresh);
    return fresh;
  }

  return existing;
}

export const aiCostGuard = {
  canSpend(tenantId: string, estimatedCost: number, plan = "free"): boolean {
    const tracker = getTracker(tenantId);
    const budget = PLAN_BUDGETS[plan] ?? PLAN_BUDGETS.free;

    if (tracker.total + estimatedCost > budget) {
      logger.warn("[ai-cost] Presupuesto agotado", {
        tenantId: tenantId.slice(-6),
        spent: tracker.total,
        budget,
        estimatedCost,
      });
      return false;
    }
    return true;
  },

  recordSpend(tenantId: string, actualCost: number): void {
    const tracker = getTracker(tenantId);
    tracker.total += actualCost;
    tracker.count += 1;
  },

  getUsage(tenantId: string): { spent: number; count: number } {
    const tracker = getTracker(tenantId);
    return { spent: tracker.total, count: tracker.count };
  },

  getAllUsage(): Array<{ tenantId: string; spent: number; count: number }> {
    return Array.from(spendTracker.entries()).map(([tenantId, t]) => ({
      tenantId,
      spent: t.total,
      count: t.count,
    }));
  },
};
