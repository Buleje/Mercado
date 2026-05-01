import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/delivery/ranking?period=week|month|all
 *
 * Devuelve ranking de partners del tenant ordenado por entregas exitosas
 * en el periodo. Incluye stats avanzados.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "month";
  const since = (() => {
    const d = new Date();
    if (period === "week") d.setDate(d.getDate() - 7);
    else if (period === "month") d.setDate(d.getDate() - 30);
    else d.setFullYear(d.getFullYear() - 5);
    return d;
  })();

  const partners = await prisma.deliveryPartner.findMany({
    where: { tenantId: auth.tenantId, isActive: true },
    select: {
      id: true, name: true, phone: true, vehicleType: true,
      rating: true, acceptanceRate: true,
      totalOffers: true, totalAccepted: true,
      assignments: {
        where: { createdAt: { gte: since } },
        select: { status: true, fee: true, deliveredAt: true, pickedUpAt: true, createdAt: true },
      },
    },
  });

  const ranked = partners
    .map((p) => {
      const total = p.assignments.length;
      const delivered = p.assignments.filter((a) => a.status === "delivered").length;
      const cancelled = p.assignments.filter((a) => a.status === "cancelled").length;
      const inProgress = total - delivered - cancelled;
      const totalEarnings = p.assignments
        .filter((a) => a.status === "delivered")
        .reduce((sum, a) => sum + Number(a.fee), 0);
      const completionRate = total > 0 ? delivered / total : 0;
      const times: number[] = [];
      for (const a of p.assignments) {
        if (a.pickedUpAt && a.deliveredAt) {
          times.push((a.deliveredAt.getTime() - a.pickedUpAt.getTime()) / 60_000);
        }
      }
      const avgDeliveryMin = times.length > 0 ? times.reduce((s, n) => s + n, 0) / times.length : null;

      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        vehicleType: p.vehicleType,
        rating: p.rating,
        acceptanceRate: p.acceptanceRate,
        totalOffersHistorical: p.totalOffers,
        totalAcceptedHistorical: p.totalAccepted,
        delivered,
        cancelled,
        inProgress,
        totalAssignments: total,
        totalEarnings,
        completionRate,
        avgDeliveryMin,
      };
    })
    .sort((a, b) => b.delivered - a.delivered || b.rating - a.rating);

  return NextResponse.json({
    period,
    since: since.toISOString(),
    ranking: ranked,
    summary: {
      totalPartners: ranked.length,
      totalDelivered: ranked.reduce((s, r) => s + r.delivered, 0),
      totalEarnings: ranked.reduce((s, r) => s + r.totalEarnings, 0),
      avgCompletionRate:
        ranked.length > 0
          ? ranked.reduce((s, r) => s + r.completionRate, 0) / ranked.length
          : 0,
    },
  });
}
