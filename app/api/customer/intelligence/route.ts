import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * GET /api/customer/intelligence
 *
 * Retorna signals agregados del cliente para personalización (ADR-065 Ola H).
 *
 * Lee cookie de customer session → arma el contexto desde Customer + Order.
 * Si no hay sesión → retorna datos de "first visit" (anónimo).
 *
 * Cache: private 2 min (customer-specific).
 */
export async function GET(req: NextRequest) {
  try {
    const { getCustomerPayload, CUSTOMER_SESSION } = await import("@/lib/auth/customer-session");
    // FIX aislamiento 2026-06-23: antes leía la cookie inexistente "buleje_customer"
    // (la real es CUSTOMER_SESSION.COOKIE_NAME = "buleje-customer-sess") → siempre
    // caía en anónimo, enmascarando una fuga: las queries de abajo no llevaban
    // tenantId. Ahora lee la cookie correcta y exige tenantId del payload.
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    const session = sessionToken ? await getCustomerPayload(sessionToken) : null;

    // Anónimo / first visit (o sesión sin tenant → no podemos aislar, anónimo).
    if (!session?.customerId || !session.tenantId) {
      return NextResponse.json({
        name: null,
        isFirstVisit: true,
        isRecurring: false,
        daysSinceLastOrder: null,
        streakDays: 0,
        topProduct: null,
        isBirthday: false,
        city: null,
        loyaltyPoints: 0,
        loyaltyTier: null,
      });
    }

    const { prisma } = await import("@/lib/prisma");
    // Tenant de la sesión del cliente — TODA query lleva este scope (aislamiento).
    const tenantId = session.tenantId;

    // Paralelizar
    const [customer, recentOrders, topItem] = await Promise.all([
      prisma.customer
        .findFirst({
          where: { phone: session.customerId, tenantId },
          select: {
            name: true,
            location: true,
            birthday: true,
            loyaltyPoints: true,
            loyaltyTier: true,
            createdAt: true,
          },
        })
        .catch((err) => {
          logger.warn("[intelligence] customer lookup failed", { err: String(err) });
          return null;
        }),

      // Últimos 30 días de pedidos para streak + cadence
      prisma.order
        .findMany({
          where: {
            tenantId,
            customerPhone: session.customerId,
            status: { not: "cancelado" },
            createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          select: { createdAt: true, total: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
        .catch(() => [] as Array<{ createdAt: Date; total: number }>),

      // Top producto más pedido (últimos 60 días)
      prisma.orderItem
        .groupBy({
          by: ["productId", "name"],
          where: {
            order: {
              tenantId,
              customerPhone: session.customerId,
              createdAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
            },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 1,
        })
        .catch(() => [] as Array<{ productId: number | null; name: string; _sum: { quantity: number | null } }>),
    ]);

    // Compute signals
    const isRecurring = recentOrders.length >= 2;
    const lastOrder = recentOrders[0];
    const daysSinceLastOrder = lastOrder
      ? Math.floor((Date.now() - lastOrder.createdAt.getTime()) / (24 * 60 * 60 * 1000))
      : null;

    // Streak: consecutive days with >= 1 order (from today backwards)
    const orderDays = new Set(
      recentOrders.map((o) =>
        new Date(o.createdAt.getFullYear(), o.createdAt.getMonth(), o.createdAt.getDate()).toISOString(),
      ),
    );
    let streakDays = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (orderDays.has(d.toISOString())) streakDays++;
      else break;
    }

    // Birthday check (month + day match)
    let isBirthday = false;
    if (customer?.birthday) {
      const bd = new Date(customer.birthday);
      const now = new Date();
      isBirthday = bd.getMonth() === now.getMonth() && bd.getDate() === now.getDate();
    }

    // Top product + cadence estimate
    let topProduct: { name: string; daysUntilLikelyOut: number } | null = null;
    if (topItem[0] && topItem[0].name) {
      // Cadence heuristic: if he bought X quantity in 60 days, estimate when he'll likely need it again
      const qty = topItem[0]._sum.quantity ?? 1;
      const avgDaysPerUnit = 60 / qty;
      topProduct = {
        name: topItem[0].name,
        daysUntilLikelyOut: Math.max(1, Math.round(avgDaysPerUnit)),
      };
    }

    return NextResponse.json({
      name: customer?.name ?? null,
      isFirstVisit: !customer || recentOrders.length === 0,
      isRecurring,
      daysSinceLastOrder,
      streakDays,
      topProduct,
      isBirthday,
      city: customer?.location ?? null,
      loyaltyPoints: customer?.loyaltyPoints ?? 0,
      loyaltyTier: (customer?.loyaltyTier as "bronce" | "plata" | "oro" | "diamante" | null) ?? "bronce",
    }, {
      headers: {
        "Cache-Control": "private, max-age=120, stale-while-revalidate=60",
      },
    });
  } catch {
    // Fallback anónimo
    return NextResponse.json({
      name: null,
      isFirstVisit: true,
      isRecurring: false,
      daysSinceLastOrder: null,
      streakDays: 0,
      topProduct: null,
      isBirthday: false,
      city: null,
      loyaltyPoints: 0,
      loyaltyTier: null,
    });
  }
}
