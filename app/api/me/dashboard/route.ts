/**
 * GET /api/me/dashboard
 *
 * Unified customer personal dashboard — single API call that returns:
 * - Profile info
 * - Recent orders (last 5)
 * - Monthly spending summary
 * - Loyalty points + tier
 * - Pending fiado (deuda) orders
 *
 * Auth: requireCustomer (customer session cookie).
 * Schema: Customer PK = phone, Order.customerPhone → Customer.phone
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { anonymousGate } from "@/lib/auth/anonymous-gate";
import { MeDashboardDB } from "@/lib/db/me-dashboard.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

// Next 16 con cacheComponents: force-dynamic es redundante.

export async function GET(req: NextRequest) {
  const anon = anonymousGate(req);
  if (anon) return anon;

  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId: customerPhone, email } = customer;

  if (!customerPhone) {
    return NextResponse.json(
      { error: "Cuenta no vinculada a perfil de cliente" },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      customerData,
      recentOrders,
      monthlyAgg,
      savedCart,
      pendingDeuda,
    ] = await Promise.all([
      // Customer profile — findFirst con tenantId para aislamiento multi-tenant
      // (phone es PK global: findUnique ignora tenantId → cross-tenant leak)
      MeDashboardDB.getCustomerProfile(tenantId, customerPhone),

      // Last 5 orders with items
      MeDashboardDB.getRecentOrders(tenantId, customerPhone, 5),

      // This month aggregate
      MeDashboardDB.getMonthlyAggregate(tenantId, customerPhone, thirtyDaysAgo),

      // Saved cart
      MeDashboardDB.getSavedCart(tenantId, customerPhone),

      // Pending deuda orders (fiado not paid)
      MeDashboardDB.getPendingDeuda(tenantId, customerPhone, 5),
    ]);

    const monthlySpent = toNumOrZero(monthlyAgg._sum?.total);
    const monthlyOrders = monthlyAgg._count ?? 0;

    // Days as customer
    const memberSince = customerData?.createdAt
      ? Math.floor(
          (now.getTime() - new Date(customerData.createdAt).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;

    // Pending deuda total
    const pendingDeudaTotal = pendingDeuda.reduce(
      (sum, f) => sum + toNumOrZero(f.total),
      0,
    );

    // Saved cart count
    let savedCartCount = 0;
    if (savedCart?.itemsJson) {
      try {
        const items = JSON.parse(savedCart.itemsJson);
        savedCartCount = Array.isArray(items) ? items.length : 0;
      } catch { /* corrupted */ }
    }

    return NextResponse.json({
      profile: {
        name: customerData?.name ?? email ?? "Cliente",
        email: email ?? null,
        phone: customerData?.phone ?? customerPhone,
        memberSinceDays: memberSince,
        referralCode: customerData?.referralCode ?? null,
      },
      stats: {
        monthlySpent: +monthlySpent.toFixed(2),
        monthlyOrders,
        totalSpentAllTime: toNumOrZero(customerData?.totalSpent),
        loyaltyPoints: customerData?.loyaltyPoints ?? 0,
        loyaltyTier: customerData?.loyaltyTier ?? "bronce",
        creditBalance: toNumOrZero(customerData?.creditBalance),
        creditLimit: toNumOrZero(customerData?.creditLimit),
        savedCartItems: savedCartCount,
      },
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        status: o.status,
        total: toNumOrZero(o.total),
        date: o.createdAt,
        paymentMethod: o.paymentMethod,
        previewItems: o.items
          .map((i) => `${i.name} x${i.quantity}`)
          .join(", "),
      })),
      fiado: {
        pendingCount: pendingDeuda.length,
        pendingTotal: +pendingDeudaTotal.toFixed(2),
        items: pendingDeuda.map((f) => ({
          orderId: f.id,
          total: toNumOrZero(f.total),
          date: f.createdAt,
        })),
      },
    });
  } catch (err) {
    logger.error("[me/dashboard] Error", { tenantId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
