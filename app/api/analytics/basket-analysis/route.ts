export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export type Association = {
  productA: string; productB: string; support: number;
  confidence: number; lift: number; count: number; category: string;
};
export type TopCombo = { products: string[]; frequency: number; avgTicket: number };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const period = req.nextUrl.searchParams.get("period") ?? "30d";
  const days = period === "90d" ? 90 : period === "7d" ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const orders = await prisma.order.findMany({
      where: { tenantId: auth.tenantId, createdAt: { gte: since }, status: { not: "cancelado" } },
      select: { id: true, total: true, items: { select: { name: true } } },
    });

    if (orders.length < 5) throw new Error("not-enough-data");

    const totalOrders = orders.length;
    const itemFreq = new Map<string, number>();
    const pairFreq = new Map<string, number>();
    const pairCategory = new Map<string, string>();

    for (const order of orders) {
      const names = [...new Set(order.items.map((i: { name: string }) => i.name))];
      for (const n of names) itemFreq.set(n, (itemFreq.get(n) ?? 0) + 1);
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const key = [names[i], names[j]].sort().join("|||");
          pairFreq.set(key, (pairFreq.get(key) ?? 0) + 1);
          if (!pairCategory.has(key)) {
            pairCategory.set(key, "General");
          }
        }
      }
    }

    const associations: Association[] = [];
    for (const [key, count] of pairFreq.entries()) {
      if (count < 2) continue;
      const [a, b] = key.split("|||");
      const freqA = itemFreq.get(a) ?? 1;
      const freqB = itemFreq.get(b) ?? 1;
      const support = count / totalOrders;
      const confidence = count / freqA;
      const lift = confidence / (freqB / totalOrders);
      associations.push({ productA: a, productB: b, support, confidence, lift, count, category: pairCategory.get(key) ?? "General" });
    }
    associations.sort((a, b) => b.count - a.count);

    const avgBasketSize = orders.reduce((s, o) => s + (o.items?.length ?? 0), 0) / totalOrders;
    const avgBasketValue = orders.reduce((s, o) => s + (o.total ?? 0), 0) / totalOrders;

    return NextResponse.json({ associations: associations.slice(0, 50), avgBasketSize, avgBasketValue, totalOrders });
  } catch {
    return NextResponse.json(buildDemo());
  }
}

function buildDemo() {
  const associations: Association[] = [
    { productA: "Arroz 1kg", productB: "Aceite Vegetal 1L", support: 0.42, confidence: 0.85, lift: 2.1, count: 210, category: "Abarrotes" },
    { productA: "Azúcar 1kg", productB: "Arroz 1kg", support: 0.38, confidence: 0.78, lift: 1.9, count: 190, category: "Abarrotes" },
    { productA: "Fideos 500g", productB: "Tomate x kg", support: 0.35, confidence: 0.72, lift: 2.3, count: 175, category: "Abarrotes" },
    { productA: "Leche Evaporada", productB: "Azúcar 1kg", support: 0.30, confidence: 0.65, lift: 1.7, count: 150, category: "Lácteos" },
    { productA: "Pan de molde", productB: "Mantequilla", support: 0.28, confidence: 0.62, lift: 2.5, count: 140, category: "Panadería" },
    { productA: "Pollo entero", productB: "Arroz 1kg", support: 0.25, confidence: 0.58, lift: 1.5, count: 125, category: "Carnes" },
    { productA: "Detergente 500g", productB: "Jabón de tocador", support: 0.22, confidence: 0.55, lift: 2.0, count: 110, category: "Limpieza" },
    { productA: "Huevos x12", productB: "Aceite Vegetal 1L", support: 0.20, confidence: 0.52, lift: 1.8, count: 100, category: "Abarrotes" },
    { productA: "Café instantáneo", productB: "Leche Evaporada", support: 0.18, confidence: 0.48, lift: 1.6, count: 90, category: "Bebidas" },
    { productA: "Sal 1kg", productB: "Fideos 500g", support: 0.15, confidence: 0.42, lift: 1.4, count: 75, category: "Abarrotes" },
  ];
  return { associations, avgBasketSize: 3.4, avgBasketValue: 54.20, totalOrders: 500, demo: true };
}
