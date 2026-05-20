import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AnalyticsKpisV2DB } from "@/lib/db/analytics-kpis-v2.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

/**
 * GET /api/analytics/kpis-v2
 * 6 KPIs with sparklines, margins, fiado, and inventory rotation.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Date ranges
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Same weekday last week for comparison
    const sameDayLastWeek = new Date(todayStart);
    sameDayLastWeek.setDate(sameDayLastWeek.getDate() - 7);
    const sameDayLastWeekEnd = new Date(sameDayLastWeek);
    sameDayLastWeekEnd.setDate(sameDayLastWeekEnd.getDate() + 1);

    // Sparkline: last 7 days
    const sparklineDates: { start: Date; end: Date }[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      sparklineDates.push({ start, end });
    }

    // Audit project-wide 2026-05-19: migrado a AnalyticsKpisV2DB (13 queries).
    const tid = auth.tenantId;
    const results = await Promise.allSettled([
      // KPI 1: Ingresos hoy + sparkline 7 días
      Promise.all([
        AnalyticsKpisV2DB.ingresosForRange(tid, todayStart),
        AnalyticsKpisV2DB.ingresosForRange(tid, sameDayLastWeek, sameDayLastWeekEnd),
        ...sparklineDates.map((d) => AnalyticsKpisV2DB.ingresosForRange(tid, d.start, d.end)),
      ]),

      // KPI 2: Ticket promedio últimos 30d vs 30d anteriores
      Promise.all([
        AnalyticsKpisV2DB.ticketAvg(tid, thirtyDaysAgo),
        AnalyticsKpisV2DB.ticketAvg(tid, sixtyDaysAgo, thirtyDaysAgo),
      ]),

      // KPI 3: Margen operativo (ingresos y costos últimos 30d)
      Promise.all([
        AnalyticsKpisV2DB.ingresosForRange(tid, thirtyDaysAgo),
        AnalyticsKpisV2DB.saleItemsForCogs(tid, thirtyDaysAgo),
      ]),

      // KPI 4: Clientes activos (distinct customerPhone últimos 30d) vs 30d anteriores
      Promise.all([
        AnalyticsKpisV2DB.distinctCustomersInRange(tid, thirtyDaysAgo),
        AnalyticsKpisV2DB.distinctCustomersInRange(tid, sixtyDaysAgo, thirtyDaysAgo),
      ]),

      // KPI 5: Fiado pendiente
      (async () => {
        try {
          const [pendiente, vencidos] = await Promise.all([
            AnalyticsKpisV2DB.aggregateFiadoActive(tid),
            AnalyticsKpisV2DB.countFiadoVencidos(tid, now),
          ]);
          return { pendiente, vencidos };
        } catch {
          return null;
        }
      })(),

      // KPI 6: Rotación inventario
      Promise.all([
        AnalyticsKpisV2DB.saleItemsForCogs(tid, thirtyDaysAgo),
        AnalyticsKpisV2DB.productsForInventoryValue(tid),
      ]),
    ]);

    // Helper: calc cost from sale items (TD-018: costPrice es Decimal)
    type SaleItemForCost = {
      costPrice: unknown;
      quantity: number;
      product: { costPrice: unknown };
    };
    function calcCost(items: SaleItemForCost[]): number {
      return items.reduce((sum, item) => {
        const cost =
          toNumOrZero(item.costPrice as never) ||
          toNumOrZero(item.product.costPrice as never);
        return sum + cost * item.quantity;
      }, 0);
    }

    function pctChange(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 10000) / 100;
    }

    // --- KPI 1: Ingresos hoy ---
    let ingresosHoy = { valor: 0, cambio: 0, sparkline: [] as number[] };
    if (results[0].status === "fulfilled") {
      const [hoyAgg, lastWeekAgg, ...sparklineAggs] = results[0].value;
      const hoy = toNumOrZero(hoyAgg._sum.total);
      const lastWeek = toNumOrZero(lastWeekAgg._sum.total);
      ingresosHoy = {
        valor: Math.round(hoy * 100) / 100,
        cambio: pctChange(hoy, lastWeek),
        sparkline: sparklineAggs.map((a) => Math.round(toNumOrZero(a._sum.total) * 100) / 100),
      };
    }

    // --- KPI 2: Ticket promedio ---
    let ticketPromedio = { valor: 0, cambio: 0 };
    if (results[1].status === "fulfilled") {
      const [actual, anterior] = results[1].value;
      const avgActual = toNumOrZero(actual._avg.total);
      const avgAnterior = toNumOrZero(anterior._avg.total);
      ticketPromedio = {
        valor: Math.round(avgActual * 100) / 100,
        cambio: pctChange(avgActual, avgAnterior),
      };
    }

    // --- KPI 3: Margen operativo ---
    let margenOperativo = { valor: 0, estado: "rojo" as "verde" | "amarillo" | "rojo" };
    if (results[2].status === "fulfilled") {
      const [ingresosAgg, costItems] = results[2].value;
      const ingresos = toNumOrZero(ingresosAgg._sum.total);
      const costos = calcCost(costItems);
      const margen = ingresos > 0 ? ((ingresos - costos) / ingresos) * 100 : 0;
      margenOperativo = {
        valor: Math.round(margen * 100) / 100,
        estado: margen >= 30 ? "verde" : margen >= 15 ? "amarillo" : "rojo",
      };
    }

    // --- KPI 4: Clientes activos ---
    let clientesActivos = { valor: 0, cambio: 0 };
    if (results[3].status === "fulfilled") {
      const [actuales, anteriores] = results[3].value;
      clientesActivos = {
        valor: actuales.length,
        cambio: pctChange(actuales.length, anteriores.length),
      };
    }

    // --- KPI 5: Fiado pendiente ---
    let fiadoPendiente = { valor: 0, totalClientes: 0, vencidos: 0 };
    if (results[4].status === "fulfilled" && results[4].value !== null) {
      const data = results[4].value;
      const saldo = toNumOrZero(data.pendiente._sum.saldo);
      fiadoPendiente = {
        valor: Math.round(saldo * 100) / 100,
        totalClientes: data.pendiente._count.id,
        vencidos: data.vencidos,
      };
    }

    // --- KPI 6: Rotación inventario ---
    let rotacionInventario = { valor: 0, subtexto: "" };
    if (results[5].status === "fulfilled") {
      const [cogItems, products] = results[5].value;
      const cogs30d = calcCost(cogItems);
      const avgInventoryValue = products.reduce((sum, p) => {
        return sum + (p.stock ?? 0) * toNumOrZero(p.costPrice);
      }, 0);

      if (avgInventoryValue > 0) {
        const rotacion = (cogs30d / avgInventoryValue) * (365 / 30);
        rotacionInventario = {
          valor: Math.round(rotacion * 10) / 10,
          subtexto: rotacion >= 12 ? "Excelente rotación" : rotacion >= 6 ? "Rotación saludable" : rotacion >= 3 ? "Rotación lenta" : "Stock estancado",
        };
      } else {
        rotacionInventario = { valor: 0, subtexto: "Sin datos de inventario" };
      }
    }

    return NextResponse.json({
      ingresosHoy,
      ticketPromedio,
      margenOperativo,
      clientesActivos,
      fiadoPendiente,
      rotacionInventario,
    });
  } catch (e) {
    logger.error("[analytics/kpis-v2] GET error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
