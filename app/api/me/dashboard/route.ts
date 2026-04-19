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
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

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
      prisma.customer.findFirst({
        where: { phone: customerPhone, tenantId },
        select: {
          name: true,
          phone: true,
          loyaltyPoints: true,
          loyaltyTier: true,
          totalSpent: true,
          creditBalance: true,
          creditLimit: true,
          referralCode: true,
          createdAt: true,
        },
      }),

      // Last 5 orders with items
      prisma.order.findMany({
        where: { tenantId, customerPhone },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          items: {
            select: { name: true, quantity: true },
            take: 3,
          },
        },
      }),

      // This month aggregate
      prisma.order.aggregate({
        where: {
          tenantId,
          customerPhone,
          createdAt: { gte: thirtyDaysAgo },
          status: { not: "cancelado" },
        },
        _sum: { total: true },
        _count: true,
      }),

      // Saved cart
      prisma.savedCart.findFirst({
        where: { tenantId, customerPhone },
        select: { itemsJson: true, updatedAt: true },
      }),

      // Pending deuda orders (fiado not paid)
      prisma.order.findMany({
        where: {
          tenantId,
          customerPhone,
          deuda: true,
        },
        select: { id: true, total: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
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
