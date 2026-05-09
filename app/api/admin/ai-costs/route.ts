/**
 * GET /api/admin/ai-costs
 *
 * Round 20 (2026-05-09) — Dashboard FinOps de costos AI por tenant.
 *
 * Devuelve el gasto mensual del tenant + cap por plan + porcentaje usado.
 * Datos vienen de aiCostGuard (Upstash Redis o memory fallback).
 *
 * Auth: requireAdmin (admin/owner solamente — info financiera).
 *
 * Response:
 *   {
 *     tenantId: string,
 *     monthKey: "YYYY-MM",
 *     spentUsd: number,
 *     capUsd: number,
 *     percentUsed: number,        // 0-100
 *     remainingUsd: number,
 *     plan: "free" | "pro" | "business" | "enterprise",
 *   }
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard } from "@/lib/ai/cost-control";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// Pricing duplicado del cost-control para no exponer internals.
// Mantener sincronizado con PLAN_BUDGETS_CENTS en lib/ai/cost-control.ts.
const PLAN_CAPS_USD: Record<string, number> = {
  free: 0.5,
  pro: 5.0,
  business: 20.0,
  enterprise: 100.0,
};

export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "admin-ai-costs");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const usage = await aiCostGuard.getUsage(auth.tenantId);
    // El plan está en el tenant config — para MVP usamos "free" si no se sabe.
    const plan = (auth as { plan?: string }).plan ?? "free";
    const capUsd = PLAN_CAPS_USD[plan] ?? PLAN_CAPS_USD.free;
    const percentUsed = capUsd > 0 ? Math.min(100, (usage.spentUsd / capUsd) * 100) : 0;
    const remainingUsd = Math.max(0, capUsd - usage.spentUsd);

    const monthKey = new Date().toISOString().slice(0, 7);

    return NextResponse.json({
      tenantId: auth.tenantId,
      monthKey,
      spentUsd: +usage.spentUsd.toFixed(4),
      capUsd: +capUsd.toFixed(2),
      percentUsed: +percentUsed.toFixed(1),
      remainingUsd: +remainingUsd.toFixed(4),
      plan,
      callCount: usage.count,
    });
  } catch (err) {
    logger.error("[admin/ai-costs] failed", {
      tenantId: auth.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Error consultando costos AI" },
      { status: 500 },
    );
  }
}
