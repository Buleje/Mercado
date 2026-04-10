/**
 * GET /api/me/order-history
 *
 * Dedicated customer order history endpoint.
 * Returns paginated list of customer's own orders with items.
 *
 * Query params:
 *   ?page=1     — page number (default 1)
 *   ?limit=10   — items per page (default 10, max 50)
 *   ?status=... — filter by status (optional)
 *
 * Auth: requireCustomer
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
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10)));
  const statusFilter = req.nextUrl.searchParams.get("status") ?? undefined;
  const skip = (page - 1) * limit;

  try {
    const where = {
      tenantId,
      customerPhone,
      ...(statusFilter ? { status: statusFilter as "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado" } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          items: {
            select: {
              name: true,
              price: true,
              quantity: true,
              unit: true,
              image: true,
              productId: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        total: toNumOrZero(o.total),
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        notes: o.notes,
        items: o.items.map((i) => ({
          name: i.name,
          price: toNumOrZero(i.price),
          quantity: i.quantity,
          unit: i.unit,
          image: i.image,
          productId: i.productId,
        })),
        itemCount: o.items.length,
        canCancel: o.status === "pendiente",
        canReorder: o.status === "entregado" || o.status === "cancelado",
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[me/order-history] Error", { tenantId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
