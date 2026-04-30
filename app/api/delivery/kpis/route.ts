import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// GET /api/delivery/kpis — KPIs for delivery module dashboard
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [activePartners, deliveriesToday, pendingDeliveries] = await Promise.all([
      prisma.deliveryPartner.count({ where: { isActive: true } }),
      prisma.deliveryAssignment.count({
        where: {
          deliveredAt: { gte: todayStart },
          status: "delivered",
        },
      }),
      prisma.deliveryAssignment.count({
        where: {
          status: { in: ["assigned", "picked_up"] },
        },
      }),
    ]);

    return NextResponse.json({
      activePartners,
      deliveriesToday,
      pendingDeliveries,
    });
  } catch (err) {
    logger.error("[delivery/kpis] GET error", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { activePartners: 0, deliveriesToday: 0, pendingDeliveries: 0 },
    );
  }
}
