import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prismaReadonly as prisma } from "@/lib/prisma-readonly";
import { applyRateLimit } from "@/lib/rate-limit";
import { toNumOrZero } from "@/lib/decimal-utils";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { etiquetaDePlan } from "@/lib/billing/plan-tiers";
import { estadoDeCobro, mrrMensualDeTenant } from "@/lib/billing/mrr-plataforma";
import { startOfLimaMonth, limaDateKey } from "@/lib/utils";
import { enStockBajo, stockMinimoDe, STOCK_MINIMO_GLOBAL_POR_DEFECTO } from "@/lib/inventario/stock-minimo";
import { minimosGlobalesPorNegocio } from "@/lib/inventario/stock-minimo.server";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/**
 * GET /api/superadmin/analytics/executive
 *
 * Devuelve una vista ejecutiva profunda para `/superadmin/analytics`.
 * Datos REALES desde DB; sin mocks. Estructura pensada para mostrarse en
 * cards grandes y gráficos full-width:
 *
 *   - cohorts: tenants agrupados por mes de signup, con retention M0/M1/M2
 *   - mrrByPlan: MRR mensual breakdown free/pro/business/enterprise
 *   - topCustomers: top 10 clientes finales por gasto agregado cross-tenant
 *   - paymentMethods: distribución de payment_method en orders del último mes
 *   - dailyActiveStores: tiendas con al menos 1 order en cada día (últimos 30)
 *   - geographic: distribución de tenants por zona (campo Store.zone)
 *   - productVelocity: top 10 productos cross-tenant por unidades vendidas mes
 *   - aov: Average Order Value por mes (últimos 6 meses)
 */
export async function GET(req: NextRequest) {
  try {
    const rateLimited = applyRateLimit(req, "GENEROUS", "sa-analytics-executive");
    if (rateLimited) return rateLimited;

    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const now = new Date();
    // Acepta from/to (YYYY-MM-DD). Si no vienen, fallback al mes en curso / últimos 30d.
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const periodStart = fromParam
      ? new Date(fromParam)
      : new Date(startOfLimaMonth(0, now));
    const periodEnd = toParam ? new Date(toParam) : now;
    // [PERF] Cache 10min por rango: las ~13 queries (incl. el groupBy de
    // top-customers SIN filtro de fecha = scan all-time) + 2 findMany de órdenes
    // se recomputaban en CADA request. Key incluye from/to. getOrSet dedupe in-flight.
    const payload = await getOrSet(
      `superadmin:executive:${fromParam ?? ""}:${toParam ?? ""}`,
      600,
      async () => {
        const startOfMonth = periodStart;
        const last30Start = periodStart;
        const periodEndDate = periodEnd;
        const monthFmt = new Intl.DateTimeFormat("es-PE", { month: "short" });

        // Pre-compute month windows para AOV (últimos 6 meses)
        const aovWindows = Array.from({ length: 6 }, (_, idx) => {
          const i = 5 - idx;
          const monthStart = new Date(startOfLimaMonth(-i, now));
          const nextMonthStart = new Date(startOfLimaMonth(-i + 1, now));
          return { monthStart, nextMonthStart };
        });

        // ── Phase 1: TODAS las queries independientes en paralelo ──────────────
        const [
          allTenants,
          planCounts,
          ordersByCustomer,
          paymentBreakdown,
          ordersLast30,
          zoneGroups,
          aovMonthly,
          itemAgg,
          statusBreakdown,
          ordersForHeatmap,
          channelBreakdown,
          customerOrderCounts,
          lowStockCandidatos,
        ] = await Promise.all([
          prisma.tenant.findMany({
            where: { active: true },
            select: {
              id: true, createdAt: true, plan: true, active: true, trialEndsAt: true, cancelAtPeriodEnd: true,
              // La regla de «paga» (estadoDeCobro) mira la pasarela y su período.
              stripeSubscriptionId: true, stripeCurrentPeriodEnd: true, mpSubscriptionId: true,
            },
          }),
          prisma.tenant.groupBy({
            by: ["plan"],
            where: { active: true },
            _count: { _all: true },
          }),
          prisma.order.groupBy({
            by: ["customerPhone"],
            where: { status: { not: "cancelado" }, customerPhone: { not: null } },
            _sum: { total: true },
            _count: { _all: true },
            orderBy: { _sum: { total: "desc" } },
            take: 10,
          }),
          prisma.order.groupBy({
            by: ["paymentMethod"],
            where: {
              createdAt: { gte: startOfMonth, lte: periodEndDate },
              status: { not: "cancelado" },
            },
            _count: { _all: true },
            _sum: { total: true },
          }),
          prisma.order.findMany({
            where: {
              createdAt: { gte: last30Start, lte: periodEndDate },
              status: { not: "cancelado" },
            },
            select: { tenantId: true, createdAt: true },
          }),
          prisma.store.groupBy({
            by: ["zone"],
            where: { isPublished: true },
            _count: { _all: true },
          }),
          Promise.all(
            aovWindows.map(({ monthStart, nextMonthStart }) =>
              prisma.order.aggregate({
                where: {
                  createdAt: { gte: monthStart, lt: nextMonthStart },
                  status: { not: "cancelado" },
                },
                _sum: { total: true },
                _count: { _all: true },
              }),
            ),
          ),
          prisma.orderItem.groupBy({
            by: ["productId", "name"],
            where: {
              order: {
                createdAt: { gte: startOfMonth, lte: periodEndDate },
                status: { not: "cancelado" },
              },
            },
            _sum: { quantity: true, price: true },
            orderBy: { _sum: { quantity: "desc" } },
            take: 10,
          }),
          prisma.order.groupBy({
            by: ["status"],
            where: { createdAt: { gte: last30Start, lte: periodEndDate } },
            _count: { _all: true },
          }),
          prisma.order.findMany({
            where: {
              createdAt: { gte: last30Start, lte: periodEndDate },
              status: { not: "cancelado" },
            },
            select: { createdAt: true },
          }),
          prisma.order.groupBy({
            by: ["source"],
            where: {
              createdAt: { gte: last30Start, lte: periodEndDate },
              status: { not: "cancelado" },
            },
            _count: { _all: true },
            _sum: { total: true },
          }),
          prisma.order.groupBy({
            by: ["customerPhone"],
            where: {
              createdAt: { gte: last30Start },
              status: { not: "cancelado" },
              customerPhone: { not: null },
            },
            _count: { _all: true },
          }),
          // Candidatos a stock bajo: en o bajo su mínimo propio, o sin él (se
          // miden abajo contra el global de SU negocio; antes `stock <= 5` fijo).
          prisma.product.findMany({
            where: {
              deletedAt: null, active: true, stock: { not: null },
              OR: [
                { stockMin: { not: null }, stock: { lte: prisma.product.fields.stockMin } },
                { stockMin: null },
              ],
            },
            select: { id: true, name: true, stock: true, stockMin: true, tenantId: true },
            orderBy: { stock: "asc" },
            take: 50,
          }),
        ]);
        const nowMs = now.getTime();
        const cohortMap = new Map<string, { signups: number; payingNow: number }>();
        for (const t of allTenants) {
          const k = limaDateKey(t.createdAt).slice(0, 7); // mes de Lima
          const cur = cohortMap.get(k) ?? { signups: 0, payingNow: 0 };
          cur.signups += 1;
          // «Pagando ahora» = paga hoy (una tienda en prueba todavía no paga).
          if (estadoDeCobro(t, nowMs).status === "paid") cur.payingNow += 1;
          cohortMap.set(k, cur);
        }
        const cohorts = Array.from(cohortMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .map(([month, c]) => ({
            month,
            signups: c.signups,
            payingNow: c.payingNow,
            conversionPct: c.signups > 0 ? Math.round((c.payingNow / c.signups) * 100) : 0,
          }));

        // ── MRR breakdown por plan ─────────────────────────────────────────────
        // Precio = `precioMensualDePlan` (plan-tiers.ts, lo que se cobra); una
        // tienda en prueba o cancelada aporta S/ 0. Antes: 49/149/299 × todas
        // las activas, incluidas las que estaban en prueba.
        const mrrByPlan = planCounts.map((p) => {
          const plan = p.plan ?? "free";
          const mrr = allTenants
            .filter((t) => (t.plan ?? "free") === plan)
            .reduce((acc, t) => acc + mrrMensualDeTenant(t, nowMs), 0);
          return { plan, label: etiquetaDePlan(plan), count: p._count._all, mrr };
        });

        // ── Top customers cross-tenant por gasto ────────────────────────────────
        const topCustomers = ordersByCustomer.map((c) => ({
          phone: c.customerPhone ?? "",
          totalSpent: toNumOrZero(c._sum.total ?? 0),
          orders: c._count._all,
        }));

        // ── Payment methods distribución ────────────────────────────────────────
        const paymentMethods = paymentBreakdown.map((p) => ({
          method: p.paymentMethod ?? "desconocido",
          orders: p._count._all,
          revenue: toNumOrZero(p._sum.total ?? 0),
        }));

        // ── Daily active stores ────────────────────────────────────────────────
        const dayKey = (d: Date) => limaDateKey(d); // día de Lima
        const dasMap = new Map<string, Set<string>>();
        for (let i = 0; i < 30; i++) {
          const d = new Date(last30Start);
          d.setDate(last30Start.getDate() + i);
          dasMap.set(dayKey(d), new Set());
        }
        for (const o of ordersLast30) {
          const k = dayKey(o.createdAt);
          dasMap.get(k)?.add(o.tenantId);
        }
        const dailyActiveStores = Array.from(dasMap.entries()).map(([date, set]) => ({
          date,
          count: set.size,
        }));

        // ── Geographic distribution: tenants por zona ──────────────────────────
        const geographic = zoneGroups
          .map((z) => ({ zone: z.zone ?? "Sin zona", stores: z._count._all }))
          .sort((a, b) => b.stores - a.stores);

        // ── AOV mensual (últimos 6 meses) — desde resultados pre-calculados ────
        const aov = aovWindows.map(({ monthStart }, idx) => {
          const agg = aovMonthly[idx];
          const total = toNumOrZero(agg._sum.total ?? 0);
          const orders = agg._count._all;
          return {
            month: monthFmt.format(monthStart),
            aov: orders > 0 ? Math.round((total / orders) * 100) / 100 : 0,
            orders,
          };
        });

        // ── Product velocity: top productos por unidades vendidas (mes en curso) ─
        const productVelocity = itemAgg.map((it) => ({
          productId: it.productId,
          name: it.name,
          units: it._sum.quantity ?? 0,
          revenue: toNumOrZero(it._sum.price ?? 0),
        }));

        // ── Order status funnel + cancellation rate ────────────────────────────
        const statusMap = new Map(statusBreakdown.map((s) => [s.status, s._count._all]));
        const totalLast30 = Array.from(statusMap.values()).reduce((s, n) => s + n, 0);
        const orderFunnel = [
          { status: "pendiente", label: "Pendiente", count: statusMap.get("pendiente") ?? 0 },
          { status: "confirmado", label: "Confirmado", count: statusMap.get("confirmado") ?? 0 },
          { status: "en_camino", label: "En camino", count: statusMap.get("en_camino") ?? 0 },
          { status: "entregado", label: "Entregado", count: statusMap.get("entregado") ?? 0 },
          { status: "cancelado", label: "Cancelado", count: statusMap.get("cancelado") ?? 0 },
        ];
        const cancelRate =
          totalLast30 > 0 ? ((statusMap.get("cancelado") ?? 0) / totalLast30) * 100 : 0;
        const completionRate =
          totalLast30 > 0 ? ((statusMap.get("entregado") ?? 0) / totalLast30) * 100 : 0;

        // ── Hour-of-day heatmap: cuándo compran los clientes ───────────────────
        // Buckets por día-de-semana (0=Lun, 6=Dom) × hora (0-23). Devolvemos solo
        // celdas con count > 0 para optimizar payload.
        const heatmap: number[][] = Array(7)
          .fill(0)
          .map(() => Array(24).fill(0));
        for (const o of ordersForHeatmap) {
          // JS getDay() = 0 (Sun) - 6 (Sat). Convertimos a 0=Lun..6=Dom.
          const day = (o.createdAt.getDay() + 6) % 7;
          const hour = o.createdAt.getHours();
          heatmap[day][hour]++;
        }
        // Hora pico — para mostrar como insight badge
        let peakDay = 0,
          peakHour = 0,
          peakCount = 0;
        for (let d = 0; d < 7; d++) {
          for (let h = 0; h < 24; h++) {
            if (heatmap[d][h] > peakCount) {
              peakCount = heatmap[d][h];
              peakDay = d;
              peakHour = h;
            }
          }
        }

        // ── Channel breakdown: direct vs marketplace vs wholesale ──────────────
        const channels = channelBreakdown.map((c) => ({
          channel: c.source,
          orders: c._count._all,
          revenue: toNumOrZero(c._sum.total ?? 0),
        }));

        // ── Repeat customer rate: % clientes que compraron 2+ veces ────────────
        const totalCustomers = customerOrderCounts.length;
        const repeatCustomers = customerOrderCounts.filter((c) => c._count._all >= 2).length;
        const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
        const avgOrdersPerCustomer =
          totalCustomers > 0
            ? customerOrderCounts.reduce((s, c) => s + c._count._all, 0) / totalCustomers
            : 0;

        // ── Stock alerts cross-tenant: productos con stock bajo ────────────────
        // Product no tiene relación `tenant` definida en schema, así que hacemos
        // 1 query adicional para los tenants de los productos en stock bajo.
        // Un solo stock mínimo (09-10): el propio o el global de cada negocio.
        const minimosPorNegocio = await minimosGlobalesPorNegocio(lowStockCandidatos.map((p) => p.tenantId));
        const lowStockProducts = lowStockCandidatos
          .map((p) => ({ p, minimoGlobal: minimosPorNegocio.get(p.tenantId) ?? STOCK_MINIMO_GLOBAL_POR_DEFECTO }))
          .filter(({ p, minimoGlobal }) => enStockBajo(p, minimoGlobal))
          .slice(0, 10)
          .map(({ p, minimoGlobal }) => ({ ...p, stockMin: stockMinimoDe(p, minimoGlobal) }));
        const stockTenantIds = Array.from(new Set(lowStockProducts.map((p) => p.tenantId)));
        const stockTenants = stockTenantIds.length
          ? await prisma.tenant.findMany({
              where: { id: { in: stockTenantIds } },
              select: { id: true, name: true, slug: true },
            })
          : [];
        const stockTenantById = new Map(stockTenants.map((t) => [t.id, t]));
        const stockAlerts = lowStockProducts.map((p) => {
          const t = stockTenantById.get(p.tenantId);
          return {
            productId: p.id,
            name: p.name,
            stock: p.stock ?? 0,
            stockMin: p.stockMin,
            tenantName: t?.name ?? "(desconocido)",
            tenantSlug: t?.slug ?? p.tenantId,
          };
        });

        return {
          cohorts,
          mrrByPlan,
          topCustomers,
          paymentMethods,
          dailyActiveStores,
          geographic,
          aov,
          productVelocity,
          orderFunnel,
          cancelRate,
          completionRate,
          heatmap,
          peakDay,
          peakHour,
          peakCount,
          channels,
          repeatRate,
          repeatCustomers,
          totalCustomers,
          avgOrdersPerCustomer,
          stockAlerts,
        };
      },
    );

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=120" },
    });
  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
