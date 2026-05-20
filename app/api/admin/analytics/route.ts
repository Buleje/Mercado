import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { AdminAnalyticsDB } from "@/lib/db/admin-analytics.db";
import type { OrderStatus } from "@/lib/generated/prisma/client";

// Brandon 2026-05-16 (audit Info): analytics con cookies (requireAdmin) y
// aggregates en tiempo real. Sin force-dynamic — Next 16 lo infiere.
// Audit project-wide 2026-05-19: migrado a AdminAnalyticsDB (regla #1 CLAUDE.md).

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "analista"]);
  if (auth instanceof NextResponse) return auth;

  const { tenantId } = auth;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Brandon mayo 2026 v7: solo `entregado` cuenta como venta. Antes incluía
    // `confirmado` y `en_camino` que aún pueden ser cancelados → inflaba KPIs.
    const validStatuses: OrderStatus[] = ["entregado"];

    const [currentAgg, prevAgg] = await Promise.all([
      AdminAnalyticsDB.getOrderAgg(tenantId, thirtyDaysAgo, undefined, validStatuses),
      AdminAnalyticsDB.getOrderAgg(tenantId, sixtyDaysAgo, thirtyDaysAgo, validStatuses),
    ]);

    const { revenue: currentRevenue, count: currentCount } = currentAgg;
    const { revenue: previousRevenue, count: previousCount } = prevAgg;

    const revPct = previousRevenue
      ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100)
      : 100;
    const countPct = previousCount
      ? Math.round(((currentCount - previousCount) / previousCount) * 100)
      : 100;

    const kpis = [
      {
        label: "Ingresos (30d)",
        value: `S/ ${currentRevenue.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`,
        prevValue: `S/ ${previousRevenue.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`,
        trend: revPct >= 0 ? "up" : "down",
        pct: revPct,
      },
      {
        label: "Ventas (30d)",
        value: currentCount.toString(),
        prevValue: previousCount.toString(),
        trend: countPct >= 0 ? "up" : "down",
        pct: countPct,
      },
    ];

    // Placeholder data for category trends to avoid full table scans in memory
    const categoryTrends = [
      { category: "Abarrotes", currentSales: 15400, previousSales: 12000, trend: "up", growthPct: 28, topProduct: "Arroz Costeño 5kg" },
      { category: "Bebidas", currentSales: 8900, previousSales: 10500, trend: "down", growthPct: -15, topProduct: "Coca Cola 3L" },
      { category: "Lácteos", currentSales: 5200, previousSales: 4800, trend: "up", growthPct: 8, topProduct: "Leche Gloria" },
    ];

    return NextResponse.json({ kpis, categoryTrends });
  } catch (e) {
    logger.error("[analytics] GET error", { tenantId, error: (e as Error).message });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
