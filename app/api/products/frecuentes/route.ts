import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/products/frecuentes?limit=8
 * Returns the top products by quantity sold today.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 8, 20);
  const tenantId = auth.tenantId ?? "main";

  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const topItems = await prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      where: {
        sale: {
          tenantId,
          createdAt: { gte: startOfToday },
        },
      },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });

    if (topItems.length === 0) {
      return NextResponse.json([]);
    }

    const productIds = topItems.map((item) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, active: true, tenantId },
      select: { id: true, name: true, price: true, image: true, stock: true, unit: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    const results = topItems
      .map((item) => {
        const product = productMap.get(item.productId);
        if (!product) return null;
        return {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          stock: product.stock,
          unit: product.unit,
          soldToday: item._sum.quantity ?? 0,
        };
      })
      .filter(Boolean);

    return NextResponse.json(results);
  } catch (e) {
    console.error("[products/frecuentes] error:", e);
    return NextResponse.json([]);
  }
}
