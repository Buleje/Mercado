import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/dashboard/command-center
 *
 * KPIs OPERATIVOS (accionables) para la franja superior del dashboard del
 * superadmin: trials por vencer, altas recientes y distribución por plan.
 * El riesgo/churn lo aporta /api/superadmin/churn (mismo cálculo que /tenants).
 * Definición de "trial por vencer" idéntica al quick-filter trial-expiring de
 * /tenants: trialEndsAt dentro de [0, N] días → el conteo == la lista filtrada.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  try {
    const now = new Date();
    const in3d = new Date(now.getTime() + 3 * 86_400_000);
    const in7d = new Date(now.getTime() + 7 * 86_400_000);
    const ago7d = new Date(now.getTime() - 7 * 86_400_000);

    const [expiring3, expiring7, signups7, planGroups] = await Promise.all([
      prisma.tenant.count({ where: { trialEndsAt: { gte: now, lte: in3d } } }),
      prisma.tenant.count({ where: { trialEndsAt: { gte: now, lte: in7d } } }),
      prisma.tenant.count({ where: { createdAt: { gte: ago7d } } }),
      prisma.tenant.groupBy({ by: ["plan"], _count: { _all: true } }),
    ]);

    const planDist: Record<string, number> = {};
    for (const g of planGroups) planDist[g.plan] = g._count._all;

    return NextResponse.json({
      trialsExpiring: { in3d: expiring3, in7d: expiring7 },
      newSignups7d: signups7,
      planDist,
    });
  } catch (e) {
    logger.error("[command-center] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
