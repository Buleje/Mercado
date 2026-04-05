export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

type DiaRentabilidad = {
  fecha: string;
  ingresos: number;
  costos: number;
  margenBruto: number;
  margenPct: number;
  transacciones: number;
};

/**
 * GET /api/analytics/rentabilidad
 * Returns daily profitability breakdown for the last 30 calendar days.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    const tenantFilter = { tenantId: auth.tenantId };

    // Fetch all sales and their items for the period in two parallel queries
    const [sales, saleItems] = await Promise.all([
      prisma.sale.findMany({
        where: { ...tenantFilter, createdAt: { gte: thirtyDaysAgo } },
        select: { id: true, total: true, createdAt: true },
      }),
      prisma.saleItem.findMany({
        where: { Sale: { ...tenantFilter, createdAt: { gte: thirtyDaysAgo } } },
        select: {
          saleId: true,
          costPrice: true,
          quantity: true,
          Product: { select: { costPrice: true } },
        },
      }),
    ]);

    // Index sale items by saleId for cost lookup
    const costBySale = new Map<string, number>();
    for (const item of saleItems) {
      const cost = item.costPrice ?? item.Product.costPrice ?? 0;
      costBySale.set(item.saleId, (costBySale.get(item.saleId) ?? 0) + cost * item.quantity);
    }

    // Aggregate by day
    const dayMap = new Map<string, { ingresos: number; costos: number; transacciones: number }>();

    // Pre-fill all 30 days
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { ingresos: 0, costos: 0, transacciones: 0 });
    }

    for (const sale of sales) {
      const key = new Date(sale.createdAt).toISOString().slice(0, 10);
      const day = dayMap.get(key);
      if (day) {
        day.ingresos += sale.total;
        day.costos += costBySale.get(sale.id) ?? 0;
        day.transacciones++;
      }
    }

    const dias: DiaRentabilidad[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, d]) => {
        const margenBruto = d.ingresos - d.costos;
        return {
          fecha,
          ingresos: Math.round(d.ingresos * 100) / 100,
          costos: Math.round(d.costos * 100) / 100,
          margenBruto: Math.round(margenBruto * 100) / 100,
          margenPct: d.ingresos > 0 ? Math.round((margenBruto / d.ingresos) * 10000) / 100 : 0,
          transacciones: d.transacciones,
        };
      });

    const totalIngresos = dias.reduce((s, d) => s + d.ingresos, 0);
    const totalCostos = dias.reduce((s, d) => s + d.costos, 0);
    const totalMargen = totalIngresos - totalCostos;

    return NextResponse.json({
      dias,
      resumen: {
        totalIngresos: Math.round(totalIngresos * 100) / 100,
        totalCostos: Math.round(totalCostos * 100) / 100,
        margenPromedio: totalIngresos > 0
          ? Math.round((totalMargen / totalIngresos) * 10000) / 100
          : 0,
      },
    });
  } catch (e) {
    console.error("[analytics/rentabilidad] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
