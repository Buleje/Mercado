import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { getOrSet } from "@/lib/cache";

/**
 * GET /api/analytics/kpis
 * Returns 6 real-time business KPIs in a single parallel call.
 *
 * Audit 2026-05-17 P-P0-5: cacheado con TTL 30s.
 * Endpoint llamado cada 30s por polling del DashboardTab → sin cache
 * disparaba +40% CPU DB en horas pico. Con TTL 30s la mayoría de hits
 * golpean cache.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const cacheKey = `admin:kpis:${auth.tenantId}`;
    const payload = await getOrSet<Record<string, unknown>>(cacheKey, 30, async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart); // todayStart IS yesterdayEnd

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(thisMonthStart);

    const tenantFilter = { tenantId: auth.tenantId };

    // Audit 2026-05-17 P-P0-2: stockCritico unificado en el mismo Promise.all.
    // Antes había 2 round-trips: el count del Promise.all (inútil porque
    // Prisma no compara campos) + un findMany aislado fuera. Ahora una sola
    // findMany dentro del Promise.all elimina el round-trip extra (~100-200ms).
    const [
      ventasHoy,
      ventasAyer,
      ventasMes,
      ventasMesAnterior,
      costosHoyItems,
      costosMesItems,
      costosMesAnteriorItems,
      fiadosPendientes,
      productsForStockCheck,
    ] = await withDbRetry(() => Promise.all([
      // 1. Ventas hoy
      prisma.sale.aggregate({
        where: { ...tenantFilter, createdAt: { gte: todayStart } },
        _sum: { total: true },
        _count: { id: true },
      }),
      // 2. Ventas ayer
      prisma.sale.aggregate({
        where: { ...tenantFilter, createdAt: { gte: yesterdayStart, lt: yesterdayEnd } },
        _sum: { total: true },
        _count: { id: true },
      }),
      // 3. Ventas este mes
      prisma.sale.aggregate({
        where: { ...tenantFilter, createdAt: { gte: thisMonthStart } },
        _sum: { total: true },
        _count: { id: true },
      }),
      // 4. Ventas mes anterior
      prisma.sale.aggregate({
        where: { ...tenantFilter, createdAt: { gte: lastMonthStart, lt: lastMonthEnd } },
        _sum: { total: true },
        _count: { id: true },
      }),
      // 5. Costos hoy (para margen operativo)
      prisma.saleItem.findMany({
        where: { sale: { ...tenantFilter, createdAt: { gte: todayStart } } },
        select: { costPrice: true, quantity: true, product: { select: { costPrice: true } } },
      }),
      // 6. Costos este mes
      prisma.saleItem.findMany({
        where: { sale: { ...tenantFilter, createdAt: { gte: thisMonthStart } } },
        select: { costPrice: true, quantity: true, product: { select: { costPrice: true } } },
      }),
      // 7. Costos mes anterior
      prisma.saleItem.findMany({
        where: { sale: { ...tenantFilter, createdAt: { gte: lastMonthStart, lt: lastMonthEnd } } },
        select: { costPrice: true, quantity: true, product: { select: { costPrice: true } } },
      }),
      // 8. Fiados pendientes
      prisma.fiado.aggregate({
        where: { ...tenantFilter, status: "ACTIVO" },
        _sum: { saldo: true },
        _count: { id: true },
      }),
      // 9. Stock crítico — Prisma no compara campos, traemos stock+stockMin y comparamos JS
      prisma.product.findMany({
        where: {
          ...tenantFilter,
          active: true,
          deletedAt: null,
          stockMin: { not: null },
          stock: { not: null },
        },
        select: { stock: true, stockMin: true },
      }),
    ]));

    const stockCriticoCount = productsForStockCheck.filter(
      (p) => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin
    ).length;

    // Helper: calculate total cost from SaleItems (TD-018: costPrice es Decimal)
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

    // Helper: calculate % change
    function pctChange(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 10000) / 100;
    }

    // TD-018: _sum.total ahora es Prisma.Decimal | null → convertir con toNumOrZero
    const ingresosHoy = toNumOrZero(ventasHoy._sum.total);
    const ingresosAyer = toNumOrZero(ventasAyer._sum.total);
    const txHoy = ventasHoy._count.id;
    const txAyer = ventasAyer._count.id;

    const ingresosMes = toNumOrZero(ventasMes._sum.total);
    const txMes = ventasMes._count.id;
    const ingresosMesAnt = toNumOrZero(ventasMesAnterior._sum.total);
    const txMesAnt = ventasMesAnterior._count.id;

    const ticketPromedioMes = txMes > 0 ? ingresosMes / txMes : 0;
    const ticketPromedioMesAnt = txMesAnt > 0 ? ingresosMesAnt / txMesAnt : 0;

    const costosHoy = calcCost(costosHoyItems);
    const _costosMes = calcCost(costosMesItems);
    const costosMesAnt = calcCost(costosMesAnteriorItems);

    const margenHoy = ingresosHoy > 0 ? ((ingresosHoy - costosHoy) / ingresosHoy) * 100 : 0;
    const margenMesAnt = ingresosMesAnt > 0 ? ((ingresosMesAnt - costosMesAnt) / ingresosMesAnt) * 100 : 0;

    const fiadoSaldo = toNumOrZero(fiadosPendientes._sum.saldo);

    return {
      ingresosHoy: {
        valor: Math.round(ingresosHoy * 100) / 100,
        cambio: pctChange(ingresosHoy, ingresosAyer),
      },
      ticketPromedio: {
        valor: Math.round(ticketPromedioMes * 100) / 100,
        cambio: pctChange(ticketPromedioMes, ticketPromedioMesAnt),
      },
      transaccionesHoy: {
        valor: txHoy,
        cambio: pctChange(txHoy, txAyer),
      },
      margenOperativo: {
        valor: Math.round(margenHoy * 100) / 100,
        cambio: pctChange(margenHoy, margenMesAnt),
      },
      fiadoPendiente: {
        valor: Math.round(fiadoSaldo * 100) / 100,
        count: fiadosPendientes._count.id,
      },
      stockCritico: {
        valor: stockCriticoCount,
      },
    };
    });
    return NextResponse.json(payload);
  } catch (e) {
    logger.error("[analytics/kpis] GET error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
