export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/analytics/predictions
 * Predicciones simples basadas en promedios y tendencias historicas.
 * No requiere ML — solo matematica descriptiva.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const tenantId = auth.tenantId;

    // Ventana de 28 dias para calcular promedios
    const cutoff28 = new Date(now);
    cutoff28.setDate(cutoff28.getDate() - 28);

    // Ventana de 7 dias (semana pasada) para tendencia
    const cutoff7 = new Date(now);
    cutoff7.setDate(cutoff7.getDate() - 7);

    // Ventana de 30 dias para clientes en riesgo
    const cutoff30 = new Date(now);
    cutoff30.setDate(cutoff30.getDate() - 30);

    // ── Fetch paralelo de los datos necesarios ────────────────────────────────
    const [sales28, sales7, products, churnable] = await Promise.all([
      // Ventas de los últimos 28 días
      prisma.sale.findMany({
        where: { tenantId, createdAt: { gte: cutoff28 } },
        select: { total: true, createdAt: true, items: { select: { productId: true, quantity: true } } },
      }),

      // Ventas de la última semana (para tendencia)
      prisma.sale.aggregate({
        where: { tenantId, createdAt: { gte: cutoff7 } },
        _sum: { total: true },
        _count: true,
      }),

      // Productos con stock bajo para riesgo de agotamiento
      prisma.product.findMany({
        where: { tenantId, active: true, stock: { gt: 0 } },
        select: { id: true, name: true, stock: true, image: true },
        orderBy: { stock: "asc" },
        take: 20,
      }),

      // Clientes que no compran hace 30+ días — usando la última orden relacionada
      // Customer.phone es la PK; lastOrderAt no existe en el modelo.
      // Obtenemos clientes activos con órdenes previas al cutoff30.
      prisma.customer.findMany({
        where: {
          tenantId,
          orders: {
            some: { createdAt: { lt: cutoff30 }, deletedAt: null },
            none: { createdAt: { gte: cutoff30 }, deletedAt: null },
          },
        },
        select: { name: true, phone: true, orders: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
        take: 10,
      }),
    ]);

    // ── 1. Proyección de ventas próxima semana ────────────────────────────────
    // Promedio semanal de 4 semanas × factor tendencia
    const totalRevenue28 = sales28.reduce((s, sale) => s + (sale.total ?? 0), 0);
    const avgWeeklySales = totalRevenue28 / 4;
    const lastWeekRevenue = sales7._sum.total ?? 0;
    // Tendencia: ratio semana pasada vs promedio semanal (capped entre 0.5 y 2)
    const trendFactor = avgWeeklySales > 0
      ? Math.min(2, Math.max(0.5, lastWeekRevenue / avgWeeklySales))
      : 1;
    const salesForecast = Math.round(avgWeeklySales * trendFactor * 100) / 100;
    const trendPct = Math.round((trendFactor - 1) * 100);

    // ── 2. Productos en riesgo de agotamiento ─────────────────────────────────
    // Ventas diarias promedio por producto (últimos 28 días)
    // SaleItem.productId es Int (number); Product.id es también Int
    const productSalesMap = new Map<number, number>();
    for (const sale of sales28) {
      for (const item of sale.items) {
        const prev = productSalesMap.get(item.productId) ?? 0;
        productSalesMap.set(item.productId, prev + (item.quantity ?? 1));
      }
    }

    const stockRisk = products
      .map(p => {
        const sold28 = productSalesMap.get(p.id) ?? 0;
        const avgDailySales = sold28 / 28;
        const daysLeft = avgDailySales > 0 ? Math.floor((p.stock ?? 0) / avgDailySales) : 999;
        return { id: p.id, name: p.name, stock: p.stock ?? 0, daysLeft, image: p.image ?? null };
      })
      .filter(p => p.daysLeft <= 7 && p.daysLeft < 999)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);

    // ── 3. Mejor día para comprar a proveedor ─────────────────────────────────
    // El día con menos ventas = menos interrupciones para recibir mercadería
    const dayTotals: number[] = [0, 0, 0, 0, 0, 0, 0]; // Dom=0 … Sab=6
    const dayCounts: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const sale of sales28) {
      const day = new Date(sale.createdAt).getDay();
      dayTotals[day] += sale.total ?? 0;
      dayCounts[day]++;
    }
    const dayAvgs = dayTotals.map((t, i) => dayCounts[i] > 0 ? t / dayCounts[i] : 0);
    const minAvg = Math.min(...dayAvgs.filter(v => v > 0));
    const bestDayIdx = dayAvgs.indexOf(minAvg);
    const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
    const bestPurchaseDay = {
      day: DAY_NAMES[bestDayIdx] ?? "Lunes",
      reason: `Es el dia con menos ventas en promedio (S/${minAvg.toFixed(2)}/venta)`,
      avgSales: Math.round(minAvg * 100) / 100,
    };

    // ── 4. Clientes en riesgo de abandono ─────────────────────────────────────
    // Customer.phone es la PK; se usa como identificador único
    const churnRisk = churnable.map(c => {
      const lastOrderDate = c.orders[0]?.createdAt ?? null;
      const daysAgo = lastOrderDate
        ? Math.floor((now.getTime() - lastOrderDate.getTime()) / 86400000)
        : null;
      return {
        id: c.phone,
        name: c.name ?? "Cliente",
        phone: c.phone ?? "",
        daysAgo,
        whatsappUrl: c.phone
          ? `https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent("Hola! Te extrañamos en Bodega San Martín. Tenemos ofertas especiales para ti.")}`
          : null,
      };
    });

    // ── 5. Hora pico ──────────────────────────────────────────────────────────
    const hourCounts: number[] = Array(24).fill(0);
    for (const sale of sales28) {
      const hour = new Date(sale.createdAt).getHours();
      hourCounts[hour]++;
    }
    const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
    const peakHour = {
      hour: peakHourIdx,
      label: `${peakHourIdx}:00 - ${peakHourIdx + 1}:00`,
      salesCount: hourCounts[peakHourIdx],
    };

    return NextResponse.json({
      salesForecast,
      trendPct,
      stockRisk,
      bestPurchaseDay,
      churnRisk,
      peakHour,
      generatedAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[predictions]", err);
    return NextResponse.json({ error: "Error al calcular predicciones" }, { status: 500 });
  }
}
