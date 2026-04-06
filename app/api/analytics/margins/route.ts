import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type MarginProduct = {
  productId: number;
  name: string;
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;   // 0–100
  units: number;
};

export type MarginCategory = {
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
};

export type MarginResponse = {
  products: MarginProduct[];
  byCategory: MarginCategory[];
  summary: {
    totalRevenue: number;
    totalCost: number;
    totalGrossProfit: number;
    overallMarginPct: number;
    productsWithCost: number;
    productsWithoutCost: number;
  };
};

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr instanceof NextResponse) return authErr;

  // Aggregate SaleItems that have costPrice
  const saleItems = await prisma.saleItem.findMany({
    select: { productId: true, name: true, price: true, costPrice: true, quantity: true,
      product: { select: { category: true } } },
  });

  const productMap = new Map<number, { name: string; category: string; revenue: number; cost: number | null; hasCost: boolean; units: number }>();

  for (const item of saleItems) {
    const existing = productMap.get(item.productId) ?? { name: item.name, category: item.product?.category ?? "Sin categoría", revenue: 0, cost: 0, hasCost: item.costPrice != null, units: 0 };
    existing.revenue += item.price * item.quantity;
    if (item.costPrice != null) {
      existing.cost = (existing.cost ?? 0) + item.costPrice * item.quantity;
      existing.hasCost = true;
    }
    existing.units += item.quantity;
    productMap.set(item.productId, existing);
  }

  const products: MarginProduct[] = Array.from(productMap.entries())
    .map(([productId, d]) => {
      const cost = d.cost ?? 0;
      const grossProfit = d.revenue - cost;
      const marginPct = d.revenue > 0 ? Math.round((grossProfit / d.revenue) * 10000) / 100 : 0;
      return {
        productId,
        name: d.name,
        category: d.category,
        revenue: Math.round(d.revenue * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        marginPct,
        units: d.units,
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);

  // Aggregate by category
  const catMap = new Map<string, { revenue: number; cost: number }>();
  for (const p of products) {
    const existing = catMap.get(p.category) ?? { revenue: 0, cost: 0 };
    existing.revenue += p.revenue;
    existing.cost    += p.cost;
    catMap.set(p.category, existing);
  }

  const byCategory: MarginCategory[] = Array.from(catMap.entries())
    .map(([category, d]) => {
      const grossProfit = d.revenue - d.cost;
      return { category, revenue: Math.round(d.revenue * 100) / 100, cost: Math.round(d.cost * 100) / 100, grossProfit: Math.round(grossProfit * 100) / 100, marginPct: d.revenue > 0 ? Math.round((grossProfit / d.revenue) * 10000) / 100 : 0 };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalCost    = products.reduce((s, p) => s + p.cost, 0);
  const totalGrossProfit = totalRevenue - totalCost;

  return NextResponse.json({
    products,
    byCategory,
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost:    Math.round(totalCost * 100) / 100,
      totalGrossProfit: Math.round(totalGrossProfit * 100) / 100,
      overallMarginPct: totalRevenue > 0 ? Math.round((totalGrossProfit / totalRevenue) * 10000) / 100 : 0,
      productsWithCost:    [...productMap.values()].filter(d => d.hasCost).length,
      productsWithoutCost: [...productMap.values()].filter(d => !d.hasCost).length,
    },
  } satisfies MarginResponse);
}
