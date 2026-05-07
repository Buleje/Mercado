import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;

  try {
    // Date boundaries for today (Peru timezone UTC-5)
    const now = new Date();
    const peruOffset = -5 * 60; // minutes
    const localNow = new Date(now.getTime() + (peruOffset - now.getTimezoneOffset()) * 60000);
    const startOfDay = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 5, 0, 0)); // 00:00 Peru = 05:00 UTC
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const fecha = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;

    // Run all queries in parallel — use allSettled so one failure doesn't block others
    const [
      ventasResult,
      ventasDetalleResult,
      productoTopResult,
      fiadosCobradosResult,
      fiadosNuevosResult,
      fiadosVencidosResult,
      stockAlertasResult,
    ] = await Promise.allSettled([
      // Query 1: Ventas del día (aggregate)
      prisma.sale.aggregate({
        where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
        _sum: { total: true },
        _count: true,
        _avg: { total: true },
      }),

      // Query 2: Ventas detalle para mejor hora y efectivo
      prisma.sale.findMany({
        where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
        select: { createdAt: true, total: true, payment: true },
      }),

      // Query 3: Producto más vendido
      prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 1,
      }),

      // Query 4: Fiados cobrados hoy
      prisma.fiadoCuota.aggregate({
        where: {
          fiado: { tenantId },
          pagadoEn: { gte: startOfDay, lt: endOfDay },
        },
        _sum: { monto: true },
      }).catch(() => ({ _sum: { monto: null } })),

      // Query 5: Fiados nuevos hoy
      prisma.fiado.aggregate({
        where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
        _sum: { total: true },
      }).catch(() => ({ _sum: { total: null } })),

      // Query 6: Fiados vencidos
      prisma.fiado.count({
        where: { tenantId, status: "VENCIDO" },
      }).catch(() => 0),

      // Query 7: Stock bajo (stock <= stockMin, or stock <= 5 if no stockMin)
      prisma.product.findMany({
        where: {
          tenantId,
          active: true,
          deletedAt: null,
          stock: { not: null },
          OR: [
            { stockMin: { not: null }, stock: { lte: 5 } },
            { stockMin: null, stock: { lte: 5 } },
          ],
        },
        select: { name: true, stock: true, stockMin: true },
        take: 20,
      }),
    ]);

    // Extract results safely
    const ventasAgg = ventasResult.status === "fulfilled" ? ventasResult.value : { _sum: { total: null }, _count: 0, _avg: { total: null } };
    const ventasDetalle = ventasDetalleResult.status === "fulfilled" ? ventasDetalleResult.value : [];
    const productoTopRaw = productoTopResult.status === "fulfilled" ? productoTopResult.value : [];

    const fiadosCobrados = fiadosCobradosResult.status === "fulfilled"
      ? Number(fiadosCobradosResult.value._sum?.monto ?? 0)
      : 0;
    const fiadosNuevos = fiadosNuevosResult.status === "fulfilled"
      ? Number(fiadosNuevosResult.value._sum?.total ?? 0)
      : 0;
    const fiadosVencidos = fiadosVencidosResult.status === "fulfilled"
      ? (typeof fiadosVencidosResult.value === "number" ? fiadosVencidosResult.value : 0)
      : 0;
    const stockAlertas = stockAlertasResult.status === "fulfilled"
      ? stockAlertasResult.value.map((p) => ({ nombre: p.name, stock: p.stock ?? 0, stockMin: p.stockMin ?? 5 }))
      : [];

    // Filter low stock properly (stock <= stockMin)
    const filteredStockAlertas = stockAlertas.filter(
      (p) => p.stock <= p.stockMin
    );

    // Compute best hour from sales detail
    let mejorHora: string | null = null;
    if (ventasDetalle.length > 0) {
      const hourMap: Record<number, { count: number; total: number }> = {};
      for (const v of ventasDetalle) {
        const h = new Date(v.createdAt).getUTCHours() - 5; // Peru offset
        const hour = h < 0 ? h + 24 : h;
        if (!hourMap[hour]) hourMap[hour] = { count: 0, total: 0 };
        hourMap[hour].count++;
        // TD-018: v.total es Decimal
        hourMap[hour].total += toNumOrZero(v.total);
      }
      let maxCount = 0;
      let bestHour = 0;
      for (const [h, data] of Object.entries(hourMap)) {
        if (data.count > maxCount) {
          maxCount = data.count;
          bestHour = Number(h);
        }
      }
      mejorHora = `${String(bestHour).padStart(2, "0")}:00 - ${String(bestHour + 1).padStart(2, "0")}:00 (${maxCount} ventas)`;
    }

    // Compute efectivo esperado (sales paid with efectivo)
    // TD-018: v.total es Decimal
    const efectivoEsperado = ventasDetalle
      .filter((v) => v.payment === "efectivo")
      .reduce((sum, v) => sum + toNumOrZero(v.total), 0);

    // Get product name for top product
    let productoTop: string | null = null;
    if (productoTopRaw.length > 0) {
      const topProductId = productoTopRaw[0].productId;
      // SECURITY 2026-05-05 (audit cross-tenant): defensive tenantId scope.
      const topProduct = await prisma.product.findFirst({
        where: { id: topProductId, tenantId },
        select: { name: true },
      });
      const qty = productoTopRaw[0]._sum?.quantity ?? 0;
      productoTop = topProduct ? `${topProduct.name} (${qty} und)` : null;
    }

    const totalVentas = Number(ventasAgg._sum?.total ?? 0);
    const cantidadVentas = ventasAgg._count ?? 0;
    const ticketPromedio = Number(ventasAgg._avg?.total ?? 0);

    return NextResponse.json({
      ventas: {
        total: totalVentas,
        cantidad: cantidadVentas,
        ticketPromedio: Math.round(ticketPromedio * 100) / 100,
        mejorHora,
        productoTop,
      },
      fiados: {
        cobradosHoy: fiadosCobrados,
        nuevosHoy: fiadosNuevos,
        vencidos: fiadosVencidos,
      },
      caja: {
        efectivoEsperado: Math.round(efectivoEsperado * 100) / 100,
      },
      stockAlertas: filteredStockAlertas,
      fecha,
    });
  } catch (e) {
    logger.error("[cierre-diario/preview] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al generar preview" }, { status: 503 });
  }
}
