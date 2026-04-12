import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/loyalty/referral/stats
 * Returns referral program statistics for the admin panel.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Total referrals: customers with referredBy set
    const totalReferrals = await prisma.customer.count({
      where: {
        tenantId: auth.tenantId,
        referredBy: { not: null },
      },
    });

    // Total points given for referrals
    const pointsAgg = await prisma.loyaltyTransaction.aggregate({
      where: {
        tenantId: auth.tenantId,
        reason: "referral",
        amount: { gt: 0 },
      },
      _sum: { amount: true },
    });

    const totalPointsGiven = pointsAgg._sum.amount ?? 0;

    // Top referrers: customers whose referralCode is used most
    const customersWithCode = await prisma.customer.findMany({
      where: {
        tenantId: auth.tenantId,
        referralCode: { not: null },
      },
      select: {
        phone: true,
        name: true,
        referralCode: true,
      },
    });

    // Count how many people each code referred
    const referralCounts = await prisma.customer.groupBy({
      by: ["referredBy"],
      where: {
        tenantId: auth.tenantId,
        referredBy: { not: null },
      },
      _count: { referredBy: true },
      orderBy: { _count: { referredBy: "desc" } },
      take: 10,
    });

    const codeToCustomer = new Map(
      customersWithCode.map((c) => [c.referralCode!, c]),
    );

    const topReferrers = referralCounts
      .map((rc) => {
        const c = codeToCustomer.get(rc.referredBy!);
        return c
          ? {
              phone: `***${c.phone.slice(-4)}`,
              name: c.name,
              referralCode: c.referralCode!,
              referralCount: rc._count.referredBy,
            }
          : null;
      })
      .filter(Boolean);

    // Recent referral transactions
    const recentTx = await prisma.loyaltyTransaction.findMany({
      where: {
        tenantId: auth.tenantId,
        reason: "referral",
        amount: { gt: 0 },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        amount: true,
        metadata: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });

    const recentReferrals = recentTx.map((tx) => {
      const meta = tx.metadata as Record<string, unknown> | null;
      return {
        referrerName: meta?.type === "referrer" ? tx.customer.name : (meta?.referrerName as string) ?? "?",
        refereeName: meta?.type === "referee" ? tx.customer.name : (meta?.refereeName as string) ?? "?",
        date: tx.createdAt.toISOString(),
        points: tx.amount,
      };
    });

    return NextResponse.json({
      totalReferrals,
      totalPointsGiven,
      topReferrers,
      recentReferrals,
    });
  } catch (err) {
    logger.error("[referral/stats] Error", {
      tenantId: auth.tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error obteniendo estadísticas" }, { status: 500 });
  }
}
