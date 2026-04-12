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
    if (period === "semana") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "mes") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    // "todo" => no date filter

    // Get all partners for this tenant
    const partners = await prisma.deliveryPartner.findMany({
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
    });

    // Get assignments aggregated by partner
    const assignmentFilter: Record<string, unknown> = {
      tenantId: auth.tenantId,
    };
    if (from) {
      assignmentFilter.createdAt = { gte: from };
    }

    const assignments = await prisma.deliveryAssignment.findMany({
      where: assignmentFilter,
      select: {
        partnerId: true,
        status: true,
        fee: true,
        createdAt: true,
        deliveredAt: true,
      },
    });

    // Build stats per partner
    const statsMap = new Map<string, {
      deliveries: number;
      pending: number;
      totalFee: number;
      totalTimeMin: number;
      timedDeliveries: number;
    }>();

    for (const a of assignments) {
      if (!statsMap.has(a.partnerId)) {
        statsMap.set(a.partnerId, { deliveries: 0, pending: 0, totalFee: 0, totalTimeMin: 0, timedDeliveries: 0 });
      }
      const s = statsMap.get(a.partnerId)!;

      if (a.status === "delivered") {
        s.deliveries++;
        s.totalFee += Number(a.fee);
        if (a.deliveredAt) {
          const diffMs = new Date(a.deliveredAt).getTime() - new Date(a.createdAt).getTime();
          const diffMin = diffMs / 60000;
          if (diffMin > 0 && diffMin < 480) { // Ignore unrealistic times (> 8h)
            s.totalTimeMin += diffMin;
            s.timedDeliveries++;
          }
        }
      } else {
        s.pending++;
      }
    }

    // Build ranking
    const ranking = partners.map((p) => {
      const stats = statsMap.get(p.id) ?? { deliveries: 0, pending: 0, totalFee: 0, totalTimeMin: 0, timedDeliveries: 0 };
      const avgFee = stats.deliveries > 0 ? stats.totalFee / stats.deliveries : 0;
      const avgTimeMin = stats.timedDeliveries > 0 ? stats.totalTimeMin / stats.timedDeliveries : 0;

      // Score: 40% rating + 30% deliveries + 30% speed (inverse of avg time)
      const ratingScore = p.rating * 8; // 0-40
      const volumeScore = Math.min(stats.deliveries * 1.5, 30); // 0-30
      const speedScore = avgTimeMin > 0 ? Math.max(0, 30 - avgTimeMin * 0.5) : 0; // 0-30

      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        zone: p.zone,
        vehicleType: p.vehicleType,
        rating: p.rating,
        isActive: p.isActive,
        baseFee: Number(p.fee),
        deliveries: stats.deliveries,
        pending: stats.pending,
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
