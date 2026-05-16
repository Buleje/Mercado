import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

// Brandon 2026-05-16 (audit Info): force-dynamic obligatorio.
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/payment-methods
 *
 * Returns revenue breakdown by payment method for the current tenant.
 *
 * Query params:
 *   - days: number of days to look back (default: 30, max: 365)
 *
 * Perf (Bug Hunter Report 2026-04-30):
 *   Antes: findMany cargaba TODOS los orders del periodo en memoria JS y
 *   agrupaba con un loop manual. Para tenants con alto volumen (5000+
 *   orders/365d) podia causar OOM o timeout. Ahora usa Prisma.groupBy
 *   que delega el SUM/COUNT a Postgres — 1 query, O(filas/grupo) memoria.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "analista"]);
  if (auth instanceof NextResponse) return auth;

  const { tenantId, username } = auth;
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Brandon mayo 2026 v7: solo `entregado` cuenta como venta para métricas
  // de payment methods. Pedidos en confirmado/en_camino pueden cancelarse
  // y distorsionan la atribución por medio de pago.
  const validStatuses: ["entregado"] = ["entregado"];

  // 1 query agregada — Postgres hace COUNT + SUM por paymentMethod.
  // eslint-disable-next-line no-restricted-properties -- analytics scoped por tenantId; agregacion server-side.
  const grouped = await prisma.order.groupBy({
    by: ["paymentMethod"],
    where: {
      tenantId,
      status: { in: validStatuses },
      createdAt: { gte: since },
    },
    _count: { _all: true },
    _sum: { total: true },
  });

  // Normalizar null -> "sin_especificar" y calcular grand total desde el agregado.
  const byMethod: Record<string, { count: number; total: number }> = {};
  let grandTotal = 0;
  let totalOrders = 0;
  for (const g of grouped) {
    const method = g.paymentMethod || "sin_especificar";
    const amount = toNumOrZero(g._sum.total);
    const count = g._count._all;
    if (!byMethod[method]) byMethod[method] = { count: 0, total: 0 };
    byMethod[method].count += count;
    byMethod[method].total += amount;
    grandTotal += amount;
    totalOrders += count;
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
  ).catch((err) => logger.error("[analytics/payment-methods] logActivity failed", { tenantId, error: (err as Error).message }));

  return NextResponse.json({
    data: {
      days,
      totalOrders,
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
