import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/jsondb";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { toNumOrZero } from "@/lib/decimal-utils";

// GET /api/customers/[phone]/favorite-products
// Top 5 productos mas comprados por el cliente (ventas POS + orders)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`fav-products:${ip}`, 20, 60);
  if (!allowed) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { phone } = await params;
  const normalized = normalizePhone(phone);

  try {
    // Aggregate from SaleItems (POS sales)
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: { customerPhone: normalized },
      },
      select: {
        productId: true,
        name: true,
        quantity: true,
        price: true,
        sale: { select: { createdAt: true } },
      },
    });

    // Aggregate from OrderItems (online orders) — exclude cancelled
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          customerPhone: normalized,
          status: { not: "cancelado" },
        },
      },
      select: {
        productId: true,
        name: true,
        quantity: true,
        price: true,
        order: { select: { createdAt: true } },
      },
    });

    // Merge both sources
    const productMap = new Map<
      number,
      { productId: number; name: string; totalQty: number; totalSpent: number; purchaseCount: number; firstDate: Date; lastDate: Date }
    >();

    for (const item of saleItems) {
      const pid = item.productId;
      const existing = productMap.get(pid);
      const date = item.sale.createdAt;
      const lineTotal = toNumOrZero(item.price) * item.quantity;
      if (existing) {
        existing.totalQty += item.quantity;
        existing.totalSpent += lineTotal;
        existing.purchaseCount += 1;
        if (date < existing.firstDate) existing.firstDate = date;
        if (date > existing.lastDate) existing.lastDate = date;
      } else {
        productMap.set(pid, {
          productId: pid,
          name: item.name,
          totalQty: item.quantity,
          totalSpent: lineTotal,
          purchaseCount: 1,
          firstDate: date,
          lastDate: date,
        });
      }
    }

    for (const item of orderItems) {
      if (!item.productId) continue;
      const pid = item.productId;
      const existing = productMap.get(pid);
      const date = item.order.createdAt;
      const lineTotal = toNumOrZero(item.price) * item.quantity;
      if (existing) {
        existing.totalQty += item.quantity;
        existing.totalSpent += lineTotal;
        existing.purchaseCount += 1;
        if (date < existing.firstDate) existing.firstDate = date;
        if (date > existing.lastDate) existing.lastDate = date;
      } else {
        productMap.set(pid, {
          productId: pid,
          name: item.name,
          totalQty: item.quantity,
          totalSpent: lineTotal,
          purchaseCount: 1,
          firstDate: date,
          lastDate: date,
        });
      }
    }

    // Sort by totalQty desc, take top 5
    const sorted = Array.from(productMap.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5);

    // Calculate frequency (purchases per month)
    const result = sorted.map((p) => {
      const spanMs = Math.max(p.lastDate.getTime() - p.firstDate.getTime(), 30 * 24 * 60 * 60 * 1000);
      const spanMonths = spanMs / (30 * 24 * 60 * 60 * 1000);
      const freqPerMonth = p.purchaseCount / spanMonths;
      return {
        productId: p.productId,
        name: p.name,
        totalQty: p.totalQty,
        totalSpent: Math.round(p.totalSpent * 100) / 100,
        purchaseCount: p.purchaseCount,
        freqPerMonth: Math.round(freqPerMonth * 10) / 10,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error("[favorite-products] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
