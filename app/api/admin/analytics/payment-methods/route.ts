import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logActivity } from "@/lib/activity-logger";

/**
 * GET /api/admin/analytics/payment-methods
 *
 * Returns revenue breakdown by payment method for the current tenant.
 * Query params:
 *   - days: number of days to look back (default: 30, max: 365)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "analista"]);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, username } = auth;
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validStatuses: any[] = ["entregado", "confirmado", "en_camino", "completado"];

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      status: { in: validStatuses },
      createdAt: { gte: since },
    },
    select: {
      paymentMethod: true,
      total: true,
    },
  });

  // Aggregate by payment method
  const byMethod: Record<string, { count: number; total: number }> = {};
  let grandTotal = 0;

  for (const o of orders) {
    const method = o.paymentMethod || "sin_especificar";
    if (!byMethod[method]) byMethod[method] = { count: 0, total: 0 };
    const amount = toNumOrZero(o.total);
    byMethod[method].count += 1;
    byMethod[method].total += amount;
    grandTotal += amount;
  }

  // Build sorted result
  const breakdown = Object.entries(byMethod)
    .map(([method, data]) => ({
      method,
      label: LABELS[method] || method,
      count: data.count,
      total: Math.round(data.total * 100) / 100,
      percentage: grandTotal > 0 ? Math.round((data.total / grandTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  logActivity(
    "analytics_payment_methods_viewed",
    "analytics",
    JSON.stringify({ days }),
    undefined,
    username,
    undefined,
    tenantId,
  ).catch(() => {});

  return NextResponse.json({
    data: {
      days,
      totalOrders: orders.length,
      totalRevenue: Math.round(grandTotal * 100) / 100,
      breakdown,
    },
  });
}

const LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  mercado_pago: "Mercado Pago",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  marketplace: "Marketplace",
  sin_especificar: "Sin especificar",
};
