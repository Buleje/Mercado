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
 *     plan: string,               // Tenant.plan real
 *     planEnTabla: boolean,       // false = el plan usa el tope de free
 *   }
 *
 * 2026-10-09: el plan y el tope salen de `topeDelPlan` (lib/ai/cost-control.ts),
 * la MISMA resolución que `canSpend`. Antes leía `plan` de la sesión (no lo
 * trae) y tenía su propia tabla: todos veían el tope de free ($0,50).
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { aiCostGuard, topeDelPlan } from "@/lib/ai/cost-control";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  // GENEROUS: el medidor va arriba de cada vista de Comandos IA.
  const rl = applyRateLimit(req, "GENEROUS", "admin-ai-costs");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const [usage, { plan, capUsd, planEnTabla }] = await Promise.all([
      aiCostGuard.getUsage(auth.tenantId),
      topeDelPlan(auth.tenantId),
    ]);
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
      planEnTabla,
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
