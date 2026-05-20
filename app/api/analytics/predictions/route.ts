import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AnalyticsPredictionsDB } from "@/lib/db/analytics-predictions.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

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
    // Audit project-wide 2026-05-19: migrado a AnalyticsPredictionsDB.
    const [sales28, sales7, products, churnable] = await Promise.all([
      AnalyticsPredictionsDB.getSalesWithItems(tenantId, cutoff28),
      AnalyticsPredictionsDB.aggregateSales(tenantId, cutoff7),
      AnalyticsPredictionsDB.getProductsLowStock(tenantId, 20),
      AnalyticsPredictionsDB.getChurnableCustomers(tenantId, cutoff30, 10),
    ]);

    // ── 1. Proyección de ventas próxima semana ────────────────────────────────
    // Promedio semanal de 4 semanas × factor tendencia
    // TD-018: sale.total y _sum.total son Decimal
    const totalRevenue28 = sales28.reduce((s, sale) => s + toNumOrZero(sale.total), 0);
    const avgWeeklySales = totalRevenue28 / 4;
    const lastWeekRevenue = toNumOrZero(sales7._sum.total);
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
      // TD-018: sale.total es Decimal
      dayTotals[day] += toNumOrZero(sale.total);
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
          ? `https://wa.me/${c.phone.replace(/\D/g, "")}?text=${encodeURIComponent("Hola! Te extrañamos. Tenemos ofertas especiales para ti.")}`
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
    logger.error("[predictions] error", { error: (err as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error al calcular predicciones" }, { status: 500 });
  }
}
