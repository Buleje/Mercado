import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/admin/overview
 *
 * Endpoint UNIFICADO del admin home (tab Resumen).
 *
 * Acepta query params opcionales para scoping por rango:
 *   - ?from=YYYY-MM-DD (inclusive)
 *   - ?to=YYYY-MM-DD   (inclusive)
 *   - ?preset=diario|semanal|mensual|anual|personalizado
 *
 * Si `from`/`to` se omiten, comportamiento default = "hoy" (retrocompatible).
 *
 * Retorna:
 *   - hero.totalRange — total ventas en el rango
 *   - hero.deltaVsPrevious — % vs ventana previa equivalente
 *   - hero.sparkline — buckets del rango (hasta 14 puntos)
 *   - contextual — pedidos/clientes/ticket/stock en el rango
 *   - heatmap — hora×día del rango (cuándo vende más)
 *   - topProducts — top 5 por unidades en el rango
 *   - alerts — stock crítico, vencimientos, fiados atrasados (siempre "ahora")
 *   - insight — heurística IA según el rango + comparativa
 */

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

type Preset = "diario" | "semanal" | "mensual" | "anual" | "personalizado";

function resolveRange(from: Date | null, to: Date | null): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);
  if (from && to) return { from: startOfDay(from), to: endOfDay(to) };
  return { from: today, to: endOfDay(now) };
}

function previousWindow(from: Date, to: Date): { from: Date; to: Date } {
  const ms = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - ms);
  return { from: prevFrom, to: prevTo };
}

/**
 * Genera buckets (<= 14) dentro del rango.
 * Si span <= 1d → 24 horas / 14 buckets (cada 1.7h aprox; redondeamos a 24 → pero cap 14).
 * Si span <= 14d → buckets diarios.
 * Si span > 14d → buckets (span/14) días.
 * Retorna array [{ label: string, start: Date, end: Date }].
 */
// Brandon mayo 2026 v3: labels "01 May" + iso para tooltip humano.
const MONTH_LABELS_API = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function pad2API(n: number): string {
  return String(n).padStart(2, "0");
}

function buildBuckets(from: Date, to: Date): Array<{ label: string; iso: string; start: Date; end: Date }> {
  const msDay = 24 * 60 * 60 * 1000;
  const span = to.getTime() - from.getTime();
  const days = span / msDay;

  if (days <= 1) {
    // Intradía: 6 buckets de 4h
    const buckets: Array<{ label: string; iso: string; start: Date; end: Date }> = [];
    for (let i = 0; i < 6; i++) {
      const start = new Date(from.getTime() + i * 4 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000 - 1);
      buckets.push({
        label: `${pad2API(start.getHours())}h`,
        iso: start.toISOString(),
        start,
        end,
      });
    }
    return buckets;
  }

  if (days <= 35) {
    // Diario "01 May" (semanal + mensual)
    const buckets: Array<{ label: string; iso: string; start: Date; end: Date }> = [];
    let cursor = startOfDay(from);
    while (cursor.getTime() <= to.getTime()) {
      const end = endOfDay(cursor);
      buckets.push({
        label: `${pad2API(cursor.getDate())} ${MONTH_LABELS_API[cursor.getMonth()]}`,
        iso: cursor.toISOString(),
        start: new Date(cursor),
        end: new Date(end),
      });
      cursor = new Date(cursor.getTime() + msDay);
    }
    return buckets;
  }

  // Rango largo → máximo 14 buckets uniformes
  const bucketSize = Math.ceil(days / 14);
  const buckets: Array<{ label: string; iso: string; start: Date; end: Date }> = [];
  let cursor = startOfDay(from);
  while (cursor.getTime() <= to.getTime()) {
    const bucketEnd = new Date(cursor.getTime() + bucketSize * msDay - 1);
    const end = bucketEnd.getTime() > to.getTime() ? to : bucketEnd;
    buckets.push({
      label: `${pad2API(cursor.getDate())} ${MONTH_LABELS_API[cursor.getMonth()]}`,
      iso: cursor.toISOString(),
      start: new Date(cursor),
      end: new Date(end),
    });
    cursor = new Date(cursor.getTime() + bucketSize * msDay);
  }
  return buckets;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const { prisma } = await import("@/lib/prisma");

  // ── Parse query params ─────────────────────────────────────────────────────
  const url = new URL(req.url);
  const fromParam = parseDate(url.searchParams.get("from"));
  const toParam = parseDate(url.searchParams.get("to"));
  const preset = (url.searchParams.get("preset") as Preset | null) ?? "diario";

  const { from: rangeFrom, to: rangeTo } = resolveRange(fromParam, toParam);
  const { from: prevFrom, to: prevTo } = previousWindow(rangeFrom, rangeTo);

  const now = new Date();
  const startOf30dAgo = new Date(rangeTo);
  startOf30dAgo.setDate(startOf30dAgo.getDate() - 30);

  try {
    const [
      rangeOrders,
      prevOrders,
      activeOrders,
      last30dOrders,
      criticalStockCount,
      expiringCount,
      overdueCreditCount,
      topProducts,
      newCustomersInRange,
    ] = await Promise.all([
      prisma.order
        .findMany({
          where: { tenantId, createdAt: { gte: rangeFrom, lte: rangeTo }, status: { not: "cancelado" } },
          select: { total: true, customerPhone: true, createdAt: true },
        })
        .catch(() => [] as Array<{ total: number; customerPhone: string | null; createdAt: Date }>),

      prisma.order
        .findMany({
          where: { tenantId, createdAt: { gte: prevFrom, lte: prevTo }, status: { not: "cancelado" } },
          select: { total: true },
        })
        .catch(() => [] as Array<{ total: number }>),

      prisma.order
        .count({
          where: {
            tenantId,
            status: { in: ["pendiente", "confirmado", "en_camino"] },
          },
        })
        .catch(() => 0),

      prisma.order
        .findMany({
          where: { tenantId, createdAt: { gte: startOf30dAgo, lte: rangeTo }, status: { not: "cancelado" } },
          select: { createdAt: true },
          take: 5000,
        })
        .catch(() => [] as Array<{ createdAt: Date }>),

      prisma.product
        .count({
          where: { tenantId, stock: { lte: 5, gt: 0 }, active: true },
        })
        .catch(() => 0),

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

      prisma.fiado
        .count({
          where: { tenantId, status: "VENCIDO" },
        })
        .catch(() => 0),

      prisma.orderItem
        .groupBy({
          by: ["productId"],
          where: {
            order: { tenantId, createdAt: { gte: rangeFrom, lte: rangeTo }, status: { not: "cancelado" } },
          },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: "desc" } },
          take: 5,
        })
        .catch(() => [] as Array<{ productId: number | null; _sum: { quantity: number | null } }>),

      prisma.customer
        .count({
          where: { tenantId, createdAt: { gte: rangeFrom, lte: rangeTo } },
        })
        .catch(() => 0),
    ]);

    // ── Aggregates ─────────────────────────────────────────────────────────
    const totalRange = rangeOrders.reduce((sum: number, o) => sum + Number(o.total ?? 0), 0);
    const totalPrev = prevOrders.reduce((sum: number, o) => sum + Number(o.total ?? 0), 0);
    const deltaVsPrevious = totalPrev > 0
      ? ((totalRange - totalPrev) / totalPrev) * 100
      : totalRange > 0 ? 100 : 0;

    const ordersCount = rangeOrders.length;
    const ticketAverage = ordersCount > 0 ? totalRange / ordersCount : 0;
    const uniqueCustomers = new Set(rangeOrders.map((o) => o.customerPhone).filter(Boolean)).size;

    // Sparkline: buckets dentro del rango
    const buckets = buildBuckets(rangeFrom, rangeTo);
    const sparkline = buckets.map((b) => {
      const sum = rangeOrders
        .filter((o) => o.createdAt >= b.start && o.createdAt <= b.end)
        .reduce((s, o) => s + Number(o.total ?? 0), 0);
      return Math.round(sum);
    });
    const sparklineLabels = buckets.map((b) => b.label);
    // Brandon mayo 2026 v3: iso del día para tooltip humano ("Domingo 2 de mayo")
    const sparklineIso = buckets.map((b) => b.iso);

    // Heatmap: últimos 30d (no depende del rango — tendencia larga)
    const heatmapRaw: Record<string, number> = {};
    for (const o of last30dOrders) {
      const day = (o.createdAt.getDay() + 6) % 7;
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

    // ── Alerts accionables (siempre "ahora") ───────────────────────────────
    const alerts: Array<{ id: string; severity: "info" | "warning" | "danger"; text: string; href?: string }> = [];
    if (criticalStockCount > 0) {
      alerts.push({
        id: "stock-critical",
        severity: "warning",
        text: `${criticalStockCount} ${criticalStockCount === 1 ? "producto" : "productos"} con stock crítico`,
        href: "/admin?tab=inventario&filter=critical",
      });
    }
    if (expiringCount > 0) {
      alerts.push({
        id: "expiring",
        severity: "warning",
        text: `${expiringCount} ${expiringCount === 1 ? "producto vence" : "productos vencen"} en 7 días`,
        href: "/admin?tab=inventario&filter=expiring",
      });
    }
    if (overdueCreditCount > 0) {
      alerts.push({
        id: "overdue",
        severity: "danger",
        text: `${overdueCreditCount} ${overdueCreditCount === 1 ? "fiado atrasado" : "fiados atrasados"}`,
        href: "/admin?tab=fiados&filter=overdue",
      });
    }
    if (activeOrders > 0) {
      alerts.push({
        id: "active-orders",
        severity: "info",
        text: `${activeOrders} ${activeOrders === 1 ? "pedido en curso" : "pedidos en curso"}`,
        href: "/admin?tab=pedidos&filter=active",
      });
    }

    // ── Insight heurístico según rango + comparativa ──────────────────────
    const presetLabel: Record<Preset, string> = {
      diario: "hoy",
      semanal: "esta semana",
      mensual: "este mes",
      anual: "este año",
      personalizado: "este rango",
    };
    const prevLabel: Record<Preset, string> = {
      diario: "ayer",
      semanal: "la semana pasada",
      mensual: "el mes pasado",
      anual: "el año pasado",
      personalizado: "el rango anterior",
    };

    let insight: { type: "opportunity" | "warning" | "info"; text: string; cta?: { label: string; href: string } } | null = null;
    if (deltaVsPrevious < -15 && ordersCount >= 3) {
      insight = {
        type: "opportunity",
        text: `Tus ventas ${presetLabel[preset]} están ${Math.abs(deltaVsPrevious).toFixed(0)}% abajo vs ${prevLabel[preset]}. Una promo flash puede recuperar el ritmo.`,
        cta: { label: "Crear promo", href: "/admin?tab=productos&action=promo" },
      };
    } else if (deltaVsPrevious > 20) {
      insight = {
        type: "opportunity",
        text: `Vas ${deltaVsPrevious.toFixed(0)}% arriba vs ${prevLabel[preset]}. Aprovecha el momentum — pide reseñas a clientes que compraron ${presetLabel[preset]}.`,
        cta: { label: "Ver clientes", href: "/admin?tab=clientes" },
      };
    } else if (criticalStockCount > 3) {
      insight = {
        type: "warning",
        text: `${criticalStockCount} productos tienen stock crítico. Los clientes ya no los pueden comprar — repón pronto.`,
        cta: { label: "Ver inventario", href: "/admin?tab=inventario" },
      };
    } else if (ordersCount === 0 && preset === "diario" && now.getHours() > 11) {
      insight = {
        type: "info",
        text: `Sin pedidos hoy aún. Comparte tu tienda por WhatsApp — los clientes de la mañana suelen ser los más recurrentes.`,
        cta: { label: "Compartir tienda", href: "/admin?tab=marketplace&action=share" },
      };
    }

    return NextResponse.json(
      {
        hero: {
          totalRange: Math.round(totalRange * 100) / 100,
          deltaVsPrevious: Math.round(deltaVsPrevious * 10) / 10,
          sparkline,
          sparklineLabels,
          sparklineIso,
          // Retrocompat: clientes viejos esperan `totalToday` / `deltaVsYesterday`
          totalToday: Math.round(totalRange * 100) / 100,
          deltaVsYesterday: Math.round(deltaVsPrevious * 10) / 10,
        },
        range: {
          from: rangeFrom.toISOString(),
          to: rangeTo.toISOString(),
          preset,
        },
        contextual: {
          ordersToday: ordersCount, // legacy name mantenido
          ordersInRange: ordersCount,
          uniqueCustomers,
          newCustomers: newCustomersInRange,
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
