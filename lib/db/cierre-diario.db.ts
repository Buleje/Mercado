import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CierreDiarioPreview {
  ventas: {
    total: number;
    cantidad: number;
    ticketPromedio: number;
    mejorHora: string | null;
    productoTop: string | null;
  };
  fiados: {
    cobradosHoy: number;
    nuevosHoy: number;
    vencidos: number;
  };
  caja: {
    efectivoEsperado: number;
  };
  stockAlertas: { nombre: string; stock: number; stockMin: number }[];
  fecha: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPeruDayBounds(): { startOfDay: Date; endOfDay: Date; fecha: string } {
  const now = new Date();
  const peruOffset = -5 * 60;
  const localNow = new Date(now.getTime() + (peruOffset - now.getTimezoneOffset()) * 60000);
  const startOfDay = new Date(Date.UTC(localNow.getFullYear(), localNow.getMonth(), localNow.getDate(), 5, 0, 0));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const fecha = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
  return { startOfDay, endOfDay, fecha };
}

type DecimalField = { toNumber(): number; toFixed(d?: number): string; toString(): string } | number | string | null;

function computeBestHour(ventas: { createdAt: Date; total: DecimalField }[]): string | null {
  if (ventas.length === 0) return null;
  const hourMap: Record<number, { count: number; total: number }> = {};
  for (const v of ventas) {
    const h = new Date(v.createdAt).getUTCHours() - 5;
    const hour = h < 0 ? h + 24 : h;
    if (!hourMap[hour]) hourMap[hour] = { count: 0, total: 0 };
    hourMap[hour].count++;
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
  return `${String(bestHour).padStart(2, "0")}:00 - ${String(bestHour + 1).padStart(2, "0")}:00 (${maxCount} ventas)`;
}

// ── DB Class ──────────────────────────────────────────────────────────────────

export const CierreDiarioDB = {
  async getPreview(tenantId: string): Promise<CierreDiarioPreview> {
    const { startOfDay, endOfDay, fecha } = getPeruDayBounds();

    const [
      ventasResult,
      ventasDetalleResult,
      productoTopResult,
      fiadosCobradosResult,
      fiadosNuevosResult,
      fiadosVencidosResult,
      stockAlertasResult,
    ] = await Promise.allSettled([
      prisma.sale.aggregate({
        where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
        _sum: { total: true },
        _count: true,
        _avg: { total: true },
      }),
      prisma.sale.findMany({
        where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
        select: { createdAt: true, total: true, payment: true },
        take: 2000,
      }),
      prisma.saleItem.groupBy({
        by: ["productId"],
        where: { sale: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 1,
      }),
      prisma.fiadoCuota.aggregate({
        where: { fiado: { tenantId }, pagadoEn: { gte: startOfDay, lt: endOfDay } },
        _sum: { monto: true },
      }).catch(() => ({ _sum: { monto: null } })),
      prisma.fiado.aggregate({
        where: { tenantId, createdAt: { gte: startOfDay, lt: endOfDay } },
        _sum: { total: true },
      }).catch(() => ({ _sum: { total: null } })),
      prisma.fiado.count({
        where: { tenantId, status: "VENCIDO" },
      }).catch(() => 0),
      prisma.product.findMany({
        where: {
          tenantId, active: true, deletedAt: null, stock: { not: null },
          OR: [
            { stockMin: { not: null }, stock: { lte: 5 } },
            { stockMin: null, stock: { lte: 5 } },
          ],
        },
        select: { name: true, stock: true, stockMin: true },
        take: 20,
      }),
    ]);

    // Extract safely
    const ventasAgg = ventasResult.status === "fulfilled" ? ventasResult.value : { _sum: { total: null }, _count: 0, _avg: { total: null } };
    const ventasDetalle = ventasDetalleResult.status === "fulfilled" ? ventasDetalleResult.value : [];
    const productoTopRaw = productoTopResult.status === "fulfilled" ? productoTopResult.value : [];
    const fiadosCobrados = fiadosCobradosResult.status === "fulfilled" ? Number(fiadosCobradosResult.value._sum?.monto ?? 0) : 0;
    const fiadosNuevos = fiadosNuevosResult.status === "fulfilled" ? Number(fiadosNuevosResult.value._sum?.total ?? 0) : 0;
    const fiadosVencidos = fiadosVencidosResult.status === "fulfilled" ? (typeof fiadosVencidosResult.value === "number" ? fiadosVencidosResult.value : 0) : 0;
    const stockAlertas = stockAlertasResult.status === "fulfilled"
      ? stockAlertasResult.value.map((p) => ({ nombre: p.name, stock: p.stock ?? 0, stockMin: p.stockMin ?? 5 }))
      : [];

    const filteredStockAlertas = stockAlertas.filter((p) => p.stock <= p.stockMin);
    const mejorHora = computeBestHour(ventasDetalle);
    const efectivoEsperado = ventasDetalle
      .filter((v) => v.payment === "efectivo")
      .reduce((sum, v) => sum + toNumOrZero(v.total), 0);

    // Product top name
    let productoTop: string | null = null;
    if (productoTopRaw.length > 0) {
      const topProductId = productoTopRaw[0].productId;
      const topProduct = await prisma.product.findUnique({ where: { id: topProductId }, select: { name: true } });
      const qty = productoTopRaw[0]._sum?.quantity ?? 0;
      productoTop = topProduct ? `${topProduct.name} (${qty} und)` : null;
    }

    const totalVentas = Number(ventasAgg._sum?.total ?? 0);
    const cantidadVentas = ventasAgg._count ?? 0;
    const ticketPromedio = Number(ventasAgg._avg?.total ?? 0);

    logger.info("[CierreDiarioDB] getPreview", { tenantId, fecha, cantidadVentas });

    return {
      ventas: {
        total: totalVentas,
        cantidad: cantidadVentas,
        ticketPromedio: Math.round(ticketPromedio * 100) / 100,
        mejorHora,
        productoTop,
      },
      fiados: { cobradosHoy: fiadosCobrados, nuevosHoy: fiadosNuevos, vencidos: fiadosVencidos },
      caja: { efectivoEsperado: Math.round(efectivoEsperado * 100) / 100 },
      stockAlertas: filteredStockAlertas,
      fecha,
    };
  },
};
