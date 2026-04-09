import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getTenantUsageSnapshot } from "@/lib/usage";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/billing/usage
 * Retorna el uso actual del tenant vs los límites de su plan.
 * Usado por UpgradeBanner y el dashboard admin para mostrar progreso.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] },
      select: { plan: true, trialEndsAt: true, slug: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const snapshot = await getTenantUsageSnapshot(tenant.slug, tenant.plan);

    return NextResponse.json({
      ...snapshot,
      plan: tenant.plan,
      trialEndsAt: tenant.trialEndsAt,
      isTrialActive: tenant.trialEndsAt ? new Date() < tenant.trialEndsAt : false,
    });
  } catch {
    return NextResponse.json({ error: "Error obteniendo uso" }, { status: 500 });
  }
}
