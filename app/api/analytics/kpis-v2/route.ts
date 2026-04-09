import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

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
    const tenantFilter = { tenantId: auth.tenantId };

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

    const results = await Promise.allSettled([
      // KPI 1: Ingresos hoy + sparkline 7 días
      Promise.all([
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: todayStart } },
          _sum: { total: true },
        }),
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: sameDayLastWeek, lt: sameDayLastWeekEnd } },
          _sum: { total: true },
        }),
        ...sparklineDates.map((d) =>
          prisma.sale.aggregate({
            where: { ...tenantFilter, createdAt: { gte: d.start, lt: d.end } },
            _sum: { total: true },
          })
        ),
      ]),

      // KPI 2: Ticket promedio últimos 30d vs 30d anteriores
      Promise.all([
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: thirtyDaysAgo } },
          _avg: { total: true },
          _count: { id: true },
        }),
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
          _avg: { total: true },
        }),
      ]),

      // KPI 3: Margen operativo (ingresos y costos últimos 30d)
      Promise.all([
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: { gte: thirtyDaysAgo } },
          _sum: { total: true },
        }),
        prisma.saleItem.findMany({
          where: { sale: { ...tenantFilter, createdAt: { gte: thirtyDaysAgo } } },
          select: { costPrice: true, quantity: true, product: { select: { costPrice: true } } },
        }),
      ]),

      // KPI 4: Clientes activos (distinct customerPhone últimos 30d) vs 30d anteriores
      Promise.all([
        prisma.sale.findMany({
          where: { ...tenantFilter, createdAt: { gte: thirtyDaysAgo }, customerPhone: { not: null } },
          select: { customerPhone: true },
          distinct: ["customerPhone"],
        }),
        prisma.sale.findMany({
          where: { ...tenantFilter, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }, customerPhone: { not: null } },
          select: { customerPhone: true },
          distinct: ["customerPhone"],
        }),
      ]),

      // KPI 5: Fiado pendiente
      (async () => {
        try {
          const [pendiente, vencidos] = await Promise.all([
            prisma.fiado.aggregate({
              where: { ...tenantFilter, status: "ACTIVO" },
              _sum: { saldo: true },
              _count: { id: true },
            }),
            prisma.fiado.count({
              where: { ...tenantFilter, status: "ACTIVO", fechaVence: { lt: now } },
            }),
          ]);
          return { pendiente, vencidos };
        } catch {
          return null;
        }
      })(),

      // KPI 6: Rotación inventario
      Promise.all([
        // COGS 30d: sum(SaleItem.quantity * costPrice)
        prisma.saleItem.findMany({
          where: { sale: { ...tenantFilter, createdAt: { gte: thirtyDaysAgo } } },
          select: { costPrice: true, quantity: true, product: { select: { costPrice: true } } },
        }),
        // Avg inventory value: sum(Product.stock * Product.costPrice)
        prisma.product.findMany({
          where: { ...tenantFilter, active: true, deletedAt: null, stock: { not: null }, costPrice: { not: null } },
          select: { stock: true, costPrice: true },
        }),
      ]),
    ]);

    // Helper: calc cost from sale items
    function calcCost(items: { costPrice: number | null; quantity: number; product: { costPrice: number | null } }[]): number {
      return items.reduce((sum, item) => {
        const cost = item.costPrice ?? item.product.costPrice ?? 0;
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
      const hoy = hoyAgg._sum.total ?? 0;
      const lastWeek = lastWeekAgg._sum.total ?? 0;
      ingresosHoy = {
        valor: Math.round(hoy * 100) / 100,
        cambio: pctChange(hoy, lastWeek),
        sparkline: sparklineAggs.map((a) => Math.round((a._sum.total ?? 0) * 100) / 100),
      };
    }

    // --- KPI 2: Ticket promedio ---
    let ticketPromedio = { valor: 0, cambio: 0 };
    if (results[1].status === "fulfilled") {
      const [actual, anterior] = results[1].value;
      const avgActual = actual._avg.total ?? 0;
      const avgAnterior = anterior._avg.total ?? 0;
      ticketPromedio = {
        valor: Math.round(avgActual * 100) / 100,
        cambio: pctChange(avgActual, avgAnterior),
      };
    }

    // --- KPI 3: Margen operativo ---
    let margenOperativo = { valor: 0, estado: "rojo" as "verde" | "amarillo" | "rojo" };
    if (results[2].status === "fulfilled") {
      const [ingresosAgg, costItems] = results[2].value;
      const ingresos = ingresosAgg._sum.total ?? 0;
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
      fiadoPendiente = {
        valor: data.pendiente._sum.saldo ? Math.round(Number(data.pendiente._sum.saldo) * 100) / 100 : 0,
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
        return sum + (p.stock ?? 0) * (p.costPrice ?? 0);
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
    console.error("[analytics/kpis-v2] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
