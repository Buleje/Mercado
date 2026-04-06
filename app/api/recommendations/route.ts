export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/recommendations?phone=XXXXXXXXX&limit=8
 *
 * Returns personalized product recommendations based on:
 * 1. Products frequently bought by customers who also bought the same items (collaborative filtering)
 * 2. Products from the customer's most-purchased categories
 * 3. Falls back to best-sellers if no history
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "8", 10) || 8, 1), 30);

  try {
    // All active products for final mapping
    const allProducts = await prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, category: true, price: true, image: true, unit: true, stock: true },
    });
    const productMap = new Map(allProducts.map((p) => [p.id, p]));

    let recommended: number[] = [];

    if (phone) {
      // 1. Get customer's purchased product IDs (from orders + sales)
      const [orderItems, saleItems] = await Promise.all([
        prisma.orderItem.findMany({
          where: { Order: { customerPhone: phone, status: { not: "cancelado" } } },
          select: { productId: true },
        }),
        prisma.saleItem.findMany({
          where: { Sale: { customerPhone: phone } },
          select: { productId: true },
        }),
      ]);

      const boughtIds = new Set<number>();
      for (const i of orderItems) if (i.productId) boughtIds.add(i.productId);
      for (const i of saleItems) if (i.productId) boughtIds.add(i.productId);

      if (boughtIds.size > 0) {
        // 2. Find other customers who bought the same products
        const [coOrders, coSales] = await Promise.all([
          prisma.orderItem.findMany({
            where: {
              productId: { in: [...boughtIds] },
              Order: { customerPhone: { not: phone }, status: { not: "cancelado" } },
            },
            select: { Order: { select: { customerPhone: true } } },
          }),
          prisma.saleItem.findMany({
            where: {
              productId: { in: [...boughtIds] },
              Sale: { customerPhone: { not: phone } },
            },
            select: { Sale: { select: { customerPhone: true } } },
          }),
        ]);

        const coPhones = new Set<string>();
        for (const i of coOrders) if (i.Order.customerPhone) coPhones.add(i.Order.customerPhone);
        for (const i of coSales) if (i.Sale.customerPhone) coPhones.add(i.Sale.customerPhone);

        if (coPhones.size > 0) {
          // 3. Get products those co-customers bought (that current customer hasn't)
          const [coOrderItems, coSaleItems] = await Promise.all([
            prisma.orderItem.findMany({
              where: {
                Order: { customerPhone: { in: [...coPhones] }, status: { not: "cancelado" } },
                productId: { notIn: [...boughtIds] },
              },
              select: { productId: true },
            }),
            prisma.saleItem.findMany({
              where: {
                Sale: { customerPhone: { in: [...coPhones] } },
                productId: { notIn: [...boughtIds] },
              },
              select: { productId: true },
            }),
          ]);

          // Score by frequency
          const freq = new Map<number, number>();
          for (const i of coOrderItems) if (i.productId) freq.set(i.productId, (freq.get(i.productId) ?? 0) + 1);
          for (const i of coSaleItems) if (i.productId) freq.set(i.productId, (freq.get(i.productId) ?? 0) + 1);

          recommended = [...freq.entries()]
            .filter(([id]) => productMap.has(id) && (productMap.get(id)!.stock ?? 0) > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id]) => id);
        }

        // 4. Fill with same-category products if not enough
        if (recommended.length < limit) {
          const boughtProducts = [...boughtIds].map((id) => productMap.get(id)).filter(Boolean);
          const catFreq = new Map<string, number>();
          for (const p of boughtProducts) if (p) catFreq.set(p.category, (catFreq.get(p.category) ?? 0) + 1);

          const topCats = [...catFreq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
          const usedIds = new Set([...boughtIds, ...recommended]);

          for (const cat of topCats) {
            if (recommended.length >= limit) break;
            const catProducts = allProducts
              .filter((p) => p.category === cat && !usedIds.has(p.id) && (p.stock ?? 0) > 0)
              .sort((a, b) => b.price - a.price);
            for (const p of catProducts) {
              if (recommended.length >= limit) break;
              recommended.push(p.id);
              usedIds.add(p.id);
            }
          }
        }
      }
    }

    // 5. Fallback: best-sellers from last 30 days
    if (recommended.length < limit) {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const topSold = await prisma.orderItem.groupBy({
        by: ["productId"],
        where: { order: { createdAt: { gte: since }, status: { not: "cancelado" } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: limit * 2,
      });

      const usedIds = new Set(recommended);
      for (const row of topSold) {
        if (recommended.length >= limit) break;
        const id = row.productId;
        if (id && !usedIds.has(id) && productMap.has(id) && (productMap.get(id)!.stock ?? 0) > 0) {
          recommended.push(id);
          usedIds.add(id);
        }
      }
    }

    const results = recommended
      .map((id) => productMap.get(id))
      .filter(Boolean)
      .map((p) => ({
        id: p!.id,
        name: p!.name,
        category: p!.category,
        price: p!.price,
        image: p!.image,
        unit: p!.unit,
      }));

    return NextResponse.json(results);
  } catch (e) {
    console.error("[recommendations] error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
