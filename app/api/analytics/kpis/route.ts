export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/analytics/kpis
 * Returns 6 real-time business KPIs in a single parallel call.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart); // todayStart IS yesterdayEnd

    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(thisMonthStart);

    const tenantFilter = { tenantId: auth.tenantId };

    const [
      ventasHoy,
      ventasAyer,
      ventasMes,
      ventasMesAnterior,
      costosHoyItems,
      costosMesItems,
      costosMesAnteriorItems,
      fiadosPendientes,
      stockCritico,
    ] = await Promise.all([
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
      // 9. Stock crítico
      prisma.product.count({
        where: {
          ...tenantFilter,
          active: true,
          deletedAt: null,
          stockMin: { not: null },
          stock: { not: null },
          AND: [
            // Prisma doesn't support field comparison directly,
            // so we filter in-memory below
          ],
        },
      }),
    ]);

    // Stock crítico: need to compare stock <= stockMin, Prisma can't do field comparison
    // Re-query with both fields and filter in JS
    const productsForStockCheck = await prisma.product.findMany({
      where: {
        ...tenantFilter,
        active: true,
        deletedAt: null,
        stockMin: { not: null },
        stock: { not: null },
      },
      select: { stock: true, stockMin: true },
    });
    const stockCriticoCount = productsForStockCheck.filter(
      (p) => p.stock !== null && p.stockMin !== null && p.stock <= p.stockMin
    ).length;

    // Helper: calculate total cost from SaleItems
    function calcCost(items: { costPrice: number | null; quantity: number; product: { costPrice: number | null } }[]): number {
      return items.reduce((sum, item) => {
        const cost = item.costPrice ?? item.product.costPrice ?? 0;
        return sum + cost * item.quantity;
      }, 0);
    }

    // Helper: calculate % change
    function pctChange(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 10000) / 100;
    }

    const ingresosHoy = ventasHoy._sum.total ?? 0;
    const ingresosAyer = ventasAyer._sum.total ?? 0;
    const txHoy = ventasHoy._count.id;
    const txAyer = ventasAyer._count.id;

    const ingresosMes = ventasMes._sum.total ?? 0;
    const txMes = ventasMes._count.id;
    const ingresosMesAnt = ventasMesAnterior._sum.total ?? 0;
    const txMesAnt = ventasMesAnterior._count.id;

    const ticketPromedioMes = txMes > 0 ? ingresosMes / txMes : 0;
    const ticketPromedioMesAnt = txMesAnt > 0 ? ingresosMesAnt / txMesAnt : 0;

    const costosHoy = calcCost(costosHoyItems);
    const costosMes = calcCost(costosMesItems);
    const costosMesAnt = calcCost(costosMesAnteriorItems);

    const margenHoy = ingresosHoy > 0 ? ((ingresosHoy - costosHoy) / ingresosHoy) * 100 : 0;
    const margenMesAnt = ingresosMesAnt > 0 ? ((ingresosMesAnt - costosMesAnt) / ingresosMesAnt) * 100 : 0;

    const fiadoSaldo = fiadosPendientes._sum.saldo
      ? Number(fiadosPendientes._sum.saldo)
      : 0;

    return NextResponse.json({
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
    });
  } catch (e) {
    console.error("[analytics/kpis] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
