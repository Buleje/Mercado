import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { DeliveryPartnersDB } from "@/lib/db/delivery-partners.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/delivery/ranking?period=week|month|all
 *   También acepta sinónimos en es-PE: ?period=semana|mes|todo
 *
 * Devuelve ranking de partners del tenant ordenado por entregas exitosas
 * en el periodo. Incluye stats avanzados.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
  const { searchParams } = new URL(req.url);
  // Acepta tanto en como es-PE (consolidación con /api/delivery/ranking)
  const rawPeriod = searchParams.get("period") ?? "month";
  const period = rawPeriod === "semana" ? "week"
               : rawPeriod === "mes" ? "month"
               : rawPeriod === "todo" ? "all"
               : rawPeriod;
  const since = (() => {
    const d = new Date();
    if (period === "week") d.setDate(d.getDate() - 7);
    else if (period === "month") d.setDate(d.getDate() - 30);
    else d.setFullYear(d.getFullYear() - 5);
    return d;
  })();

  const partners = await DeliveryPartnersDB.getRanking(auth.tenantId, since);

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
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[admin/delivery/ranking] GET failed", {
      error: detail,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(
      {
        error: "Error del servidor",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 503 },
    );
  }
}
