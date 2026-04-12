import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { estimateAllTenantCosts } from "@/lib/cost-tracking";

/**
 * GET /api/superadmin/costs
 *
 * Returns estimated monthly infrastructure costs per tenant.
 * Auth: superadmin platform session (same pattern as /api/superadmin/tenants).
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const session = await getPlatformSession(token);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const costs = await estimateAllTenantCosts();

    const totalCostAll = costs.reduce((sum, c) => sum + c.totalCost, 0);
    const avgMargin = costs.length > 0
      ? costs.reduce((sum, c) => sum + c.grossMargin, 0) / costs.length
      : 0;

    return NextResponse.json({
      ok: true,
      tenantCount: costs.length,
      totalMonthlyCost: Math.round(totalCostAll * 100) / 100,
      avgGrossMargin: Math.round(avgMargin * 100) / 100,
      tenants: costs,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
