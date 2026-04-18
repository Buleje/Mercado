import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/admin/overview
 *
 * Endpoint UNIFICADO del admin home (Hub "Hoy" — ADR-064).
 * Reemplaza fetches duplicados de:
 *   - /api/admin/resume
 *   - /api/admin/today-summary
 *   - /api/admin/metrics
 *   - /api/marketplace/admin/overview (para dueño de tienda)
 *
 * Retorna en 1 fetch paralelo:
 *   - Hero KPI: ventas hoy + delta vs ayer
 *   - 4 contextual: pedidos, clientes, ticket promedio, stock crítico
 *   - Trend: últimos 7 días de ventas (sparkline)
 *   - Heatmap: ventas por hora/día últimos 30 días
 *   - Top 5 productos con trend
 *   - Pedidos en curso (activos)
 *   - Alertas accionables (vencimiento, stock, fiados atrasados)
 *   - Insight IA (regla heurística en backend, no LLM para velocidad)
 *
 * Cache: privado (tenant-scoped) 1 min + SWR 30s.
 */
export async function GET(req: NextRequest) {
  // Auth check (propaga tenantId)
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const { prisma } = await import("@/lib/prisma");

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOf7dAgo = new Date(startOfToday);
  startOf7dAgo.setDate(startOf7dAgo.getDate() - 7);
  const startOf30dAgo = new Date(startOfToday);
  startOf30dAgo.setDate(startOf30dAgo.getDate() - 30);

  try {
    // Paralelizar TODAS las queries
    const [
      todayOrders,
      yesterdayOrders,
      last7dOrders,
      activeOrders,
      last30dOrders,
      criticalStockCount,
      expiringCount,
      overdueCreditCount,
      topProducts,
      newCustomersToday,
    ] = await Promise.all([
      // Ventas de hoy
      prisma.order
        .findMany({
          where: { tenantId, createdAt: { gte: startOfToday }, status: { not: "cancelado" } },
          select: { total: true, customerPhone: true, createdAt: true },
        })
        .catch(() => [] as Array<{ total: number; customerPhone: string | null; createdAt: Date }>),

      // Ventas de ayer (para delta)
      prisma.order
        .findMany({
          where: { tenantId, createdAt: { gte: startOfYesterday, lt: startOfToday }, status: { not: "cancelado" } },
          select: { total: true },
        })
        .catch(() => [] as Array<{ total: number }>),

      // Últimos 7 días (para sparkline trend)
      prisma.order
        .findMany({
          where: { tenantId, createdAt: { gte: startOf7dAgo }, status: { not: "cancelado" } },
          select: { total: true, createdAt: true },
        })
        .catch(() => [] as Array<{ total: number; createdAt: Date }>),

      // Pedidos en curso (no entregados ni cancelados)
      prisma.order
        .count({
          where: {
            tenantId,
            status: { in: ["pendiente", "confirmado", "en_camino"] },
          },
        })
        .catch(() => 0),

      // Últimos 30 días (heatmap hora/día)
      prisma.order
        .findMany({
          where: { tenantId, createdAt: { gte: startOf30dAgo }, status: { not: "cancelado" } },
          select: { createdAt: true },
          take: 5000,
        })
        .catch(() => [] as Array<{ createdAt: Date }>),

      // Stock crítico (<=5)
      prisma.product
        .count({
          where: { tenantId, stock: { lte: 5, gt: 0 }, active: true },
        })
        .catch(() => 0),

      // Productos por vencer en 7 días (campo `expiresAt` en Product)
      prisma.product
        .count({
          where: {
            tenantId,
            expiresAt: {
              gte: now,
              lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            },
            active: true,
          },
        })
        .catch(() => 0),

      // Fiados atrasados (modelo Fiado con status overdue)
      prisma.fiado
        .count({
          where: {
            tenantId,
            status: "VENCIDO",
          },
        })
        .catch(() => 0),

      // Top 5 productos últimos 7 días
      prisma.orderItem
        .groupBy({
          by: ["productId"],
          where: {
            order: { tenantId, createdAt: { gte: startOf7dAgo }, status: { not: "cancelado" } },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 5,
        })
        .catch(() => [] as Array<{ productId: number | null; _sum: { quantity: number | null } }>),

      // Clientes nuevos hoy (primera orden hoy)
      prisma.customer
        .count({
          where: { tenantId, createdAt: { gte: startOfToday } },
        })
        .catch(() => 0),
    ]);

    // Compute aggregates
    const totalToday = todayOrders.reduce((sum: number, o) => sum + Number(o.total ?? 0), 0);
    const totalYesterday = yesterdayOrders.reduce((sum: number, o) => sum + Number(o.total ?? 0), 0);
    const deltaVsYesterday = totalYesterday > 0
      ? ((totalToday - totalYesterday) / totalYesterday) * 100
      : totalToday > 0 ? 100 : 0;

    const ordersTodayCount = todayOrders.length;
    const ticketAverage = ordersTodayCount > 0 ? totalToday / ordersTodayCount : 0;

    // Unique customers today
    const uniqueCustomersToday = new Set(todayOrders.map((o) => o.customerPhone).filter(Boolean)).size;

    // Sparkline: agrupar por dia ultimos 7 dias
    const sparkline: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfToday);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const daySum = last7dOrders
        .filter((o) => o.createdAt >= dayStart && o.createdAt < dayEnd)
        .reduce((s: number, o) => s + Number(o.total ?? 0), 0);
      sparkline.push(Math.round(daySum));
    }

    // Heatmap: [{ day: 0-6, hour: 0-23, value }]
    const heatmapRaw: Record<string, number> = {};
    for (const o of last30dOrders) {
      const day = (o.createdAt.getDay() + 6) % 7; // 0 = Lunes
      const hour = o.createdAt.getHours();
      const key = `${day}-${hour}`;
      heatmapRaw[key] = (heatmapRaw[key] ?? 0) + 1;
    }
    const heatmap: Array<{ day: number; hour: number; value: number }> = [];
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const v = heatmapRaw[`${d}-${h}`] ?? 0;
        if (v > 0) heatmap.push({ day: d, hour: h, value: v });
      }
    }

    // Alertas accionables
    const alerts: Array<{ id: string; severity: "info" | "warning" | "danger"; text: string; href?: string }> = [];
    if (criticalStockCount > 0) {
      alerts.push({
        id: "stock-critical",
        severity: "warning",
        text: `${criticalStockCount} ${criticalStockCount === 1 ? "producto" : "productos"} con stock crítico`,
        href: "/admin?module=operar&section=inventario&filter=critical",
      });
    }
    if (expiringCount > 0) {
      alerts.push({
        id: "expiring",
        severity: "warning",
        text: `${expiringCount} ${expiringCount === 1 ? "producto vence" : "productos vencen"} en 7 días`,
        href: "/admin?module=operar&section=inventario&filter=expiring",
      });
    }
    if (overdueCreditCount > 0) {
      alerts.push({
        id: "overdue",
        severity: "danger",
        text: `${overdueCreditCount} ${overdueCreditCount === 1 ? "fiado atrasado" : "fiados atrasados"}`,
        href: "/admin?module=cobrar&section=fiados&filter=overdue",
      });
    }
    if (activeOrders > 0) {
      alerts.push({
        id: "active-orders",
        severity: "info",
        text: `${activeOrders} ${activeOrders === 1 ? "pedido en curso" : "pedidos en curso"}`,
        href: "/admin?module=operar&section=pedidos&filter=active",
      });
    }

    // Insight IA (regla heurística)
    let insight: { type: "opportunity" | "warning" | "info"; text: string; cta?: { label: string; href: string } } | null = null;
    if (deltaVsYesterday < -15 && ordersTodayCount >= 3) {
      insight = {
        type: "opportunity",
        text: `Tus ventas están ${Math.abs(deltaVsYesterday).toFixed(0)}% abajo vs ayer. Una promo flash de 2×1 en bebidas puede recuperar el ritmo.`,
        cta: { label: "Crear promo flash", href: "/admin?module=operar&section=productos&action=promo" },
      };
    } else if (deltaVsYesterday > 20) {
      insight = {
        type: "opportunity",
        text: `Vas ${deltaVsYesterday.toFixed(0)}% arriba vs ayer. Capturá el momentum: aprovechá para pedir reseñas a clientes que ya compraron.`,
        cta: { label: "Ver clientes de hoy", href: "/admin?module=crecer&section=clientes&filter=today" },
      };
    } else if (criticalStockCount > 3) {
      insight = {
        type: "warning",
        text: `${criticalStockCount} productos tienen stock crítico. Los clientes ya no los pueden comprar — reponé pronto.`,
        cta: { label: "Ver inventario", href: "/admin?module=operar&section=inventario" },
      };
    } else if (ordersTodayCount === 0 && now.getHours() > 11) {
      insight = {
        type: "info",
        text: `Sin pedidos hoy aún. ¿Compartís tu tienda por WhatsApp? Los clientes de la mañana suelen ser los más recurrentes.`,
        cta: { label: "Compartir mi tienda", href: "/admin?module=crecer&section=marketplace&action=share" },
      };
    }

    return NextResponse.json(
      {
        hero: {
          totalToday: Math.round(totalToday * 100) / 100,
          deltaVsYesterday: Math.round(deltaVsYesterday * 10) / 10,
          sparkline,
        },
        contextual: {
          ordersToday: ordersTodayCount,
          uniqueCustomers: uniqueCustomersToday,
          newCustomers: newCustomersToday,
          ticketAverage: Math.round(ticketAverage * 100) / 100,
          activeOrders,
          criticalStock: criticalStockCount,
        },
        heatmap,
        topProducts: topProducts.map((p) => ({
          productId: p.productId,
          quantity: p._sum.quantity ?? 0,
        })),
        alerts,
        insight,
        generatedAt: now.toISOString(),
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Error generando overview",
        detail: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 },
    );
  }
}
