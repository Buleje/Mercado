export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type HealthScore = "ACTIVO" | "EN_RIESGO" | "PERDIDO" | "SIN_HISTORIAL";

function computeScore(lastOrderDate: Date | null): HealthScore {
  if (!lastOrderDate) return "SIN_HISTORIAL";
  const daysSince = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince <= 30) return "ACTIVO";
  if (daysSince <= 90) return "EN_RIESGO";
  return "PERDIDO";
}

// GET /api/customers/health-scores — health score for all tenant customers
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // Get all customers with their most recent order
    const customers = await prisma.customer.findMany({
      where: { tenantId: auth.tenantId },
      select: {
        phone: true,
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const scores: Record<string, HealthScore> = {};
    for (const c of customers) {
      const lastOrder = c.orders.length > 0 ? c.orders[0].createdAt : null;
      scores[c.phone] = computeScore(lastOrder);
    }

    return NextResponse.json(scores);
  } catch (e) {
    logger.error("[customers/health-scores] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
