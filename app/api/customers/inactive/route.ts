import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import { getOrSet } from "@/lib/cache";

/**
 * GET /api/customers/inactive
 * Returns customers who haven't purchased in X days (default 30).
 * Calculates from Order + Sale tables (no lastPurchaseAt field needed).
 */
export async function GET(request: NextRequest) {
  const rl = await applyRateLimit(request, "MODERATE", "customers-inactive");
  if (rl) return rl;

  const auth = await requireAdmin(request, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const days = Math.min(Math.max(parseInt(daysParam || "30", 10) || 30, 7), 365);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "100", 10);
  const take = Math.min(Math.max(1, isNaN(limitParam) ? 100 : limitParam), 500);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tenantId = auth.tenantId;

  const cacheKey = `customers:inactive:${tenantId}:${days}`;
  const data = await getOrSet(cacheKey, 300, () => withDbRetry(async () => {
    // Get all customers with their latest order/sale dates
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      select: {
        phone: true,
        name: true,
        totalSpent: true,
        loyaltyTier: true,
        estado: true,
        createdAt: true,
        orders: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        sales: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    const inactive = customers
      .map((c) => {
        const lastOrder = c.orders[0]?.createdAt;
        const lastSale = c.sales[0]?.createdAt;
        const lastActivity = lastOrder && lastSale
          ? new Date(Math.max(lastOrder.getTime(), lastSale.getTime()))
          : lastOrder || lastSale || null;

        const daysSinceLast = lastActivity
          ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000)
          : Math.floor((Date.now() - c.createdAt.getTime()) / 86400000);

        return {
          phone: c.phone,
          name: c.name,
          totalSpent: c.totalSpent,
          loyaltyTier: c.loyaltyTier,
          estado: c.estado,
          lastActivity: lastActivity?.toISOString() ?? null,
          daysSinceLast,
          risk: daysSinceLast >= 60 ? "alto" as const
            : daysSinceLast >= 30 ? "medio" as const
            : "bajo" as const,
        };
      })
      .filter((c) => {
        const la = c.lastActivity ? new Date(c.lastActivity) : null;
        // Inactive = no activity after cutoff OR never purchased
        return (la && la < cutoff) || (!la && c.daysSinceLast >= days);
      })
      .sort((a, b) => b.daysSinceLast - a.daysSinceLast)
      // Cap result set: default 100, max 500 — prevent bulk PII leak
      .slice(0, take);

    return inactive;
  }));

  return NextResponse.json({
    ok: true,
    days,
    limit: take,
    total: data.length,
    customers: data,
  }, {
    headers: {
      "X-Total-Count": String(data.length),
      "Cache-Control": "private, max-age=300",
    },
  });
}
