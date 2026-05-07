import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/delivery/ranking
 *
 * Returns a performance ranking of all delivery partners for a tenant.
 * Metrics: total deliveries, avg fee, avg delivery time, rating, pending count.
 * Query: ?period=semana|mes|todo (default: mes)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") ?? "mes";

    // Period filter
    const now = new Date();
    let from: Date | undefined;
    let to: Date | undefined;
    if (period === "semana") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      to = now;
    } else if (period === "mes") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = now;
    }
    // "todo" => no date filter

    // Build date filter for groupBy
    const deliveredAtFilter = from && to ? { gte: from, lte: to } : undefined;

    // 1. groupBy aggregate for delivered assignments — O(1) DB-side aggregation
    const [deliveredGroups, pendingGroups, partners] = await Promise.all([
      prisma.deliveryAssignment.groupBy({
        by: ["partnerId"],
        where: {
          tenantId: auth.tenantId,
          status: "delivered",
          ...(deliveredAtFilter ? { deliveredAt: deliveredAtFilter } : {}),
        },
        _count: { id: true },
        _sum: { fee: true },
      }),
      // Pending count per partner (separate groupBy — different status filter)
      prisma.deliveryAssignment.groupBy({
        by: ["partnerId"],
        where: {
          tenantId: auth.tenantId,
          status: { not: "delivered" },
          ...(from ? { createdAt: { gte: from } } : {}),
        },
        _count: { id: true },
      }),
      // All partners for this tenant
      prisma.deliveryPartner.findMany({
        where: { tenantId: auth.tenantId },
        select: {
          id: true,
          name: true,
          phone: true,
          zone: true,
          vehicleType: true,
          rating: true,
          isActive: true,
          fee: true,
        },
      }),
    ]);

    // 2. Avg delivery time: fetch only top-50 partnerIds by delivery count
    const top50PartnerIds = [...deliveredGroups]
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, 50)
      .map((g) => g.partnerId);

    const timedAssignments =
      top50PartnerIds.length > 0
        ? await prisma.deliveryAssignment.findMany({
            where: {
              tenantId: auth.tenantId,
              partnerId: { in: top50PartnerIds },
              status: "delivered",
              deliveredAt: { not: null },
              ...(deliveredAtFilter ? { deliveredAt: deliveredAtFilter } : {}),
            },
            select: { partnerId: true, createdAt: true, deliveredAt: true },
          })
        : [];

    // Build avgTimeMin map from the limited timed fetch
    const timeMap = new Map<string, { total: number; count: number }>();
    for (const a of timedAssignments) {
      if (!a.deliveredAt) continue;
      const diffMin =
        (new Date(a.deliveredAt).getTime() - new Date(a.createdAt).getTime()) /
        60000;
      if (diffMin <= 0 || diffMin >= 480) continue; // ignore unrealistic
      const entry = timeMap.get(a.partnerId) ?? { total: 0, count: 0 };
      entry.total += diffMin;
      entry.count++;
      timeMap.set(a.partnerId, entry);
    }

    // Index groupBy results for O(1) lookups
    const deliveredMap = new Map(
      deliveredGroups.map((g) => [g.partnerId, g])
    );
    const pendingMap = new Map(
      pendingGroups.map((g) => [g.partnerId, g._count.id])
    );

    // Build ranking
    const ranking = partners.map((p) => {
      const delivered = deliveredMap.get(p.id);
      const deliveries = delivered?._count.id ?? 0;
      const totalFee = Number(delivered?._sum.fee ?? 0);
      const pending = pendingMap.get(p.id) ?? 0;
      const avgFee = deliveries > 0 ? totalFee / deliveries : 0;
      const timeEntry = timeMap.get(p.id);
      const avgTimeMin =
        timeEntry && timeEntry.count > 0
          ? timeEntry.total / timeEntry.count
          : 0;

      // Score: 40% rating + 30% deliveries + 30% speed (inverse of avg time)
      const ratingScore = p.rating * 8; // 0-40
      const volumeScore = Math.min(deliveries * 1.5, 30); // 0-30
      const speedScore =
        avgTimeMin > 0 ? Math.max(0, 30 - avgTimeMin * 0.5) : 0; // 0-30

      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        zone: p.zone,
        vehicleType: p.vehicleType,
        rating: p.rating,
        isActive: p.isActive,
        baseFee: Number(p.fee),
        deliveries,
        pending,
        avgFee: Math.round(avgFee * 100) / 100,
        avgTimeMin: Math.round(avgTimeMin),
        score: Math.round(ratingScore + volumeScore + speedScore),
      };
    });

    ranking.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      ranking,
      period,
      total: ranking.length,
    });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
