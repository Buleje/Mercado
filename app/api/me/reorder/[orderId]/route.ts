/**
 * POST /api/me/reorder/[orderId]
 *
 * Quick reorder: takes items from a previous order and returns them
 * as a cart-ready array with CURRENT prices and stock status.
 *
 * Auth: requireCustomer (customer session cookie).
 * Schema: Order.customerPhone → Customer.phone (PK)
 */

import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/auth/require-customer";
import { prisma } from "@/lib/prisma";
import { ProductsDB } from "@/lib/db/products.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { slugify } from "@/data/products";
import { logger } from "@/lib/logger";

interface Props {
  params: Promise<{ orderId: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  const { tenantId, customerId: customerPhone } = customer;
  const { orderId } = await params;

  if (!customerPhone) {
    return NextResponse.json({ error: "Cuenta no vinculada" }, { status: 400 });
  }

  try {
    // Fetch original order — verify ownership via customerPhone
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId, customerPhone },
      include: {
        items: {
          select: {
            productId: true,
            name: true,
            quantity: true,
            price: true,
            unit: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    if (order.items.length === 0) {
      return NextResponse.json({ error: "Este pedido no tiene productos" }, { status: 400 });
    }

    // Fetch current catalog for updated prices + availability
    const allProducts = await ProductsDB.getAll(tenantId);
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    const cartItems: Array<{
      id: number;
      name: string;
      price: number;
      originalPrice: number;
      quantity: number;
      unit: string;
      image: string;
      slug: string;
      available: boolean;
      stockWarning: string | null;
    }> = [];

    let unavailableCount = 0;

    for (const item of order.items) {
      const productId = item.productId ?? 0;
      const currentProduct = productMap.get(productId);

      if (!currentProduct || currentProduct.active === false) {
        cartItems.push({
          id: productId,
          name: item.name,
          price: toNumOrZero(item.price),
          originalPrice: toNumOrZero(item.price),
          quantity: item.quantity,
          unit: item.unit ?? "und",
          image: "/placeholder-product.png",
          slug: slugify(item.name),
          available: false,
          stockWarning: "Este producto ya no esta disponible",
        });
        unavailableCount++;
        continue;
      }

      const stock = currentProduct.stock ?? 999;
      const actualQty = Math.min(item.quantity, stock);
      let stockWarning: string | null = null;

      if (stock === 0) {
        stockWarning = "Agotado";
        unavailableCount++;
      } else if (stock < item.quantity) {
        stockWarning = `Solo quedan ${stock} unidades (pediste ${item.quantity})`;
      }

      cartItems.push({
        id: currentProduct.id,
        name: currentProduct.name,
        price: currentProduct.price,
        originalPrice: toNumOrZero(item.price),
        quantity: actualQty,
        unit: currentProduct.unit ?? "und",
        image: currentProduct.image ?? "/placeholder-product.png",
        slug: slugify(currentProduct.name),
        available: stock > 0,
        stockWarning,
      });
    }

    const newTotal = cartItems
      .filter((i) => i.available)
      .reduce((sum, i) => sum + i.price * i.quantity, 0);
    const originalTotal = toNumOrZero(order.total);

    return NextResponse.json({
      orderId: order.id,
      originalDate: order.createdAt,
      items: cartItems,
      summary: {
        totalItems: cartItems.length,
        availableItems: cartItems.filter((i) => i.available).length,
        unavailableItems: unavailableCount,
        newTotal: +newTotal.toFixed(2),
        originalTotal: +originalTotal.toFixed(2),
        priceDifference: +(newTotal - originalTotal).toFixed(2),
        priceChanged: Math.abs(newTotal - originalTotal) > 0.01,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[reorder] Error", { tenantId, orderId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
