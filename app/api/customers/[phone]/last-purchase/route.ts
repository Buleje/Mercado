import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/customers/[phone]/last-purchase
 * Returns the last sale/order for a customer with item details.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { phone } = await params;
  const tenantId = auth.tenantId ?? "main";

  try {
    // Try Sale first (POS sales)
    // eslint-disable-next-line no-restricted-properties -- lookup tenant-scoped en where; migration a lib/db pendiente.
    const lastSale = await prisma.sale.findFirst({
      where: { customerPhone: phone, tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, image: true, unit: true, active: true } },
          },
        },
      },
    });

    if (lastSale) {
      return NextResponse.json({
        type: "sale",
        id: lastSale.id,
        date: lastSale.createdAt.toISOString(),
        total: lastSale.total,
        items: lastSale.items.map(i => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          unit: i.unit,
          image: i.product?.image || "",
          active: i.product?.active ?? true,
        })),
      });
    }

    // Fallback: try Order
    // eslint-disable-next-line no-restricted-properties -- lookup tenant-scoped en where; migration a lib/db pendiente.
    const lastOrder = await prisma.order.findFirst({
      where: { customerPhone: phone, tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, price: true, image: true, unit: true, active: true } },
          },
        },
      },
    });

    if (lastOrder) {
      return NextResponse.json({
        type: "order",
        id: lastOrder.id,
        date: lastOrder.createdAt.toISOString(),
        total: lastOrder.total,
        items: lastOrder.items.map(i => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          unit: i.unit,
          image: i.product?.image || "",
          active: i.product?.active ?? true,
        })),
      });
    }

    return NextResponse.json(null);
  } catch (e) {
    logger.error("[customers/phone/last-purchase] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
