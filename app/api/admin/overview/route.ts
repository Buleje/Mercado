import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";

// Brandon 2026-05-16 P1 (audit): force-dynamic obligatorio. Sin esto, Next 16
// puede inferir el endpoint como estático en build y servir KPIs cacheados
// en producción (ventas del día congeladas a las 00:00 del build). El
// endpoint depende de cookies (requireAdmin), `?from`/`?to` query params y
// queries en tiempo real — siempre debe ser SSR puro.

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

/**
 * Brandon 2026-05-16 (audit P2 timezone): parseDate acepta ISO con offset.
 * Si el cliente envía `2026-05-01T00:00:00-05:00` (medianoche Pucallpa),
 * Node lo normaliza a `2026-05-01T05:00:00Z` (UTC) preservando el instante.
 * Si el cliente solo envía `2026-05-01` (sin offset), Node lo interpreta
 * como UTC midnight — y los pedidos hechos a las 7-11pm del día anterior
 * Lima caen DENTRO del rango por error.
 * Solución: cuando recibimos una fecha sin offset (`YYYY-MM-DD`), asumimos
 * que el cliente quiere medianoche local de Lima (UTC-5) y agregamos T05:00:00Z.
 * Esto cubre el caso más común (filtros del UI) sin romper requests que
 * sí mandan offset explícito.
 */
function parseDate(s: string | null): Date | null {
  if (!s) return null;
  // Detecta "YYYY-MM-DD" sin tiempo ni offset → asume midnight Lima.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const normalized = dateOnly ? `${s}T00:00:00-05:00` : s;
  const d = new Date(normalized);
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

/**
 * Brandon 2026-05-16 (audit P1 regla 1): las 9 queries del dashboard
 * vivieron aquí como Prisma directo histórico. Ahora migradas a
 * `lib/db/overview.db.ts` (OverviewDB.fetchOverview). Este route mantiene
 * SOLO la lógica de agregación (heatmap, sparkline, insight, alerts) —
 * los reads pasan por la clase DB con scope tenantId centralizado.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const { logger } = await import("@/lib/logger");
  const { OverviewDB } = await import("@/lib/db/overview.db");

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
    // Brandon 2026-05-16 (Fase 3 perf): cache server-side TTL 30s.
    // Antes solo había browser cache (Cache-Control private, max-age=60).
    // Ahora si dos tabs/pestañas piden /overview en <30s, la 2da pega cache
    // server-side y NO ejecuta las 9 queries de OverviewDB. Cache key
    // incluye tenantId + rango para no mezclar datos.
    const cacheKey = `admin:overview:${tenantId}:${rangeFrom.getTime()}:${rangeTo.getTime()}`;
    const {
      rangeOrders,
      prevOrders,
      activeOrders,
      last30dOrders,
      criticalStockCount,
      expiringCount,
      overdueCreditCount,
      topProducts,
      newCustomersInRange,
    } = await getOrSet(cacheKey, 30, () => OverviewDB.fetchOverview({
      tenantId,
      rangeFrom,
      rangeTo,
      prevFrom,
      prevTo,
      startOf30dAgo,
      now,
    })).catch((err): Awaited<ReturnType<typeof OverviewDB.fetchOverview>> => {
      logger.warn("[admin/overview] fetchOverview failed", {
        tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
      return {
        rangeOrders: [],
        prevOrders: [],
        activeOrders: 0,
        last30dOrders: [],
        criticalStockCount: 0,
        expiringCount: 0,
        overdueCreditCount: 0,
        topProducts: [],
        newCustomersInRange: 0,
      };
    });

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
    // Brandon 2026-05-16 (audit P1): fix timezone. Antes `getDay()` y
    // `getHours()` usaban la hora local del servidor (UTC en Vercel). Los
    // pedidos hechos a las 8pm Pucallpa caían en el bucket de la 1am del
    // día siguiente (Pucallpa es UTC-5, sin DST). Ahora aplicamos offset
    // manual para que el heatmap muestre la hora REAL del bodeguero.
    const LIMA_OFFSET_MS = -5 * 60 * 60 * 1000;
    const heatmapRaw: Record<string, number> = {};
    for (const o of last30dOrders) {
      const local = new Date(o.createdAt.getTime() + LIMA_OFFSET_MS);
      const day = (local.getUTCDay() + 6) % 7;
      const hour = local.getUTCHours();
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
    // ADR-119 — documentos del negocio por vencer (licencias, contratos).
    // Query barata cacheada 5 min aparte para no acoplar a fetchOverview.
    const { DocumentsDB } = await import("@/lib/db/documents.db");
    const expiringDocsCount = await getOrSet(
      `admin:overview:expdocs:${tenantId}`,
      300,
      () => DocumentsDB.countExpiring(tenantId, 30)
    ).catch(() => 0);
    if (expiringDocsCount > 0) {
      alerts.push({
        id: "docs-expiring",
        severity: "warning",
        text: `${expiringDocsCount} ${expiringDocsCount === 1 ? "documento vence" : "documentos vencen"} pronto`,
        href: "/admin?tab=documentos",
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
      // Brandon mayo 2026 v5: ya no repetimos "Vas X% arriba" porque ese
      // dato YA está en el hero (heroDelta). El insight ahora sugiere UNA
      // acción concreta — pedir reseñas — sin duplicar el dato numérico.
      insight = {
        type: "opportunity",
        text: `Estás vendiendo más que ${prevLabel[preset]}. Pide reseñas a los clientes que ya te compraron — cuando otros las leen, compran más rápido.`,
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
    // Brandon 2026-05-16 (audit P2 info disclosure): antes devolvíamos
    // `error.message` al cliente — podía exponer nombres de tablas,
    // estructura de queries Prisma o detalles internos de DB. Ahora
    // logueamos en server y devolvemos solo un código genérico.
    logger.error("[admin/overview] unhandled error", {
      tenantId,
      err: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    });
    return NextResponse.json(
      { error: "Error generando overview" },
      { status: 500 },
    );
  }
}
