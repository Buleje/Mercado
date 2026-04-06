export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

// GET — Pronóstico de demanda para un producto
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const productIdStr = req.nextUrl.searchParams.get("productId");
  const daysStr = req.nextUrl.searchParams.get("days") ?? "30";

  if (!productIdStr) {
    return NextResponse.json({ error: "productId es requerido" }, { status: 400 });
  }

  const productId = parseInt(productIdStr, 10);
  const days = Math.min(parseInt(daysStr, 10) || 30, 90);

  if (isNaN(productId)) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  try {
    // Get product info
    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId: auth.tenantId },
      select: { id: true, name: true, stock: true, stockMin: true, costPrice: true, price: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    // Get sales in the period
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const saleItems = await prisma.saleItem.findMany({
      where: {
        productId,
        sale: {
          tenantId: auth.tenantId,
          createdAt: { gte: daysAgo },
        },
      },
      select: {
        quantity: true,
        sale: { select: { createdAt: true } },
      },
    });

    // Group by day
    const dailyMap = new Map<string, number>();
    const now = new Date();

    // Initialize all days with 0
    for (let d = 0; d < days; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() - d);
      const key = date.toISOString().split('T')[0];
      dailyMap.set(key, 0);
    }

    // Fill with actual sales
    for (const item of saleItems) {
      const key = item.sale.createdAt.toISOString().split('T')[0];
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + item.quantity);
    }

    // Convert to sorted array
    const historicalSales = Array.from(dailyMap.entries())
      .map(([date, qty]) => ({ date, qty }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Calculate stats
    const totalQty = saleItems.reduce((sum, i) => sum + i.quantity, 0);
    const dailyAvg = totalQty / days;
    const weeklyAvg = dailyAvg * 7;

    // Trend: compare first half vs second half
    const halfDays = Math.floor(days / 2);
    const firstHalfSales = historicalSales.slice(0, halfDays);
    const secondHalfSales = historicalSales.slice(halfDays);

    const firstHalfTotal = firstHalfSales.reduce((sum, d) => sum + d.qty, 0);
    const secondHalfTotal = secondHalfSales.reduce((sum, d) => sum + d.qty, 0);

    const firstHalfAvg = firstHalfSales.length > 0 ? firstHalfTotal / firstHalfSales.length : 0;
    const secondHalfAvg = secondHalfSales.length > 0 ? secondHalfTotal / secondHalfSales.length : 0;

    let trend: "SUBIENDO" | "ESTABLE" | "BAJANDO" = "ESTABLE";
    if (firstHalfAvg > 0) {
      if (secondHalfAvg > firstHalfAvg * 1.1) trend = "SUBIENDO";
      else if (secondHalfAvg < firstHalfAvg * 0.9) trend = "BAJANDO";
    }

    // Forecast
    const trendMultiplier = trend === "SUBIENDO" ? 1.1 : trend === "BAJANDO" ? 0.9 : 1;
    const forecastNext7 = Math.round(dailyAvg * 7 * trendMultiplier);

    // Days of stock
    const daysOfStock = dailyAvg > 0 ? Math.round((product.stock ?? 0) / dailyAvg) : 999;

    // Reorder point (1 week buffer)
    const reorderPoint = Math.ceil(dailyAvg * 7);

    // Seasonal notes
    let seasonalNote: string | null = null;

    // Check for quincena (paydays: 1st and 15th)
    for (let d = 0; d <= 7; d++) {
      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + d);
      const dayOfMonth = futureDate.getDate();
      if (dayOfMonth === 1 || dayOfMonth === 15) {
        if (d > 0) {
          seasonalNote = `Proxima quincena en ${d} dias — espera +40% demanda`;
        } else {
          seasonalNote = `Hoy es dia de quincena — espera +40% demanda`;
        }
        break;
      }
    }

    // Check for Peruvian holidays in next 7 days
    const peruHolidays: { month: number; day: number; name: string }[] = [
      { month: 1, day: 1, name: "Ano Nuevo" },
      { month: 5, day: 1, name: "Dia del Trabajo" },
      { month: 6, day: 29, name: "San Pedro y San Pablo" },
      { month: 7, day: 28, name: "Fiestas Patrias" },
      { month: 7, day: 29, name: "Fiestas Patrias" },
      { month: 8, day: 30, name: "Santa Rosa de Lima" },
      { month: 10, day: 8, name: "Combate de Angamos" },
      { month: 11, day: 1, name: "Dia de Todos los Santos" },
      { month: 12, day: 8, name: "Inmaculada Concepcion" },
      { month: 12, day: 25, name: "Navidad" },
    ];

    if (!seasonalNote) {
      for (let d = 1; d <= 7; d++) {
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + d);
        const holiday = peruHolidays.find(
          h => h.month === futureDate.getMonth() + 1 && h.day === futureDate.getDate()
        );
        if (holiday) {
          seasonalNote = `Feriado "${holiday.name}" en ${d} dias`;
          break;
        }
      }
    }

    return NextResponse.json({
      historicalSales,
      dailyAvg: Math.round(dailyAvg * 10) / 10,
      weeklyAvg: Math.round(weeklyAvg * 10) / 10,
      trend,
      forecastNext7,
      daysOfStock,
      reorderPoint,
      seasonalNote,
      product: {
        id: product.id,
        name: product.name,
        stock: product.stock ?? 0,
        stockMin: product.stockMin ?? 0,
      },
    });
  } catch (e) {
    console.error("[forecast/GET]", e);
    return NextResponse.json({ error: "Error al calcular pronóstico" }, { status: 500 });
  }
}
