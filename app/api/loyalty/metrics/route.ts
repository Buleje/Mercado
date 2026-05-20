import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { LoyaltyMetricsDB } from "@/lib/db/loyalty-metrics.db";

/**
 * GET /api/loyalty/metrics
 *
 * Returns loyalty program metrics for the admin dashboard:
 * - Total points issued / redeemed
 * - Customer distribution by tier
 * - Points activity trends (last 30 days)
 * - Top customers by points
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenantId = auth.tenantId;
    // Audit project-wide 2026-05-19: migrado a LoyaltyMetricsDB.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      tierGroups,
      activeMembers,
      totalCustomers,
      earned,
      redeemed,
      topCustomers,
      totalPointsAgg,
    ] = await Promise.all([
      LoyaltyMetricsDB.tierDistribution(tenantId),
      LoyaltyMetricsDB.countActiveMembers(tenantId),
      LoyaltyMetricsDB.countTotalCustomers(tenantId),
      LoyaltyMetricsDB.aggregateEarnedSince(tenantId, thirtyDaysAgo),
      LoyaltyMetricsDB.aggregateRedeemedSince(tenantId, thirtyDaysAgo),
      LoyaltyMetricsDB.topCustomers(tenantId, 10),
      LoyaltyMetricsDB.totalPointsAggregate(tenantId),
    ]);

    const tierDistribution = tierGroups.map((g) => ({
      tier: g.loyaltyTier ?? "bronce",
      customers: g._count.phone,
      totalPoints: g._sum.loyaltyPoints ?? 0,
    }));

    return NextResponse.json({
      summary: {
        totalCustomers,
        activeMembers,
        totalPointsCirculating: totalPointsAgg._sum.loyaltyPoints ?? 0,
        pointsIssuedLast30d: earned._sum.amount ?? 0,
        pointsRedeemedLast30d: Math.abs(redeemed._sum.amount ?? 0),
        earnTransactions: earned._count,
        redeemTransactions: redeemed._count,
      },
      tierDistribution,
      topCustomers: topCustomers.map((c) => ({
        phone: c.phone.slice(-4).padStart(c.phone.length, "*"),
        name: c.name,
        points: c.loyaltyPoints,
        tier: c.loyaltyTier,
        totalSpent: Number(c.totalSpent),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error loading metrics" },
      { status: 500 },
    );
  }
}
