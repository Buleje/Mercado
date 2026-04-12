/**
 * GET /api/me/spending-summary
 *
 * Customer-facing personal spending analytics.
 * Returns monthly spending, category breakdown, trends vs last period,
 * top products, and loyalty info.
 *
 * Auth: requireCustomer (customer session cookie).
 * Schema: Customer PK = phone, Order.customerPhone → Customer.phone
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId: customerPhone } = customer;

  if (!customerPhone) {
    return NextResponse.json(
      { error: "Cuenta no vinculada a perfil de cliente" },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [currentOrders, previousOrders, customerData] = await Promise.all([
      prisma.order.findMany({
        where: {
          tenantId,
          customerPhone,
          createdAt: { gte: thirtyDaysAgo },
          status: { not: "cancelado" },
        },
        include: {
          items: {
            select: { name: true, price: true, quantity: true, productId: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.findMany({
        where: {
          tenantId,
          customerPhone,
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
          status: { not: "cancelado" },
        },
        select: { total: true },
      }),
      prisma.customer.findUnique({
        where: { phone: customerPhone },
        select: {
          loyaltyPoints: true,
          loyaltyTier: true,
          totalSpent: true,
          creditBalance: true,
        },
      }),
    ]);

    // Current period totals
    const currentTotal = currentOrders.reduce(
      (sum, o) => sum + toNumOrZero(o.total),
      0,
    );
    const currentCount = currentOrders.length;
    const currentAvg = currentCount > 0 ? currentTotal / currentCount : 0;

    // Previous period totals
    const previousTotal = previousOrders.reduce(
      (sum, o) => sum + toNumOrZero(o.total),
      0,
    );
    const previousCount = previousOrders.length;

    // Trend
    const spendingTrend =
      previousTotal > 0
        ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100)
        : currentTotal > 0
          ? 100
          : 0;

    // Top products by frequency
    const productMap: Record<string, { name: string; count: number; totalSpent: number }> = {};
    for (const order of currentOrders) {
      for (const item of order.items) {
        const key = item.name;
        if (!productMap[key]) productMap[key] = { name: item.name, count: 0, totalSpent: 0 };
        productMap[key].count += item.quantity;
        productMap[key].totalSpent += toNumOrZero(item.price) * item.quantity;
      }
    }

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        timesBought: p.count,
        totalSpent: +p.totalSpent.toFixed(2),
      }));

    return NextResponse.json({
      period: {
        from: thirtyDaysAgo.toISOString(),
        to: now.toISOString(),
        days: 30,
      },
      spending: {
        total: +currentTotal.toFixed(2),
        orders: currentCount,
        averageOrder: +currentAvg.toFixed(2),
        trend: spendingTrend,
        trendLabel:
          spendingTrend > 5 ? "subiendo" : spendingTrend < -5 ? "bajando" : "estable",
        previousTotal: +previousTotal.toFixed(2),
        previousOrders: previousCount,
      },
      topProducts,
      loyalty: {
        points: customerData?.loyaltyPoints ?? 0,
        tier: customerData?.loyaltyTier ?? "bronce",
        totalSpentAllTime: toNumOrZero(customerData?.totalSpent),
        creditBalance: toNumOrZero(customerData?.creditBalance),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[spending-summary] Error", { tenantId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
