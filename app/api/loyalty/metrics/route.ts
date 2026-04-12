import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

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

    // Tier distribution
    const tierGroups = await prisma.customer.groupBy({
      by: ["loyaltyTier"],
      where: { tenantId },
      _count: { phone: true },
      _sum: { loyaltyPoints: true },
    });

    const tierDistribution = tierGroups.map((g) => ({
      tier: g.loyaltyTier ?? "bronce",
      customers: g._count.phone,
      totalPoints: g._sum.loyaltyPoints ?? 0,
    }));

    // Total customers with points > 0
    const activeMembers = await prisma.customer.count({
      where: { tenantId, loyaltyPoints: { gt: 0 } },
    });

    const totalCustomers = await prisma.customer.count({
      where: { tenantId },
    });

    // Points issued vs redeemed (from LoyaltyTransaction)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const earned = await prisma.loyaltyTransaction.aggregate({
      where: {
        tenantId,
        amount: { gt: 0 },
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
      _count: true,
    });

    const redeemed = await prisma.loyaltyTransaction.aggregate({
      where: {
        tenantId,
        amount: { lt: 0 },
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
      _count: true,
    });

    // Top 10 customers by loyalty points
    const topCustomers = await prisma.customer.findMany({
      where: { tenantId, loyaltyPoints: { gt: 0 } },
      select: {
        phone: true,
        name: true,
        loyaltyPoints: true,
        loyaltyTier: true,
        totalSpent: true,
      },
      orderBy: { loyaltyPoints: "desc" },
      take: 10,
    });

    // Total points in the system
    const totalPointsAgg = await prisma.customer.aggregate({
      where: { tenantId },
      _sum: { loyaltyPoints: true },
    });

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
