export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { OrdersDB } from "@/lib/db/orders.db";
import { ProductsDB } from "@/lib/db/products.db";
import { logger } from "@/lib/logger";

// ── Helpers de rango de fechas ────────────────────────────────────────────────

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ── GET /api/marketplace/vendor/dashboard ────────────────────────────────────

export async function GET(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? undefined;

  const auth = await requireAdmin(req, ["admin", "tienda_owner", "proveedor"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  logger.info("vendor-dashboard: fetching", { tenantId, requestId });

  const today = new Date();
  const yesterday = daysAgo(1);
  const lastWeekSameDay = daysAgo(7);

  try {
    const [
      salesToday,
      salesYesterday,
      salesLastWeek,
      pendingOrdersCount,
      pendingOrders,
      lowStockProducts,
      recentSales,
      weeklyRevenue,
    ] = await Promise.all([
      OrdersDB.getSalesTotal(tenantId, startOfDay(today), endOfDay(today)),
      OrdersDB.getSalesTotal(tenantId, startOfDay(yesterday), endOfDay(yesterday)),
      OrdersDB.getSalesTotal(tenantId, startOfDay(lastWeekSameDay), endOfDay(lastWeekSameDay)),
      OrdersDB.countPending(tenantId),
      OrdersDB.getPending(tenantId, { limit: 5 }),
      ProductsDB.getLowStock(tenantId, { threshold: 5, limit: 10 }),
      OrdersDB.getRecent(tenantId, { limit: 5 }),
      OrdersDB.getWeeklyRevenueBreakdown(tenantId),
    ]);

    logger.info("vendor-dashboard: ok", { tenantId, requestId, pendingOrdersCount });

    return NextResponse.json({
      kpis: {
        salesToday,
        salesYesterday,
        salesLastWeek,
        pendingOrdersCount,
        lowStockCount: lowStockProducts.length,
      },
      pendingOrders,
      lowStockProducts,
      recentSales,
      weeklyRevenue,
    });
  } catch (err) {
    logger.error("vendor-dashboard: error", {
      tenantId,
      requestId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error al cargar el dashboard" }, { status: 500 });
  }
}
