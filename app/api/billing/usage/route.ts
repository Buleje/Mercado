import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getTenantUsageSnapshot } from "@/lib/usage";
import { BillingUsageDB } from "@/lib/db/billing-usage.db";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/billing/usage
 * Retorna el uso actual del tenant vs los límites de su plan.
 * Usado por UpgradeBanner y el dashboard admin para mostrar progreso.
 */
export const GET = withApiHandler("billing-usage", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenant = await BillingUsageDB.getTenantPlanFields(auth.tenantId);

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
});
